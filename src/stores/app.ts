import { AiPipelineResumeError, runPipeline, type PipelineResumeState } from '@/lib/gemini'
import { parseImportedSnapshot, syncChunkOriginalsFromSrt } from '@/lib/snapshot'
import {
  SCHEMA_VERSION,
  defaultSnapshot,
  emptyAiPayload,
  type AppSnapshot,
  type SubtitleBlock,
} from '@/lib/schema'
import { parseSrt } from '@/lib/srt'
import { fetchAutoCaptionBlocks } from '@/lib/youtubeCaptions'
import { extractYoutubeVideoId } from '@/lib/youtube'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

const LS_KEY = 'youtube-ing-state-v1'
const BACKUP_KEY = 'youtube-ing-backup-v1'
const GEMINI_API_KEY_LS_KEY = 'youtube-ing-gemini-api-key-v1'
const USE_DEFAULT_IMPORTS = String(import.meta.env.VITE_USE_DEFAULT_IMPORTS ?? '').toLowerCase() === 'true'
const defaultJsonModules = import.meta.glob('../../youtube-ing-*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>
const defaultSrtModules = import.meta.glob('../../*.srt', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

function pickFirstModuleValue<T>(modules: Record<string, T>) {
  const firstPath = Object.keys(modules).sort()[0]
  return firstPath ? modules[firstPath] : undefined
}

function debounce(fn: () => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null
  return () => {
    if (t) clearTimeout(t)
    t = setTimeout(() => {
      t = null
      fn()
    }, ms)
  }
}

export const useAppStore = defineStore('app', () => {
  const snapshot = ref<AppSnapshot>(loadInitial())
  const geminiApiKey = ref(loadGeminiApiKey())
  /** Tamamlanmamış AI işlemini "Tekrar dene" ile sürdürmek için */
  const aiPipelineResume = ref<PipelineResumeState | null>(null)
  const playerCurrentSec = ref(snapshot.value.lastPlaybackSec ?? 0)
  function loadGeminiApiKey(): string {
    try {
      return (localStorage.getItem(GEMINI_API_KEY_LS_KEY) ?? '').trim()
    } catch {
      return ''
    }
  }

  function setGeminiApiKey(value: string) {
    const next = value.trim()
    geminiApiKey.value = next
    try {
      if (next) localStorage.setItem(GEMINI_API_KEY_LS_KEY, next)
      else localStorage.removeItem(GEMINI_API_KEY_LS_KEY)
    } catch {
      /* storage unavailable */
    }
  }

  const playing = ref(false)
  const srtError = ref<string | null>(null)
  const captionStatus = ref<{ state: 'idle' | 'loading' | 'ok' | 'error'; message?: string }>({
    state: 'idle',
  })
  const lastCaptionVideoId = ref<string | null>(null)
  const aiTimeline = ref<string[]>([])
  const aiDebugPrompt = ref('')
  const aiDebugOpen = ref(false)

  function pushAiTimeline(message: string) {
    aiTimeline.value = [...aiTimeline.value.slice(-7), message]
  }

  const videoError = computed(() => {
    const raw = snapshot.value.videoUrlOrId.trim()
    if (!raw) return null
    return extractYoutubeVideoId(raw) ? null : 'Geçerli bir YouTube bağlantısı veya video ID girin'
  })

  const videoId = computed(() => extractYoutubeVideoId(snapshot.value.videoUrlOrId))

  const activeCueIndex = computed(() => {
    const t = playerCurrentSec.value
    const blocks = snapshot.value.srtBlocks
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      if (t >= b.startSec && t < b.endSec) return i
    }
    for (let i = 0; i < blocks.length; i++) {
      if (t < blocks[i].startSec) return Math.max(0, i - 1)
    }
    return blocks.length ? blocks.length - 1 : -1
  })

  const hasBackup = ref(false)

  function loadSeedSnapshot(): AppSnapshot {
    if (!USE_DEFAULT_IMPORTS) return defaultSnapshot()
    try {
      const jsonRaw = pickFirstModuleValue(defaultJsonModules)
      if (!jsonRaw) return defaultSnapshot()
      const imported = parseImportedSnapshot(jsonRaw)
      const srtRaw = pickFirstModuleValue(defaultSrtModules)
      const seededBlocks = srtRaw ? parseSrt(srtRaw) : []
      if (seededBlocks.length) imported.srtBlocks = seededBlocks
      return imported
    } catch {
      return defaultSnapshot()
    }
  }

  function loadInitial(): AppSnapshot {
    if (USE_DEFAULT_IMPORTS) return loadSeedSnapshot()
    const seed = loadSeedSnapshot()
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return seed
      const parsed = parseImportedSnapshot(JSON.parse(raw) as unknown)
      return parsed
    } catch {
      return seed
    }
  }

  function refreshHasBackup() {
    try {
      hasBackup.value = !!localStorage.getItem(BACKUP_KEY)
    } catch {
      hasBackup.value = false
    }
  }

  function persist() {
    if (USE_DEFAULT_IMPORTS) return
    const out: AppSnapshot = {
      ...snapshot.value,
      lastPlaybackSec: playerCurrentSec.value,
    }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(out))
    } catch {
      /* quota */
    }
  }

  const schedulePersist = debounce(persist, 400)

  watch(
    snapshot,
    () => {
      schedulePersist()
    },
    { deep: true },
  )

  watch(playerCurrentSec, () => schedulePersist())

  function applyImported(data: AppSnapshot) {
    snapshot.value = data
    playerCurrentSec.value = data.lastPlaybackSec ?? 0
    srtError.value = null
    aiPipelineResume.value = null
    persist()
  }

  function setVideoUrlOrId(raw: string) {
    snapshot.value.videoUrlOrId = raw
  }

  function setPanelRatio(r: number) {
    snapshot.value.panelRatio = Math.min(0.9, Math.max(0.1, r))
  }

  /** Öğrenme kartları sekmede hangi chunk'lar düzenleme modunda (UI + dışa aktarma göstergesi) */
  const learningCardsEditingChunkIds = shallowRef<string[]>([])

  const learningCardsHasActiveEdit = computed(() => learningCardsEditingChunkIds.value.length > 0)

  function toggleLearningCardChunkEditing(chunkId: string) {
    const cur = learningCardsEditingChunkIds.value
    const i = cur.indexOf(chunkId)
    if (i >= 0) learningCardsEditingChunkIds.value = cur.filter((id) => id !== chunkId)
    else learningCardsEditingChunkIds.value = [...cur, chunkId]
  }

  function setActiveTab(tab: AppSnapshot['activeTab']) {
    snapshot.value.activeTab = tab
    if (tab !== 'cards') learningCardsEditingChunkIds.value = []
  }

  async function loadSrtFromFile(file: File) {
    srtError.value = null
    try {
      const text = await file.text()
      const blocks = parseSrt(text)
      if (!blocks.length) {
        srtError.value = 'SRT içinde uygun blok bulunamadı'
        return
      }
      snapshot.value.srtBlocks = blocks
      snapshot.value.ai = emptyAiPayload()
      aiPipelineResume.value = null
      captionStatus.value = { state: 'ok', message: `${blocks.length} satır yerel SRT yüklendi` }
    } catch (e) {
      srtError.value = String(e)
      captionStatus.value = { state: 'error', message: 'SRT dosyası yüklenemedi' }
    }
  }

  async function loadSrtFromVideo(videoIdOverride?: string) {
    const vid = videoIdOverride ?? videoId.value
    if (!vid) {
      captionStatus.value = { state: 'error', message: 'Önce geçerli bir YouTube video ID girin' }
      return
    }
    captionStatus.value = { state: 'loading', message: 'Videodan altyazı çekiliyor…' }
    try {
      const { blocks, track } = await fetchAutoCaptionBlocks(vid)
      snapshot.value.srtBlocks = blocks
      snapshot.value.ai = emptyAiPayload()
      aiPipelineResume.value = null
      srtError.value = null
      lastCaptionVideoId.value = vid
      const trackName = track.name ? ` (${track.name})` : ''
      captionStatus.value = {
        state: 'ok',
        message: `${blocks.length} satır altyazı yüklendi [${track.langCode}${trackName}]`,
      }
    } catch (e) {
      captionStatus.value = { state: 'error', message: `Altyazı çekilemedi: ${String(e)}` }
    }
  }

  function seekSeconds(sec: number, autoplay = false) {
    playerCurrentSec.value = Math.max(0, sec)
    window.dispatchEvent(
      new CustomEvent('youtube-ing-seek', {
        detail: { sec: Math.max(0, sec), autoplay },
      }),
    )
  }

  function resetAll() {
    snapshot.value = loadSeedSnapshot()
    playerCurrentSec.value = 0
    playing.value = false
    srtError.value = null
    captionStatus.value = { state: 'idle' }
    lastCaptionVideoId.value = null
    aiPipelineResume.value = null
    persist()
  }

  function backupCurrentSnapshot() {
    if (USE_DEFAULT_IMPORTS) return
    const doc: AppSnapshot = {
      ...snapshot.value,
      schemaVersion: SCHEMA_VERSION,
      lastPlaybackSec: playerCurrentSec.value,
    }
    localStorage.setItem(BACKUP_KEY, JSON.stringify(doc))
    refreshHasBackup()
  }

  function resetWithBackup() {
    if (USE_DEFAULT_IMPORTS) {
      resetAll()
      return
    }
    try {
      backupCurrentSnapshot()
    } catch {
      // backup işlemi başarısız olsa da sıfırlamaya izin ver
    }
    resetAll()
  }

  function restoreBackup() {
    if (USE_DEFAULT_IMPORTS) return
    try {
      const raw = localStorage.getItem(BACKUP_KEY)
      if (!raw) throw new Error('Kayıtlı yedek bulunamadı')
      const parsed = parseImportedSnapshot(JSON.parse(raw) as unknown)
      applyImported(parsed)
      refreshHasBackup()
    } catch (e) {
      srtError.value = `Yedek geri yükleme hatası: ${String(e)}`
    }
  }

  refreshHasBackup()

  function exportJsonBlob(): Blob {
    const doc = JSON.parse(JSON.stringify(snapshot.value)) as AppSnapshot
    doc.schemaVersion = SCHEMA_VERSION
    doc.lastPlaybackSec = playerCurrentSec.value
    syncChunkOriginalsFromSrt(doc)
    return new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  }

  function mergeSrtBlocksOnto(dragIdx: number, dropIdx: number) {
    const list = snapshot.value.srtBlocks
    if (
      dragIdx === dropIdx ||
      dragIdx < 0 ||
      dropIdx < 0 ||
      dragIdx >= list.length ||
      dropIdx >= list.length
    ) {
      return
    }
    const target = list[dropIdx]
    const dragged = list[dragIdx]

    const textT = target.text.replace(/\r\n/g, '\n').trim()
    const textD = dragged.text.replace(/\r\n/g, '\n').trim()
    const mergedText = [textT, textD].filter(Boolean).join('\n')

    let startSec = target.startSec
    let endSec = dragged.endSec
    if (endSec < startSec) {
      startSec = Math.min(target.startSec, dragged.startSec)
      endSec = Math.max(target.endSec, dragged.endSec)
    }

    const merged: SubtitleBlock = {
      ...target,
      text: mergedText,
      startSec,
      endSec,
    }

    const arr = [...list]
    arr.splice(dragIdx, 1)
    const newDropIdx = dragIdx < dropIdx ? dropIdx - 1 : dropIdx
    arr.splice(newDropIdx, 1, merged)

    snapshot.value.srtBlocks = arr.map((b, i) => ({
      ...b,
      index: i,
    }))
    snapshot.value.ai = emptyAiPayload()
    aiPipelineResume.value = null
  }

  async function importJsonFile(file: File) {
    try {
      const text = await file.text()
      const data = parseImportedSnapshot(JSON.parse(text) as unknown)
      applyImported(data)
    } catch (e) {
      srtError.value = `İçe aktarma hatası: ${String(e)}`
    }
  }

  async function generateFromAi(fromRetry = false) {
    const blocks = snapshot.value.srtBlocks
    if (!blocks.length) {
      snapshot.value.ai.processing = {
        status: 'error',
        lastError: 'Önce bir SRT dosyası yükleyin',
      }
      pushAiTimeline('Hata: Önce bir SRT dosyası yükleyin')
      return
    }
    const resume = fromRetry ? aiPipelineResume.value : undefined
    if (fromRetry && !resume) {
      snapshot.value.ai.processing = {
        status: 'error',
        lastError: 'Sürdürülecek yarım kalmış AI işlemi yok',
      }
      pushAiTimeline('Hata: Sürdürülecek kayıt yok')
      return
    }
    if (!fromRetry) {
      aiTimeline.value = ['AI işlemi başlatıldı']
      aiPipelineResume.value = null
    } else {
      pushAiTimeline('Kaldığı yerden devam ediliyor…')
    }
    aiDebugPrompt.value = ''
    snapshot.value.ai.processing = { status: 'running', message: 'Başlıyor…' }
    try {
      const { chunks, quiz } = await runPipeline(
        blocks,
        snapshot.value.geminiModelId,
        geminiApiKey.value,
        (msg) => {
          snapshot.value.ai.processing = { status: 'running', message: msg }
          pushAiTimeline(msg)
        },
        ({ phase, prompt }) => {
          aiDebugPrompt.value = `# ${phase}\n\n${prompt}`
          pushAiTimeline(`Prompt hazırlandı: ${phase}`)
        },
        resume ?? undefined,
      )
      aiPipelineResume.value = null
      snapshot.value.ai.chunks = chunks
      snapshot.value.ai.quiz = quiz
      snapshot.value.ai.processing = { status: 'idle', message: 'Tamamlandı' }
      pushAiTimeline(`Tamamlandı: ${chunks.length} kart, ${quiz.length} soru`)
    } catch (e) {
      if (e instanceof AiPipelineResumeError) {
        aiPipelineResume.value = e.resume
        if (e.resume.phase === 'chunks') {
          snapshot.value.ai.chunks = e.resume.partialChunks
          snapshot.value.ai.quiz = []
        } else {
          snapshot.value.ai.chunks = e.resume.chunks
        }
        const err = String(e.message)
        snapshot.value.ai.processing = { status: 'error', lastError: err }
        pushAiTimeline(`Hata: ${err}`)
      } else {
        const err = String(e)
        snapshot.value.ai.processing = { status: 'error', lastError: err }
        pushAiTimeline(`Hata: ${err}`)
      }
    }
  }

  async function retryGenerateFromAi() {
    await generateFromAi(true)
  }

  function exportSnapshotJsonDownload() {
    const blob = exportJsonBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `youtube-ing-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return {
    snapshot,
    geminiApiKey,
    playerCurrentSec,
    playing,
    videoError,
    srtError,
    videoId,
    activeCueIndex,
    setVideoUrlOrId,
    setPanelRatio,
    setActiveTab,
    loadSrtFromFile,
    loadSrtFromVideo,
    mergeSrtBlocksOnto,
    seekSeconds,
    resetAll,
    resetWithBackup,
    hasBackup,
    restoreBackup,
    exportJsonBlob,
    importJsonFile,
    generateFromAi,
    retryGenerateFromAi,
    aiPipelineResume,
    setGeminiApiKey,
    captionStatus,
    aiTimeline,
    aiDebugPrompt,
    aiDebugOpen,
    applyImported,
    persist,
    learningCardsHasActiveEdit,
    toggleLearningCardChunkEditing,
    learningCardsEditingChunkIds,
    exportSnapshotJsonDownload,
  }
})
