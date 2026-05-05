import type { LearningChunk, QuizQuestion, SubtitleBlock } from '@/lib/schema'

const SYSTEM = `You are an English teacher helping Turkish learners. You respond ONLY with valid JSON, no markdown fences.

Schema for EACH response object:
{
  "chunks": [
    {
      "original": string,
      "translation_tr": string,
      "key_vocab": [{ "word": string, "meaning_tr": string, "example": string }],
      "grammar_note": string,
      "srt_indices": number[]
    }
  ],
  "quiz": [] 
}

Rules:
- Preserve meaning of subtitles; chunk by semantic units (roughly 2–6 subtitle lines together).
- Repair broken subtitle boundaries caused by SRT timing cuts (e.g., a word/phrase shifted to previous or next line).
- While repairing, stay strictly faithful to the subtitle text: do NOT invent new content, do NOT paraphrase freely, do NOT change speaker intent.
- You may merge adjacent lines and move boundary words to the correct neighboring sentence when clearly required by grammar/meaning.
- Keep sentence order the same as the subtitle flow. Do not reorder distant lines.
- key_vocab: 3–8 useful words/phrases per chunk with Turkish meanings.
- grammar_note: MUST be in Turkish and more detailed (2-4 sentences).
- grammar_note must explain sentence structure clearly: subject (ozne), verb (yuklem), object/complement (nesne/tumlec), tense/aspect, and why that structure is used in context.
- If there is no meaningful grammar point, return empty string. Never write grammar_note in English.
- srt_indices: 0-based indices into the numbered subtitle list provided (must match lines you used).
- For intermediate batches, set "quiz": [].
- The subtitle stream may include rolling-caption artifacts (same sentence repeated with overlapping times). Treat near-duplicate lines as a single sentence and do not repeat them in "original" or "translation_tr".
- IMPORTANT for "original": output corrected, fluent sentence groups reconstructed from the provided subtitle lines, but only using words already present in those lines/context.
`

export interface AiBatchResult {
  chunks: LearningChunk[]
  quiz: QuizQuestion[]
}

function stripJsonFence(raw: string): string {
  const t = raw.trim()
  if (t.startsWith('```')) {
    return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  }
  return t
}

export function chunkSubtitles(blocks: SubtitleBlock[], maxLinesPerChunk = 6): SubtitleBlock[][] {
  const out: SubtitleBlock[][] = []
  for (let i = 0; i < blocks.length; i += maxLinesPerChunk) {
    out.push(blocks.slice(i, i + maxLinesPerChunk))
  }
  return out
}

function formatSubtitleBatch(batch: SubtitleBlock[], globalOffset: number): string {
  return batch
    .map((b, j) => `${globalOffset + j}. [${b.startSec.toFixed(2)}–${b.endSec.toFixed(2)}s] ${b.text}`)
    .join('\n')
}

export function buildUserPromptForBatch(
  batch: SubtitleBlock[],
  globalStartIndex: number,
  batchIndex: number,
  totalBatches: number,
  prevContextLine?: string,
  nextContextLine?: string,
): string {
  const prevCtx = prevContextLine?.trim()
  const nextCtx = nextContextLine?.trim()
  return `Batch ${batchIndex + 1} of ${totalBatches}. Subtitle lines (index = position in FULL file, starting at ${globalStartIndex}):

${formatSubtitleBatch(batch, globalStartIndex)}

Boundary context (for fixing broken sentence splits across batch edges):
- Previous line (outside this batch): ${prevCtx || '(none)'}
- Next line (outside this batch): ${nextCtx || '(none)'}

Return JSON with "chunks" covering these lines and "quiz": [].
If you notice sentence fragments split across lines (or batch edge), fix the boundary by attaching words to the correct neighboring sentence while staying faithful to subtitle text.
If you still notice duplicate wording across adjacent lines, merge them into one semantic unit instead of repeating.`
}

export function buildQuizOnlyPrompt(fullTextSummary: string): string {
  return `Based on this English learning material (subtitles summary / key themes):
${fullTextSummary.slice(0, 12000)}

Return JSON: { "chunks": [], "quiz": [ ... exactly 10 multiple choice questions ... ] }

Each quiz item:
{
  "id": string,
  "prompt": string (English question),
  "options": [{ "id": string, "text": string }] (4 options),
  "correctOptionId": string
}

Questions should test vocabulary and comprehension. Mix difficulty. Output ONLY the JSON object.`
}

export function parseAiJson(raw: string, batchOffset = 0): AiBatchResult {
  const cleaned = stripJsonFence(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error('Model çıktısı geçerli JSON değil')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON kökü nesne olmalı')
  }
  const o = parsed as Record<string, unknown>
  const chunksRaw = Array.isArray(o.chunks) ? o.chunks : []
  const quizRaw = Array.isArray(o.quiz) ? o.quiz : []

  const chunks: LearningChunk[] = chunksRaw.map((c, i) => {
    if (!c || typeof c !== 'object') throw new Error('chunk geçersiz')
    const r = c as Record<string, unknown>
    const original = typeof r.original === 'string' ? r.original : ''
    const translation_tr = typeof r.translation_tr === 'string' ? r.translation_tr : ''
    const grammar_note =
      typeof r.grammar_note === 'string' && r.grammar_note ? r.grammar_note : undefined
    const key_vocab = Array.isArray(r.key_vocab)
      ? r.key_vocab
          .filter((k): k is Record<string, unknown> => !!k && typeof k === 'object')
          .map((k) => ({
            word: typeof k.word === 'string' ? k.word : '',
            meaning_tr: typeof k.meaning_tr === 'string' ? k.meaning_tr : undefined,
            example: typeof k.example === 'string' ? k.example : undefined,
          }))
          .filter((k) => k.word)
      : []
    const srtIndices = Array.isArray(r.srt_indices)
      ? r.srt_indices.filter((n): n is number => typeof n === 'number')
      : undefined

    return {
      id: `chunk-${batchOffset}-${i}`,
      original,
      translation_tr,
      key_vocab,
      grammar_note,
      srtIndices,
    }
  })

  const quiz: QuizQuestion[] = quizRaw.map((q, i) => {
    if (!q || typeof q !== 'object') throw new Error('quiz geçersiz')
    const r = q as Record<string, unknown>
    const options = Array.isArray(r.options)
      ? r.options
          .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
          .map((o, j) => ({
            id: typeof o.id === 'string' ? o.id : `opt-${i}-${j}`,
            text: typeof o.text === 'string' ? o.text : '',
          }))
      : []
    return {
      id: typeof r.id === 'string' ? r.id : `quiz-${i}`,
      prompt: typeof r.prompt === 'string' ? r.prompt : '',
      options,
      correctOptionId:
        typeof r.correctOptionId === 'string' ? r.correctOptionId : options[0]?.id ?? '',
    }
  })

  return { chunks, quiz }
}

export { SYSTEM as aiSystemPrompt }
