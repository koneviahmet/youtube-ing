<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { storeToRefs } from 'pinia'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  videoId: string | null
}>()

const store = useAppStore()
const { playerCurrentSec, playing } = storeToRefs(store)

const mountEl = ref<HTMLElement | null>(null)
let player: YTPlayer | undefined
let timer: ReturnType<typeof setInterval> | null = null
let apiPromise: Promise<void> | null = null

function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      try {
        prev?.()
      } finally {
        resolve()
      }
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    tag.async = true
    tag.onerror = () => reject(new Error('YouTube API yüklenemedi'))
    document.head.appendChild(tag)
  })
  return apiPromise
}

function clearTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function startTimer() {
  clearTimer()
  timer = setInterval(() => {
    try {
      const t = player?.getCurrentTime()
      if (typeof t === 'number' && !Number.isNaN(t)) playerCurrentSec.value = t
    } catch {
      /* noop */
    }
  }, 200)
}

async function mountPlayer(id: string) {
  await loadApi()
  await nextTick()
  const host = mountEl.value
  if (!host || !window.YT?.Player) return

  player?.destroy()
  player = undefined
  clearTimer()

  host.innerHTML = ''
  const div = document.createElement('div')
  div.className = 'h-full w-full overflow-hidden rounded-lg bg-black'
  host.appendChild(div)

  player = new window.YT.Player(div, {
    videoId: id,
    playerVars: {
      autoplay: 0,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      origin: window.location.origin,
    },
    events: {
      onReady: () => {
        // İlk yüklemede otomatik oynatma olmasın.
        player?.pauseVideo()
        playing.value = false
        // Embed açılışında başlangıç süresi uygulanmaz; her zaman 0:00'dan başlar.
        playerCurrentSec.value = 0
      },
      onStateChange: (e) => {
        const YT_PLAYING = window.YT?.PlayerState?.PLAYING ?? 1
        const YT_PAUSED = window.YT?.PlayerState?.PAUSED ?? 2
        const YT_BUFFERING = window.YT?.PlayerState?.BUFFERING ?? 3
        if (e.data === YT_PLAYING || e.data === YT_BUFFERING) {
          playing.value = true
          startTimer()
        } else if (e.data === YT_PAUSED) {
          playing.value = false
          clearTimer()
        }
      },
    },
  })
}

watch(
  [() => props.videoId, () => mountEl.value],
  async ([id, host]) => {
    clearTimer()
    player?.destroy()
    player = undefined
    if (!host) return
    host.innerHTML = ''
    if (!id) return
    await mountPlayer(id)
  },
  { immediate: true },
)

function onTogglePlay() {
  try {
    const YT_PLAYING = window.YT?.PlayerState?.PLAYING ?? 1
    const st = player?.getPlayerState()
    if (st === YT_PLAYING) {
      player?.pauseVideo()
    } else {
      player?.playVideo()
    }
  } catch {
    /* noop */
  }
}

function onSeek(sec: number, autoplay = false) {
  try {
    player?.seekTo(sec, true)
    playerCurrentSec.value = sec
    if (autoplay) player?.playVideo()
  } catch {
    /* noop */
  }
}

function onCtl(e: Event) {
  const ce = e as CustomEvent<number | { sec?: number; autoplay?: boolean }>
  if (e.type === 'youtube-ing-toggle-play') onTogglePlay()
  if (e.type === 'youtube-ing-seek') {
    if (typeof ce.detail === 'number') {
      onSeek(ce.detail, false)
      return
    }
    if (ce.detail && typeof ce.detail === 'object' && typeof ce.detail.sec === 'number') {
      onSeek(ce.detail.sec, Boolean(ce.detail.autoplay))
    }
  }
}

onMounted(() => {
  window.addEventListener('youtube-ing-toggle-play', onCtl)
  window.addEventListener('youtube-ing-seek', onCtl as EventListener)
})

onBeforeUnmount(() => {
  window.removeEventListener('youtube-ing-toggle-play', onCtl)
  window.removeEventListener('youtube-ing-seek', onCtl as EventListener)
  clearTimer()
  player?.destroy()
})
</script>

<template>
  <div class="relative aspect-video w-full max-h-[48vh] bg-black/80 shadow-panel">
    <div
      v-if="!videoId"
      class="flex h-full items-center justify-center text-sm text-fg-muted"
    >
      Video bağlantısı veya ID girin
    </div>
    <div
      ref="mountEl"
      class="h-full w-full"
    />
  </div>
</template>
