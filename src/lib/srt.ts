import type { SubtitleBlock } from '@/lib/schema'
import { dedupeSubtitleBlocks } from '@/lib/subtitleCleanup'

const TS_RE = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2}),(\d{3})/

function tsToSec(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000
}

let idSeq = 0
function nextId(): string {
  idSeq += 1
  return `srt-${idSeq}`
}

/** Parse SubRip (.srt) file content into blocks */
export function parseSrt(content: string): SubtitleBlock[] {
  idSeq = 0
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const chunks = normalized.split(/\n\n+/).map((c) => c.trim()).filter(Boolean)
  const blocks: SubtitleBlock[] = []

  for (let i = 0; i < chunks.length; i++) {
    const lines = chunks[i].split('\n')
    if (lines.length < 2) continue

    let lineIdx = 0
    if (/^\d+$/.test(lines[0].trim())) lineIdx = 1

    const timeLine = lines[lineIdx]?.trim() ?? ''
    const m = timeLine.match(TS_RE)
    if (!m) continue

    const startSec = tsToSec(m[1], m[2], m[3], m[4])
    const endSec = tsToSec(m[5], m[6], m[7], m[8])
    const text = lines
      .slice(lineIdx + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim()

    if (!text) continue

    blocks.push({
      id: nextId(),
      index: blocks.length,
      startSec,
      endSec,
      text,
    })
  }

  return dedupeSubtitleBlocks(blocks)
}
