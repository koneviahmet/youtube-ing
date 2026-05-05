/** Application JSON schema — single document root for export/import & persistence */
export const SCHEMA_VERSION = 2 as const

export interface SubtitleBlock {
  id: string
  index: number
  startSec: number
  endSec: number
  text: string
}

export interface KeyVocabItem {
  word: string
  meaning_tr?: string
  example?: string
}

export interface LearningChunk {
  id: string
  /** Plain original subtitle text for this chunk */
  original: string
  translation_tr: string
  key_vocab: KeyVocabItem[]
  grammar_note?: string
  /** Indices of SRT blocks covered by this chunk (optional linkage) */
  srtIndices?: number[]
}

export interface QuizOption {
  id: string
  text: string
}

export interface QuizQuestion {
  id: string
  prompt: string
  options: QuizOption[]
  correctOptionId: string
}

export interface AiProcessingState {
  status: 'idle' | 'running' | 'error'
  message?: string
  lastError?: string
}

export interface AiPayload {
  chunks: LearningChunk[]
  quiz: QuizQuestion[]
  processing: AiProcessingState
}

export interface AppSnapshot {
  schemaVersion: typeof SCHEMA_VERSION
  videoUrlOrId: string
  panelRatio: number
  /** Google AI Gemini `generateContent` model id (ör. gemini-2.0-flash) */
  geminiModelId: string
  /** Açıksa AI ile işlemeden önce SRT satırları sınır onarımından geçer (varsayılan kapalı) */
  aiRepairSrt: boolean
  /** 0–1 left panel width fraction */
  srtBlocks: SubtitleBlock[]
  ai: AiPayload
  activeTab: 'cards' | 'games' | 'quiz'
  /** Last known playhead (optional persistence) */
  lastPlaybackSec?: number
}

export function emptyAiPayload(): AiPayload {
  return {
    chunks: [],
    quiz: [],
    processing: { status: 'idle' },
  }
}

export function defaultSnapshot(): AppSnapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    videoUrlOrId: '',
    panelRatio: 0.52,
    geminiModelId: 'gemini-2.0-flash',
    aiRepairSrt: false,
    srtBlocks: [],
    ai: emptyAiPayload(),
    activeTab: 'cards',
  }
}
