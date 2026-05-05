import {
  aiSystemPrompt,
  buildQuizOnlyPrompt,
  buildUserPromptForBatch,
  chunkSubtitles,
  parseAiJson,
} from '@/lib/promptEngineer'
import { AUTO_GEMINI_MODEL_ID, DEFAULT_GEMINI_MODEL_ID } from '@/lib/geminiModels'
import type { LearningChunk, QuizQuestion, SubtitleBlock } from '@/lib/schema'

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
  const res = await fetch('/api/gemini/generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
): Promise<string> {
  try {
    return await postGenerate(model, system, userText, true)
  } catch (e1) {
    const m1 = String(e1)
    if (!/400|unsupported|responseMimeType|mime/i.test(m1)) throw e1
    try {
      return await postGenerate(model, system, userText, false)
    } catch {
      await new Promise((r) => setTimeout(r, 1200))
      return postGenerate(model, system, userText, false)
    }
  }
}

/** SRT partileri + 10 çoktan seçmeli sınav */
export async function runPipeline(
  blocks: SubtitleBlock[],
  modelId: string,
  onProgress?: (msg: string) => void,
  onDebugPrompt?: (event: PipelineDebugEvent) => void,
): Promise<{ chunks: LearningChunk[]; quiz: QuizQuestion[] }> {
  const selected = modelId.trim()
  const model =
    !selected || selected === AUTO_GEMINI_MODEL_ID ? DEFAULT_GEMINI_MODEL_ID : selected
  const batches = chunkSubtitles(blocks, 6)
  const allChunks: LearningChunk[] = []
  let offset = 0

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]
    onProgress?.(`Gemini (${model}): parti ${bi + 1}/${batches.length}`)
    const user = buildUserPromptForBatch(batch, offset, bi, batches.length)
    onDebugPrompt?.({
      phase: `Parti ${bi + 1}/${batches.length}`,
      prompt: user,
    })
    let text: string
    try {
      text = await generateJson(model, aiSystemPrompt, user)
    } catch {
      await new Promise((r) => setTimeout(r, 1500))
      text = await generateJson(model, aiSystemPrompt, user)
    }
    const parsed = parseAiJson(text, offset)
    allChunks.push(...parsed.chunks)
    offset += batch.length
  }

  const summary = allChunks.map((c) => c.original).join('\n')
  onProgress?.(`Gemini (${model}): sınav soruları…`)
  const quizPrompt = buildQuizOnlyPrompt(summary || blocks.map((b) => b.text).join('\n'))
  onDebugPrompt?.({
    phase: 'Sınav promptu',
    prompt: quizPrompt,
  })
  let quizText: string
  try {
    quizText = await generateJson(model, aiSystemPrompt, quizPrompt)
  } catch {
    await new Promise((r) => setTimeout(r, 1500))
    quizText = await generateJson(model, aiSystemPrompt, quizPrompt)
  }
  const quizParsed = parseAiJson(quizText, offset)
  let quiz = quizParsed.quiz
  if (quiz.length > 10) quiz = quiz.slice(0, 10)

  return { chunks: allChunks, quiz }
}
