import type { LearningChunk } from '@/lib/schema'
import type { VocabCard } from '@/lib/vocabGames/types'

/** Tüm chunk’lardaki kelimeleri al; aynı kelime tekrarını atla (küçük harf) */
export function buildVocabPool(chunks: LearningChunk[]): VocabCard[] {
  const seen = new Set<string>()
  const out: VocabCard[] = []
  for (const chunk of chunks) {
    for (const v of chunk.key_vocab) {
      const w = v.word.trim()
      if (!w) continue
      const key = w.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const meaning = v.meaning_tr?.trim()
      out.push({
        id: `v-${out.length}-${key.replace(/[^a-z0-9]+/gi, '-')}`,
        word: w,
        meaning_tr: meaning && meaning.length ? meaning : '—',
        example: v.example?.trim() || undefined,
      })
    }
  }
  return out
}
