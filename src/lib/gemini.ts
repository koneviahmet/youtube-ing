import {
  aiSystemPrompt,
  buildSrtRepairPrompt,
  buildQuizOnlyPrompt,
  buildUserPromptForBatch,
  chunkSubtitles,
  parseAiJson,
  parseSrtRepairJson,
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

const srtRepairSystemPrompt = `You are a subtitle line repair assistant. Output ONLY valid JSON.

Goal:
- Repair broken sentence boundaries across neighboring subtitle lines.
- Keep subtitle content faithful.

Hard constraints:
- Do not invent words.
- Do not paraphrase.
- Do not change speaker intent.
- Keep indexes unchanged.
- Return one repaired text for each provided index.`

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

async function repairSubtitleBlocks(
  blocks: SubtitleBlock[],
  model: string,
  apiKey: string,
  onProgress?: (msg: string) => void,
  onDebugPrompt?: (event: PipelineDebugEvent) => void,
): Promise<SubtitleBlock[]> {
  if (!blocks.length) return blocks
  const repairBatches = chunkSubtitles(blocks, 20)
  const repaired = blocks.map((b) => ({ ...b }))
  let offset = 0

  for (let bi = 0; bi < repairBatches.length; bi++) {
    const batch = repairBatches[bi]
    onProgress?.(`Gemini (${model}): SRT düzeltme ${bi + 1}/${repairBatches.length}`)
    const prevContextLine = offset > 0 ? blocks[offset - 1]?.text : undefined
    const nextContextLine = blocks[offset + batch.length]?.text
    const prompt = buildSrtRepairPrompt(
      batch,
      offset,
      bi,
      repairBatches.length,
      prevContextLine,
      nextContextLine,
    )
    onDebugPrompt?.({
      phase: `SRT düzeltme ${bi + 1}/${repairBatches.length}`,
      prompt,
    })
    let text: string
    try {
      text = await generateJson(model, srtRepairSystemPrompt, prompt, apiKey)
    } catch {
      await new Promise((r) => setTimeout(r, 1200))
      text = await generateJson(model, srtRepairSystemPrompt, prompt, apiKey)
    }
    let repairedItems: ReturnType<typeof parseSrtRepairJson>
    try {
      repairedItems = parseSrtRepairJson(text)
    } catch (e) {
      onProgress?.(`SRT düzeltme uyarısı: ${String(e)} (orijinal satırlar korunuyor)`)
      offset += batch.length
      continue
    }
    const localMap = new Map<number, string>()
    for (const item of repairedItems) {
      localMap.set(item.index, item.text)
    }
    for (let i = 0; i < batch.length; i++) {
      const globalIdx = offset + i
      const candidate = localMap.get(globalIdx)?.trim()
      if (candidate) {
        repaired[globalIdx] = { ...repaired[globalIdx], text: candidate }
      }
    }
    offset += batch.length
  }

  return repaired
}

/** SRT partileri + 10 çoktan seçmeli sınav */
export async function runPipeline(
  blocks: SubtitleBlock[],
  modelId: string,
  userApiKey: string,
  onProgress?: (msg: string) => void,
  onDebugPrompt?: (event: PipelineDebugEvent) => void,
): Promise<{ repairedBlocks: SubtitleBlock[]; chunks: LearningChunk[]; quiz: QuizQuestion[] }> {
  const selected = modelId.trim()
  const model =
    !selected || selected === AUTO_GEMINI_MODEL_ID ? DEFAULT_GEMINI_MODEL_ID : selected
  onProgress?.(`Gemini (${model}): SRT metni AI ile düzeltiliyor…`)
  const repairedBlocks = await repairSubtitleBlocks(
    blocks,
    model,
    userApiKey,
    onProgress,
    onDebugPrompt,
  )
  const batches = chunkSubtitles(repairedBlocks, 6)
  const allChunks: LearningChunk[] = []
  let offset = 0

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]
    onProgress?.(`Gemini (${model}): parti ${bi + 1}/${batches.length}`)
    const prevContextLine = offset > 0 ? repairedBlocks[offset - 1]?.text : undefined
    const nextContextLine = repairedBlocks[offset + batch.length]?.text
    const user = buildUserPromptForBatch(
      batch,
      offset,
      bi,
      batches.length,
      prevContextLine,
      nextContextLine,
    )
    onDebugPrompt?.({
      phase: `Parti ${bi + 1}/${batches.length}`,
      prompt: user,
    })
    let text: string
    try {
      text = await generateJson(model, aiSystemPrompt, user, userApiKey)
    } catch {
      await new Promise((r) => setTimeout(r, 1500))
      text = await generateJson(model, aiSystemPrompt, user, userApiKey)
    }
    const parsed = parseAiJson(text, offset)
    allChunks.push(...parsed.chunks)
    offset += batch.length
  }

  const summary = allChunks.map((c) => c.original).join('\n')
  onProgress?.(`Gemini (${model}): sınav soruları…`)
  const quizPrompt = buildQuizOnlyPrompt(summary || repairedBlocks.map((b) => b.text).join('\n'))
  onDebugPrompt?.({
    phase: 'Sınav promptu',
    prompt: quizPrompt,
  })
  let quizText: string
  try {
    quizText = await generateJson(model, aiSystemPrompt, quizPrompt, userApiKey)
  } catch {
    await new Promise((r) => setTimeout(r, 1500))
    quizText = await generateJson(model, aiSystemPrompt, quizPrompt, userApiKey)
  }
  const quizParsed = parseAiJson(quizText, offset)
  let quiz = quizParsed.quiz
  if (quiz.length > 10) quiz = quiz.slice(0, 10)

  return { repairedBlocks, chunks: allChunks, quiz }
}
