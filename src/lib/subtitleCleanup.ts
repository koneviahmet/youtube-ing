import type { SubtitleBlock } from '@/lib/schema'

const PUNCT_OR_SYMBOL_RE = /[^\p{L}\p{N}\s]/gu

function normalizeTextForCompare(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(PUNCT_OR_SYMBOL_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function shouldMergeDuplicate(prev: SubtitleBlock, next: SubtitleBlock): boolean {
  const prevNorm = normalizeTextForCompare(prev.text)
  const nextNorm = normalizeTextForCompare(next.text)
  if (!prevNorm || !nextNorm || prevNorm !== nextNorm) return false

  const overlapSec = Math.min(prev.endSec, next.endSec) - Math.max(prev.startSec, next.startSec)
  const gapSec = next.startSec - prev.endSec
  return overlapSec >= -0.2 || gapSec <= 0.35
}

/** Collapse repeated overlapping subtitle lines into single cues. */
export function dedupeSubtitleBlocks(blocks: SubtitleBlock[]): SubtitleBlock[] {
  const sorted = [...blocks].sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec)
  const merged: SubtitleBlock[] = []

  for (const b of sorted) {
    if (!merged.length) {
      merged.push({ ...b })
      continue
    }
    const prev = merged[merged.length - 1]
    if (!shouldMergeDuplicate(prev, b)) {
      merged.push({ ...b })
      continue
    }

    prev.startSec = Math.min(prev.startSec, b.startSec)
    prev.endSec = Math.max(prev.endSec, b.endSec)
    if (b.text.length > prev.text.length) prev.text = b.text
  }

  return merged.map((b, index) => ({ ...b, index }))
}
