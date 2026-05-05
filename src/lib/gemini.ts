import {
  aiSystemPrompt,
  buildQuizOnlyPrompt,
  buildUserPromptForBatch,
  chunkSubtitles,
  parseAiJson,
  type AiBatchResult,
} from '@/lib/promptEngineer'
import { AUTO_GEMINI_MODEL_ID, DEFAULT_GEMINI_MODEL_ID } from '@/lib/geminiModels'
import type { LearningChunk, QuizQuestion, SubtitleBlock } from '@/lib/schema'

const JSON_STRICT_SUFFIX = `\n\nIMPORTANT: Reply with ONE valid JSON object only. No markdown, no code fences, no commentary before or after the JSON.`

/** Kaldığı yerden devam için store/proxy ile taşınır */
export type PipelineResumeState =
  | { phase: 'chunks'; nextBatchIndex: number; partialChunks: LearningChunk[] }
  | { phase: 'quiz'; chunks: LearningChunk[] }

export class AiPipelineResumeError extends Error {
  override name = 'AiPipelineResumeError'

  constructor(
    message: string,
    public resume: PipelineResumeState,
  ) {
    super(message)
  }
}

export interface PipelineDebugEvent {
  phase: string
  prompt: string
}

interface GeminiGenerateBody {
  model: string
  systemInstruction?: { parts: { text: string }[] }
  contents: { role?: string; parts: { text: string }[] }[]
  generationConfig?: {
    maxOutputTokens?: number
    temperature?: number
    responseMimeType?: string
  }
}

function extractGeminiText(data: unknown): string {
  const o = data as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    promptFeedback?: { blockReason?: string }
    error?: { message?: string; status?: string }
  }
  if (o.error?.message) throw new Error(o.error.message)
  const c0 = o.candidates?.[0]
  const parts = c0?.content?.parts
  const text =
    parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim() ?? ''
  if (!text) {
    const br = o.promptFeedback?.blockReason
    throw new Error(br ? `İstek engellendi: ${br}` : 'Boş model yanıtı')
  }
  return text
}

async function postGenerate(
  model: string,
  system: string,
  userText: string,
  jsonMode: boolean,
  apiKey?: string,
): Promise<string> {
  const body: GeminiGenerateBody = {
    model,
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.25,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  }
  let res: Response
  try {
    res = await fetch('/api/gemini/generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-user-gemini-key': apiKey } : {}),
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    if (apiKey) {
      return postGenerateDirect(model, body, apiKey)
    }
    throw e
  }
  let text = await res.text()
  if (!res.ok) {
    // Some deployments do not expose the dev proxy route.
    if (apiKey && (res.status === 404 || res.status === 405)) {
      return postGenerateDirect(model, body, apiKey)
    }
    throw new Error(text.slice(0, 800) || `HTTP ${res.status}`)
  }
  let data: unknown
  try {
    data = JSON.parse(text) as unknown
  } catch {
    throw new Error(text.slice(0, 600) || 'Geçersiz API yanıtı')
  }
  return extractGeminiText(data)
}

async function postGenerateDirect(
  model: string,
  body: GeminiGenerateBody,
  apiKey: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: body.systemInstruction,
      contents: body.contents,
      generationConfig: body.generationConfig,
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(text.slice(0, 800) || `HTTP ${res.status}`)
  }
  let data: unknown
  try {
    data = JSON.parse(text) as unknown
  } catch {
    throw new Error(text.slice(0, 600) || 'Geçersiz API yanıtı')
  }
  return extractGeminiText(data)
}

/** JSON çıktısı için önce `responseMimeType`, desteklenmiyorsa düz metin ile dener */
async function generateJson(
  model: string,
  system: string,
  userText: string,
  apiKey?: string,
): Promise<string> {
  try {
    return await postGenerate(model, system, userText, true, apiKey)
  } catch (e1) {
    const m1 = String(e1)
    if (!/400|unsupported|responseMimeType|mime/i.test(m1)) throw e1
    try {
      return await postGenerate(model, system, userText, false, apiKey)
    } catch {
      await new Promise((r) => setTimeout(r, 1200))
      return postGenerate(model, system, userText, false, apiKey)
    }
  }
}

async function fetchBatchJson(
  model: string,
  user: string,
  userApiKey: string,
): Promise<string> {
  try {
    return await generateJson(model, aiSystemPrompt, user, userApiKey)
  } catch {
    await new Promise((r) => setTimeout(r, 1500))
    return generateJson(model, aiSystemPrompt, user, userApiKey)
  }
}

/**
 * Bir partide JSON parse başarısız olursa aynı partide daha katı talimatla bir kez daha dener.
 */
async function parseBatchWithRetry(
  model: string,
  user: string,
  userApiKey: string,
  offset: number,
): Promise<AiBatchResult> {
  let text = await fetchBatchJson(model, user, userApiKey)
  try {
    return parseAiJson(text, offset)
  } catch (firstParseErr) {
    await new Promise((r) => setTimeout(r, 1200))
    text = await fetchBatchJson(model, user + JSON_STRICT_SUFFIX, userApiKey)
    try {
      return parseAiJson(text, offset)
    } catch {
      throw firstParseErr
    }
  }
}

/** SRT partileri + 10 çoktan seçmeli sınav */
export async function runPipeline(
  blocks: SubtitleBlock[],
  modelId: string,
  userApiKey: string,
  onProgress?: (msg: string) => void,
  onDebugPrompt?: (event: PipelineDebugEvent) => void,
  resume?: PipelineResumeState,
): Promise<{ chunks: LearningChunk[]; quiz: QuizQuestion[] }> {
  const selected = modelId.trim()
  const model =
    !selected || selected === AUTO_GEMINI_MODEL_ID ? DEFAULT_GEMINI_MODEL_ID : selected
  const batches = chunkSubtitles(blocks, 6)
  let allChunks: LearningChunk[] = []
  let startBi = 0

  if (resume?.phase === 'chunks') {
    allChunks = [...resume.partialChunks]
    startBi = resume.nextBatchIndex
  } else if (resume?.phase === 'quiz') {
    allChunks = [...resume.chunks]
    startBi = batches.length
  }

  for (let bi = startBi; bi < batches.length; bi++) {
    const batch = batches[bi]
    let offset = 0
    for (let i = 0; i < bi; i++) offset += batches[i].length

    onProgress?.(`Gemini (${model}): parti ${bi + 1}/${batches.length}`)
    const user = buildUserPromptForBatch(batch, offset, bi, batches.length)
    onDebugPrompt?.({
      phase: `Parti ${bi + 1}/${batches.length}`,
      prompt: user,
    })
    try {
      const parsed = await parseBatchWithRetry(model, user, userApiKey, offset)
      allChunks.push(...parsed.chunks)
    } catch (e) {
      throw new AiPipelineResumeError(String(e), {
        phase: 'chunks',
        nextBatchIndex: bi,
        partialChunks: allChunks,
      })
    }
  }

  const summary = allChunks.map((c) => c.original).join('\n')
  onProgress?.(`Gemini (${model}): sınav soruları…`)
  const quizPrompt = buildQuizOnlyPrompt(summary || blocks.map((b) => b.text).join('\n'))
  onDebugPrompt?.({
    phase: 'Sınav promptu',
    prompt: quizPrompt,
  })
  const quizOffset = blocks.length
  try {
    let quizText = await fetchBatchJson(model, quizPrompt, userApiKey)
    let quizParsed: AiBatchResult
    try {
      quizParsed = parseAiJson(quizText, quizOffset)
    } catch (firstQuizParseErr) {
      await new Promise((r) => setTimeout(r, 1200))
      quizText = await fetchBatchJson(model, quizPrompt + JSON_STRICT_SUFFIX, userApiKey)
      try {
        quizParsed = parseAiJson(quizText, quizOffset)
      } catch {
        throw firstQuizParseErr
      }
    }
    let quiz = quizParsed.quiz
    if (quiz.length > 10) quiz = quiz.slice(0, 10)

    return { chunks: allChunks, quiz }
  } catch (e) {
    throw new AiPipelineResumeError(String(e), {
      phase: 'quiz',
      chunks: allChunks,
    })
  }
}
