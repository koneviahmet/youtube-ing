import {
  SCHEMA_VERSION,
  defaultSnapshot,
  emptyAiPayload,
  type AppSnapshot,
  type SubtitleBlock,
} from '@/lib/schema'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseBlocks(raw: unknown): SubtitleBlock[] {
  if (!Array.isArray(raw)) return []
  const out: SubtitleBlock[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const id = typeof item.id === 'string' ? item.id : ''
    const index = typeof item.index === 'number' ? item.index : out.length
    const startSec = typeof item.startSec === 'number' ? item.startSec : 0
    const endSec = typeof item.endSec === 'number' ? item.endSec : startSec
    const text = typeof item.text === 'string' ? item.text : ''
    if (!id || !text) continue
    out.push({ id, index, startSec, endSec, text })
  }
  return out.sort((a, b) => a.index - b.index)
}

/** Minimal validation; fills defaults for unknown fields */
export function parseImportedSnapshot(raw: unknown): AppSnapshot {
  const base = defaultSnapshot()
  if (!isRecord(raw)) return base

  const videoUrlOrId =
    typeof raw.videoUrlOrId === 'string' ? raw.videoUrlOrId : base.videoUrlOrId

  const geminiModelIdRaw =
    typeof raw.geminiModelId === 'string' ? raw.geminiModelId.trim() : ''
  const geminiModelId = geminiModelIdRaw || base.geminiModelId

  const aiRepairSrt = raw.aiRepairSrt === true

  const panelRatio =
    typeof raw.panelRatio === 'number' && raw.panelRatio > 0.15 && raw.panelRatio < 0.95
      ? raw.panelRatio
      : base.panelRatio

  const srtBlocks = parseBlocks(raw.srtBlocks)

  const ai = emptyAiPayload()
  if (isRecord(raw.ai)) {
    if (Array.isArray(raw.ai.chunks)) {
      ai.chunks = raw.ai.chunks.filter(isRecord).map((c, i) => ({
        id: typeof c.id === 'string' ? c.id : `chunk-${i}`,
        original: typeof c.original === 'string' ? c.original : '',
        translation_tr: typeof c.translation_tr === 'string' ? c.translation_tr : '',
        key_vocab: Array.isArray(c.key_vocab)
          ? c.key_vocab
              .filter(isRecord)
              .map((k) => ({
                word: typeof k.word === 'string' ? k.word : '',
                meaning_tr: typeof k.meaning_tr === 'string' ? k.meaning_tr : undefined,
                example: typeof k.example === 'string' ? k.example : undefined,
              }))
              .filter((k) => k.word)
          : [],
        grammar_note: typeof c.grammar_note === 'string' ? c.grammar_note : undefined,
        srtIndices: Array.isArray(c.srtIndices)
          ? c.srtIndices.filter((n): n is number => typeof n === 'number')
          : undefined,
        playbackStartSec:
          typeof c.playbackStartSec === 'number' && Number.isFinite(c.playbackStartSec)
            ? c.playbackStartSec
            : undefined,
        playbackEndSec:
          typeof c.playbackEndSec === 'number' && Number.isFinite(c.playbackEndSec)
            ? c.playbackEndSec
            : undefined,
      }))
    }
    if (Array.isArray(raw.ai.quiz)) {
      ai.quiz = raw.ai.quiz.filter(isRecord).map((q, i) => {
        const options = Array.isArray(q.options)
          ? q.options.filter(isRecord).map((o, j) => ({
              id: typeof o.id === 'string' ? o.id : `o-${j}`,
              text: typeof o.text === 'string' ? o.text : '',
            }))
          : []
        return {
          id: typeof q.id === 'string' ? q.id : `q-${i}`,
          prompt: typeof q.prompt === 'string' ? q.prompt : '',
          options,
          correctOptionId:
            typeof q.correctOptionId === 'string' ? q.correctOptionId : options[0]?.id ?? '',
        }
      })
    }
  }

  const activeTabRaw = raw.activeTab
  const activeTab =
    activeTabRaw === 'quiz' || activeTabRaw === 'games'
      ? activeTabRaw
      : activeTabRaw === 'practice'
        ? 'games'
        : 'cards'

  const lastPlaybackSec =
    typeof raw.lastPlaybackSec === 'number' && raw.lastPlaybackSec >= 0
      ? raw.lastPlaybackSec
      : undefined

  return {
    schemaVersion: SCHEMA_VERSION,
    videoUrlOrId,
    panelRatio,
    geminiModelId,
    aiRepairSrt,
    srtBlocks,
    ai,
    activeTab,
    lastPlaybackSec,
  }
}

/**
 * Dışa aktarılan JSON'da öğrenme kartlarının `original` metnini, düzenlenmiş SRT
 * satırlarıyla hizalar (`srtIndices` üzerinden).
 */
export function syncChunkOriginalsFromSrt(doc: AppSnapshot): void {
  const blocks = doc.srtBlocks
  for (const chunk of doc.ai.chunks) {
    const indices =
      chunk.srtIndices?.filter((n) => Number.isInteger(n) && n >= 0 && n < blocks.length) ?? []
    if (!indices.length) continue
    chunk.original = indices
      .map((i) => blocks[i]?.text ?? '')
      .join('\n')
      .trim()
  }
}
