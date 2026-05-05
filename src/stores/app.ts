import { runPipeline } from '@/lib/gemini'
import { parseImportedSnapshot } from '@/lib/snapshot'
import {
  SCHEMA_VERSION,
  defaultSnapshot,
  emptyAiPayload,
  type AppSnapshot,
} from '@/lib/schema'
import { parseSrt } from '@/lib/srt'
import { fetchAutoCaptionBlocks } from '@/lib/youtubeCaptions'
import { extractYoutubeVideoId } from '@/lib/youtube'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

const LS_KEY = 'youtube-ing-state-v1'
const BACKUP_KEY = 'youtube-ing-backup-v1'
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
  const playerCurrentSec = ref(snapshot.value.lastPlaybackSec ?? 0)
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
    persist()
  }

  function setVideoUrlOrId(raw: string) {
    snapshot.value.videoUrlOrId = raw
  }

  function setPanelRatio(r: number) {
    snapshot.value.panelRatio = Math.min(0.9, Math.max(0.1, r))
  }

  function setActiveTab(tab: AppSnapshot['activeTab']) {
    snapshot.value.activeTab = tab
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
    const doc: AppSnapshot = {
      ...snapshot.value,
      schemaVersion: SCHEMA_VERSION,
      lastPlaybackSec: playerCurrentSec.value,
    }
    return new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
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

  async function generateFromAi() {
    const blocks = snapshot.value.srtBlocks
    if (!blocks.length) {
      snapshot.value.ai.processing = {
        status: 'error',
        lastError: 'Önce bir SRT dosyası yükleyin',
      }
      pushAiTimeline('Hata: Önce bir SRT dosyası yükleyin')
      return
    }
    aiTimeline.value = ['AI işlemi başlatıldı']
    aiDebugPrompt.value = ''
    snapshot.value.ai.processing = { status: 'running', message: 'Başlıyor…' }
    try {
      const { chunks, quiz } = await runPipeline(
        blocks,
        snapshot.value.geminiModelId,
        (msg) => {
          snapshot.value.ai.processing = { status: 'running', message: msg }
          pushAiTimeline(msg)
        },
        ({ phase, prompt }) => {
          aiDebugPrompt.value = `# ${phase}\n\n${prompt}`
          pushAiTimeline(`Prompt hazırlandı: ${phase}`)
        },
      )
      snapshot.value.ai.chunks = chunks
      snapshot.value.ai.quiz = quiz
      snapshot.value.ai.processing = { status: 'idle', message: 'Tamamlandı' }
      pushAiTimeline(`Tamamlandı: ${chunks.length} kart, ${quiz.length} soru`)
    } catch (e) {
      const err = String(e)
      snapshot.value.ai.processing = { status: 'error', lastError: err }
      pushAiTimeline(`Hata: ${err}`)
    }
  }

  return {
    snapshot,
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
    seekSeconds,
    resetAll,
    resetWithBackup,
    hasBackup,
    restoreBackup,
    exportJsonBlob,
    importJsonFile,
    generateFromAi,
    captionStatus,
    aiTimeline,
    aiDebugPrompt,
    aiDebugOpen,
    applyImported,
    persist,
  }
})
