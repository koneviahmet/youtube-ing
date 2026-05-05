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

/** Kayıtlı altyazı ile uyumluluk için (SRT değişince resume iptal) */
export function fingerprintSubtitleBlocks(blocks: SubtitleBlock[]): string {
  if (!blocks.length) return '0'
  const a = blocks[0]
  const b = blocks[blocks.length - 1]
  return `${blocks.length}|${a.startSec.toFixed(3)}|${b.endSec.toFixed(3)}|${a.text.slice(0, 64)}|${b.text.slice(0, 64)}`
}

export type AiPipelineCheckpointV1 = {
  v: 1
  fingerprint: string
  model: string
  phase: 'repair' | 'learning' | 'quiz'
  repairTotalBatches: number
  /** SRT düzeltme: bir sonraki çalıştırılacak batch indisi */
  repairNextBi: number
  /** Öğrenme partileri: bir sonraki çalıştırılacak batch indisi */
  learningNextBi: number
  learningTotalBatches: number
  repairedBlocks: SubtitleBlock[]
  learningChunks: LearningChunk[]
}

function sumBatchLineCount(batches: SubtitleBlock[][], endExclusive: number): number {
  let o = 0
  for (let i = 0; i < endExclusive; i++) o += batches[i]?.length ?? 0
  return o
}

export interface RunPipelineOptions {
  resume?: AiPipelineCheckpointV1 | null
  onCheckpoint?: (cp: AiPipelineCheckpointV1) => void
  /** false: SRT AI onarımını atla (varsayılan) */
  enableSrtRepair?: boolean
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
  options?: {
    startBi?: number
    repaired?: SubtitleBlock[]
    /** Bu parti API çağrısından hemen önce (resume bu batch indisinden devam eder) */
    onBeforeBatch?: (p: { nextBi: number; repaired: SubtitleBlock[]; totalBatches: number }) => void
  },
): Promise<SubtitleBlock[]> {
  if (!blocks.length) return blocks
  const repairBatches = chunkSubtitles(blocks, 20)
  const repaired = options?.repaired ?? blocks.map((b) => ({ ...b }))
  const startBi = options?.startBi ?? 0

  for (let bi = startBi; bi < repairBatches.length; bi++) {
    options?.onBeforeBatch?.({
      nextBi: bi,
      repaired,
      totalBatches: repairBatches.length,
    })
    const batch = repairBatches[bi]
    const offset = sumBatchLineCount(repairBatches, bi)
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
  }

  return repaired
}

function emitCheckpoint(
  onCheckpoint: RunPipelineOptions['onCheckpoint'],
  partial: Omit<AiPipelineCheckpointV1, 'v' | 'fingerprint' | 'model'> & {
    fingerprint: string
    model: string
  },
) {
  onCheckpoint?.({ v: 1, ...partial })
}

/** SRT partileri + 10 çoktan seçmeli sınav */
export async function runPipeline(
  blocks: SubtitleBlock[],
  modelId: string,
  userApiKey: string,
  onProgress?: (msg: string) => void,
  onDebugPrompt?: (event: PipelineDebugEvent) => void,
  runOptions?: RunPipelineOptions,
): Promise<{ repairedBlocks: SubtitleBlock[]; chunks: LearningChunk[]; quiz: QuizQuestion[] }> {
  const selected = modelId.trim()
  const model =
    !selected || selected === AUTO_GEMINI_MODEL_ID ? DEFAULT_GEMINI_MODEL_ID : selected
  const fingerprint = fingerprintSubtitleBlocks(blocks)
  const enableSrtRepair = runOptions?.enableSrtRepair ?? false
  let resume = runOptions?.resume ?? null
  const onCheckpoint = runOptions?.onCheckpoint

  if (resume?.phase === 'repair' && !enableSrtRepair) {
    throw new Error(
      'Kayıtlı işlem SRT düzeltme aşamasında. Devam için "SRT\'yi AI ile düzelt"i açın veya yeni "AI ile işle" başlatın.',
    )
  }

  if (resume && resume.v === 1 && resume.fingerprint !== fingerprint) {
    throw new Error('Altyazı kaynağı değişti; kaldığı yerden devam edilemez. "AI ile işle" ile sıfırdan çalıştırın.')
  }

  const repairBatches = chunkSubtitles(blocks, 20)
  const repairTotalBatches = repairBatches.length

  let repairedBlocks: SubtitleBlock[]
  let repairStartBi = 0

  const skipRepair =
    Boolean(resume && (resume.phase === 'learning' || resume.phase === 'quiz')) || !enableSrtRepair

  if (resume && (resume.phase === 'learning' || resume.phase === 'quiz')) {
    repairedBlocks = resume.repairedBlocks.map((b) => ({ ...b }))
  } else if (resume && resume.phase === 'repair') {
    repairedBlocks = resume.repairedBlocks.map((b) => ({ ...b }))
    repairStartBi = resume.repairNextBi
  } else {
    repairedBlocks = blocks.map((b) => ({ ...b }))
    repairStartBi = 0
  }

  if (!skipRepair) {
    onProgress?.(`Gemini (${model}): SRT metni AI ile düzeltiliyor…`)
    repairedBlocks = await repairSubtitleBlocks(blocks, model, userApiKey, onProgress, onDebugPrompt, {
      startBi: repairStartBi,
      repaired: repairedBlocks,
      onBeforeBatch: ({ nextBi, repaired, totalBatches }) => {
        emitCheckpoint(onCheckpoint, {
          fingerprint,
          model,
          phase: 'repair',
          repairTotalBatches: totalBatches,
          repairNextBi: nextBi,
          learningTotalBatches: chunkSubtitles(repaired, 6).length,
          learningNextBi: 0,
          repairedBlocks: repaired.map((b) => ({ ...b })),
          learningChunks: [],
        })
      },
    })
  } else if (!enableSrtRepair && !resume) {
    onProgress?.('SRT AI düzeltmesi kapalı; ham altyazı kullanılıyor.')
  }

  const learnBatches = chunkSubtitles(repairedBlocks, 6)
  const learningTotalBatches = learnBatches.length

  let allChunks: LearningChunk[] = []
  let learningStartBi = 0

  if (resume?.phase === 'learning') {
    allChunks = resume.learningChunks.map((c) => ({ ...c }))
    learningStartBi = resume.learningNextBi
  } else if (resume?.phase === 'quiz') {
    allChunks = resume.learningChunks.map((c) => ({ ...c }))
    learningStartBi = learningTotalBatches
  } else {
    learningStartBi = 0
  }

  for (let bi = learningStartBi; bi < learningTotalBatches; bi++) {
    const offset = sumBatchLineCount(learnBatches, bi)
    emitCheckpoint(onCheckpoint, {
      fingerprint,
      model,
      phase: 'learning',
      repairTotalBatches,
      repairNextBi: repairTotalBatches,
      learningTotalBatches,
      learningNextBi: bi,
      repairedBlocks: repairedBlocks.map((b) => ({ ...b })),
      learningChunks: allChunks.map((c) => ({ ...c })),
    })
    const batch = learnBatches[bi]
    onProgress?.(`Gemini (${model}): parti ${bi + 1}/${learningTotalBatches}`)
    const prevContextLine = offset > 0 ? repairedBlocks[offset - 1]?.text : undefined
    const nextContextLine = repairedBlocks[offset + batch.length]?.text
    const user = buildUserPromptForBatch(batch, offset, bi, learningTotalBatches, prevContextLine, nextContextLine)
    onDebugPrompt?.({
      phase: `Parti ${bi + 1}/${learningTotalBatches}`,
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
    emitCheckpoint(onCheckpoint, {
      fingerprint,
      model,
      phase: 'learning',
      repairTotalBatches,
      repairNextBi: repairTotalBatches,
      learningTotalBatches,
      learningNextBi: bi + 1,
      repairedBlocks: repairedBlocks.map((b) => ({ ...b })),
      learningChunks: allChunks.map((c) => ({ ...c })),
    })
  }

  const summary = allChunks.map((c) => c.original).join('\n')
  onProgress?.(`Gemini (${model}): sınav soruları…`)
  const quizPrompt = buildQuizOnlyPrompt(summary || repairedBlocks.map((b) => b.text).join('\n'))
  onDebugPrompt?.({
    phase: 'Sınav promptu',
    prompt: quizPrompt,
  })

  emitCheckpoint(onCheckpoint, {
    fingerprint,
    model,
    phase: 'quiz',
    repairTotalBatches,
    repairNextBi: repairTotalBatches,
    learningTotalBatches,
    learningNextBi: learningTotalBatches,
    repairedBlocks: repairedBlocks.map((b) => ({ ...b })),
    learningChunks: allChunks.map((c) => ({ ...c })),
  })

  let quizText: string
  try {
    quizText = await generateJson(model, aiSystemPrompt, quizPrompt, userApiKey)
  } catch {
    await new Promise((r) => setTimeout(r, 1500))
    quizText = await generateJson(model, aiSystemPrompt, quizPrompt, userApiKey)
  }
  const quizParsed = parseAiJson(quizText, allChunks.length)
  let quiz = quizParsed.quiz
  if (quiz.length > 10) quiz = quiz.slice(0, 10)

  return { repairedBlocks, chunks: allChunks, quiz }
}
