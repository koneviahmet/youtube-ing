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
- key_vocab: 3–8 useful words/phrases per chunk with Turkish meanings.
- grammar_note: MUST be in Turkish and more detailed (2-4 sentences).
- grammar_note must explain sentence structure clearly: subject (ozne), verb (yuklem), object/complement (nesne/tumlec), tense/aspect, and why that structure is used in context.
- If there is no meaningful grammar point, return empty string. Never write grammar_note in English.
- srt_indices: 0-based indices into the numbered subtitle list provided (must match lines you used).
- For intermediate batches, set "quiz": [].
- The subtitle stream may include rolling-caption artifacts (same sentence repeated with overlapping times). Treat near-duplicate lines as a single sentence and do not repeat them in "original" or "translation_tr".
`

export interface AiBatchResult {
  chunks: LearningChunk[]
  quiz: QuizQuestion[]
}

/** İlk ```json ... ``` veya ``` ... ``` bloğunu çıkar; yoksa metni olduğu gibi döner */
function stripJsonFence(raw: string): string {
  const t = raw.trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)
  if (fence?.[1]) return fence[1].trim()
  if (t.startsWith('```')) {
    return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  }
  return t
}

/** Metindeki ilk dengeli `{`…`}` nesnesini çıkarır (string içi kaçışlara dikkat). */
export function extractBalancedJsonObject(s: string): string | null {
  const start = s.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inString) {
      if (escape) {
        escape = false
      } else if (c === '\\') {
        escape = true
      } else if (c === '"') {
        inString = false
      }
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

/** Kökü `[` ile başlayan geçerli JSON dizisini ayıklar */
export function extractBalancedJsonArray(s: string): string | null {
  const start = s.indexOf('[')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inString) {
      if (escape) {
        escape = false
      } else if (c === '\\') {
        escape = true
      } else if (c === '"') {
        inString = false
      }
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

function tryFixCommonJsonIssues(s: string): string {
  let t = s.replace(/^\uFEFF/, '').trim()
  // Yaygın: son elemandan sonra virgül
  t = t.replace(/,\s*([}\]])/g, '$1')
  return t
}

/** Model bazen önce/sonra açıklama veya markdown döner; JSON'u güvenilir şekilde ayıkla */
export function normalizeModelJsonText(raw: string): string {
  const fenced = stripJsonFence(raw)
  const balancedObj =
    extractBalancedJsonObject(fenced) ?? extractBalancedJsonObject(raw)
  if (balancedObj) return balancedObj.trim()
  const balancedArr =
    extractBalancedJsonArray(fenced) ?? extractBalancedJsonArray(raw)
  if (balancedArr) return balancedArr.trim()
  return fenced.trim()
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
): string {
  return `Batch ${batchIndex + 1} of ${totalBatches}. Subtitle lines (index = position in FULL file, starting at ${globalStartIndex}):

${formatSubtitleBatch(batch, globalStartIndex)}

Return JSON with "chunks" covering these lines and "quiz": [].
If you still notice duplicate wording across adjacent lines, merge them into one semantic unit instead of repeating.`
}

export function buildQuizOnlyPrompt(fullTextSummary: string): string {
  return `Based on this English learning material (subtitles summary / key themes):
${fullTextSummary.slice(0, 12000)}

Return ONE JSON object only. Keys must be exactly "chunks" and "quiz" (no other top-level keys).
Shape: { "chunks": [], "quiz": [ ... exactly 10 multiple choice questions ... ] }

Each quiz item:
{
  "id": string,
  "prompt": string (English question),
  "options": [{ "id": string, "text": string }] (4 options),
  "correctOptionId": string
}

Questions should test vocabulary and comprehension. Mix difficulty. Output ONLY the raw JSON object, no markdown.`
}

/** Sınav çıktısı kesildiğinde veya şema tutmadığında: daha az soru, daha kısa bağlam */
export function buildQuizOnlyPromptFallback(
  fullTextSummary: string,
  maxQuestions = 5,
): string {
  const body = fullTextSummary.slice(0, 8000)
  return `English quiz for Turkish learners. Material:
${body}

Return ONE JSON object only. Keys exactly: "chunks" (empty array) and "quiz" (array).
Exactly ${maxQuestions} multiple-choice questions. Each item:
{ "id": string, "prompt": string, "options": [ { "id": string, "text": string } x4 ], "correctOptionId": string }

No markdown, no commentary — only the JSON object.`
}

function coerceQuizItem(q: unknown, i: number): QuizQuestion | null {
  if (!q || typeof q !== 'object') return null
  const r = q as Record<string, unknown>
  const rawOptions = Array.isArray(r.options) ? r.options : Array.isArray(r.choices) ? r.choices : []
  const options = rawOptions
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((o, j) => ({
      id: typeof o.id === 'string' ? o.id : `opt-${i}-${j}`,
      text: typeof o.text === 'string' ? o.text : '',
    }))
  const correctRaw = r.correctOptionId ?? r.answer ?? r.answerId
  return {
    id: typeof r.id === 'string' ? r.id : `quiz-${i}`,
    prompt: typeof r.prompt === 'string' ? r.prompt : typeof r.question === 'string' ? r.question : '',
    options,
    correctOptionId:
      typeof correctRaw === 'string' ? correctRaw : options[0]?.id ?? '',
  }
}

function parseQuizList(raw: unknown[]): QuizQuestion[] {
  return raw
    .map((q, i) => coerceQuizItem(q, i))
    .filter((q): q is QuizQuestion => q !== null && !!q.prompt)
}

export function parseAiJson(raw: string, batchOffset = 0): AiBatchResult {
  const seen = new Set<string>()
  const baseCandidates = [
    normalizeModelJsonText(raw),
    stripJsonFence(raw),
    tryFixCommonJsonIssues(normalizeModelJsonText(raw)),
    tryFixCommonJsonIssues(stripJsonFence(raw)),
    raw.trim(),
    tryFixCommonJsonIssues(raw.trim()),
  ].filter((s) => {
    if (!s) return false
    if (seen.has(s)) return false
    seen.add(s)
    return true
  })
  let parsed: unknown | undefined
  for (const cleaned of baseCandidates) {
    try {
      parsed = JSON.parse(cleaned)
      break
    } catch {
      /* try next */
    }
  }
  if (parsed === undefined) {
    const hint = raw.trim().slice(0, 120)
    throw new Error(
      `Model çıktısı geçerli JSON değil${hint ? ` (başlangıç: ${JSON.stringify(hint)}…)` : ''}`,
    )
  }

  if (Array.isArray(parsed) && parsed.length === 0) {
    return { chunks: [], quiz: [] }
  }
  if (Array.isArray(parsed) && parsed.length > 0) {
    const first = parsed[0]
    if (first && typeof first === 'object') {
      const fr = first as Record<string, unknown>
      const looksQuiz =
        'prompt' in fr ||
        'question' in fr ||
        (Array.isArray(fr.options) && !('original' in fr))
      if (looksQuiz && !('original' in fr && 'translation_tr' in fr)) {
        return {
          chunks: [],
          quiz: parseQuizList(parsed as unknown[]),
        }
      }
    }
    throw new Error('Model çıktısı: beklenmeyen kök dizi biçimi')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON kökü nesne veya dizi olmalı')
  }
  function unwrapNestedPayload(obj: Record<string, unknown>): Record<string, unknown> {
    const nestKeys = ['result', 'data', 'output', 'response'] as const
    for (const k of nestKeys) {
      const v = obj[k]
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const inner = v as Record<string, unknown>
        if (Array.isArray(inner.quiz) || Array.isArray(inner.chunks) || Array.isArray(inner.questions))
          return inner
      }
    }
    return obj
  }
  const o = unwrapNestedPayload(parsed as Record<string, unknown>)
  const chunksRaw = Array.isArray(o.chunks) ? o.chunks : []
  let quizRaw = Array.isArray(o.quiz) ? o.quiz : []
  if (!quizRaw.length && Array.isArray(o.questions)) quizRaw = o.questions
  if (!quizRaw.length && Array.isArray(o.items)) quizRaw = o.items

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

  const quiz = quizRaw
    .map((q, i) => coerceQuizItem(q, i))
    .filter((q): q is QuizQuestion => q !== null && (!!q.prompt || q.options.length > 0))

  return { chunks, quiz }
}

export { SYSTEM as aiSystemPrompt }
