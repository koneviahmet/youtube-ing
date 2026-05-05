<script setup lang="ts">
import { GEMINI_MODEL_OPTIONS } from '@/lib/geminiModels'
import { useAppStore } from '@/stores/app'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const store = useAppStore()
const {
  snapshot,
  playing,
  videoError,
  hasBackup,
  captionStatus,
  aiTimeline,
  aiDebugOpen,
  aiDebugPrompt,
} = storeToRefs(store)

const srtInput = ref<HTMLInputElement | null>(null)
const jsonInput = ref<HTMLInputElement | null>(null)
const fileMenuRef = ref<HTMLElement | null>(null)
const sessionMenuRef = ref<HTMLElement | null>(null)
const aiRootRef = ref<HTMLElement | null>(null)
const fileMenuOpen = ref(false)
const sessionMenuOpen = ref(false)
const aiMenuOpen = ref(false)
const hasEnvGeminiApiKey = __HAS_ENV_GEMINI_API_KEY__

const canPlay = computed(() => !!store.videoId && !videoError.value)
const hasStoredApiKey = computed(() => !!store.geminiApiKey.trim())

const modelChoices = computed(() => {
  const id = snapshot.value.geminiModelId
  const opts = GEMINI_MODEL_OPTIONS
  if (opts.some((o) => o.id === id)) return opts
  return [{ id, label: `${id} (kayıtlı)` }, ...opts]
})

const statusLine = computed(() => {
  const p = snapshot.value.ai.processing
  if (p.status === 'running') return p.message || 'Çalışıyor…'
  if (p.status === 'error') return p.lastError ?? 'Hata'
  return 'Hazır'
})

function pickSrt() {
  srtInput.value?.click()
}
function pickJson() {
  jsonInput.value?.click()
}

function pullFromVideo() {
  void store.loadSrtFromVideo()
}

function onSrtChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) store.loadSrtFromFile(f)
  ;(e.target as HTMLInputElement).value = ''
}

function onJsonChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) void store.importJsonFile(f)
  ;(e.target as HTMLInputElement).value = ''
}

function exportJson() {
  const blob = store.exportJsonBlob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `youtube-ing-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

function togglePlay() {
  if (!canPlay.value) return
  window.dispatchEvent(new CustomEvent('youtube-ing-toggle-play'))
}

function resetAll() {
  const ok = window.confirm(
    'Mevcut durumu sıfırlamadan önce otomatik yedek alınacak. Devam edilsin mi?',
  )
  if (!ok) return
  store.resetWithBackup()
}

function restoreBackup() {
  if (!hasBackup.value) return
  const ok = window.confirm('Son otomatik yedek geri yüklensin mi?')
  if (!ok) return
  store.restoreBackup()
}

async function runAi() {
  await store.generateFromAi()
}

function onGeminiApiKeyInput(e: Event) {
  const value = (e.target as HTMLInputElement).value
  store.setGeminiApiKey(value)
}

function closeAllMenus() {
  fileMenuOpen.value = false
  sessionMenuOpen.value = false
  aiMenuOpen.value = false
}

function toggleFileMenu() {
  sessionMenuOpen.value = false
  aiMenuOpen.value = false
  fileMenuOpen.value = !fileMenuOpen.value
}

function toggleSessionMenu() {
  fileMenuOpen.value = false
  aiMenuOpen.value = false
  sessionMenuOpen.value = !sessionMenuOpen.value
}

function toggleAiMenu() {
  fileMenuOpen.value = false
  sessionMenuOpen.value = false
  aiMenuOpen.value = !aiMenuOpen.value
}

function onDocClick(e: MouseEvent) {
  const t = e.target as Node
  if (fileMenuRef.value?.contains(t)) return
  if (sessionMenuRef.value?.contains(t)) return
  if (aiRootRef.value?.contains(t)) return
  closeAllMenus()
}

const onKey = (e: KeyboardEvent) => {
  if (e.code === 'Space' && !(e.target as HTMLElement).closest('input,textarea,button')) {
    e.preventDefault()
    togglePlay()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('click', onDocClick)
})
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b border-white/10 bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85"
  >
    <div class="flex items-center gap-2 px-2 py-1.5 md:gap-2 md:px-3">
      <label class="sr-only" for="video-url">YouTube adresi veya video ID</label>
      <input
        id="video-url"
        v-model="snapshot.videoUrlOrId"
        type="text"
        class="min-h-9 min-w-0 flex-1 rounded-md border border-white/15 bg-surface-raised px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-subtle focus:border-accent/50"
        placeholder="YouTube URL veya video ID"
        autocomplete="off"
      />

      <input ref="srtInput" type="file" accept=".srt,text/plain" class="hidden" @change="onSrtChange" />
      <input ref="jsonInput" type="file" accept="application/json,.json" class="hidden" @change="onJsonChange" />

      <div class="flex shrink-0 items-center gap-0.5 md:gap-1">
        <!-- Dosya & altyazı -->
        <div ref="fileMenuRef" class="relative">
          <button
            type="button"
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/15 text-fg-muted transition-colors hover:border-white/25 hover:bg-white/5 hover:text-fg"
            aria-label="Dosya ve altyazı"
            title="Dosya ve altyazı"
            aria-haspopup="true"
            :aria-expanded="fileMenuOpen"
            @click.stop="toggleFileMenu"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" stroke-linejoin="round" />
              <path d="M14 2v6h6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="opacity-0 scale-95"
            enter-to-class="opacity-100 scale-100"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="opacity-100 scale-100"
            leave-to-class="opacity-0 scale-95"
          >
            <div
              v-if="fileMenuOpen"
              class="absolute right-0 top-full z-50 mt-1 min-w-[11rem] origin-top-right rounded-lg border border-white/12 bg-surface-raised py-1 shadow-2xl ring-1 ring-black/20"
              role="menu"
              @click.stop
            >
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-fg hover:bg-white/5"
                role="menuitem"
                @click="pickSrt(); closeAllMenus()"
              >
                <span class="text-fg-muted">SRT yükle</span>
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-fg hover:bg-white/5 disabled:opacity-40"
                role="menuitem"
                :disabled="!store.videoId || !!videoError || captionStatus.state === 'loading'"
                @click="pullFromVideo(); closeAllMenus()"
              >
                <span>Videodan altyazı çek</span>
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-fg hover:bg-white/5"
                role="menuitem"
                @click="pickJson(); closeAllMenus()"
              >
                <span>JSON içe aktar</span>
              </button>
              <div class="my-1 border-t border-white/10" />
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-accent hover:bg-accent/10"
                role="menuitem"
                @click="exportJson(); closeAllMenus()"
              >
                <span>JSON dışa aktar</span>
              </button>
            </div>
          </Transition>
        </div>

        <button
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/15 text-fg-muted transition-colors hover:border-white/25 hover:bg-white/5 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!canPlay"
          :aria-label="playing ? 'Duraklat' : 'Oynat'"
          :title="playing ? 'Duraklat' : 'Oynat'"
          @click="togglePlay"
        >
          <svg v-if="!playing" class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
          <svg v-else class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
          </svg>
        </button>

        <!-- Oturum -->
        <div ref="sessionMenuRef" class="relative">
          <button
            type="button"
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/15 text-fg-muted transition-colors hover:border-white/25 hover:bg-white/5 hover:text-fg"
            aria-label="Oturum ve yedek"
            title="Oturum ve yedek"
            aria-haspopup="true"
            :aria-expanded="sessionMenuOpen"
            @click.stop="toggleSessionMenu"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke-linecap="round" />
            </svg>
          </button>
          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="opacity-0 scale-95"
            enter-to-class="opacity-100 scale-100"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="opacity-100 scale-100"
            leave-to-class="opacity-0 scale-95"
          >
            <div
              v-if="sessionMenuOpen"
              class="absolute right-0 top-full z-50 mt-1 min-w-[11rem] origin-top-right rounded-lg border border-white/12 bg-surface-raised py-1 shadow-2xl ring-1 ring-black/20"
              role="menu"
              @click.stop
            >
              <button
                type="button"
                class="flex w-full px-3 py-2 text-left text-xs text-danger hover:bg-danger/10"
                role="menuitem"
                @click="resetAll(); closeAllMenus()"
              >
                Sıfırla
              </button>
              <button
                type="button"
                class="flex w-full px-3 py-2 text-left text-xs text-fg hover:bg-white/5 disabled:opacity-40"
                role="menuitem"
                :disabled="!hasBackup"
                @click="restoreBackup(); closeAllMenus()"
              >
                Yedeği geri yükle
              </button>
            </div>
          </Transition>
        </div>

        <!-- AI menüsü -->
        <div ref="aiRootRef" class="relative">
          <button
            type="button"
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-accent/35 text-accent transition-colors hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Yapay zeka ayarları"
            title="AI (Gemini)"
            aria-haspopup="true"
            :aria-expanded="aiMenuOpen"
            @click.stop="toggleAiMenu"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 3c-.3 0-.6.2-.7.5l-.9 2.8a4 4 0 0 1-2.5 2.5l-2.9 1a.8.8 0 0 0 0 1.5l2.9 1a4 4 0 0 1 2.5 2.5l.9 2.8c.1.3.4.5.7.5s.6-.2.7-.5l.9-2.8a4 4 0 0 1 2.5-2.5l2.9-1a.8.8 0 0 0 0-1.5l-2.9-1a4 4 0 0 1-2.5-2.5l-.9-2.8a.8.8 0 0 0-.7-.5Z"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="opacity-0 scale-95"
            enter-to-class="opacity-100 scale-100"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="opacity-100 scale-100"
            leave-to-class="opacity-0 scale-95"
          >
            <div
              v-if="aiMenuOpen"
              class="absolute right-0 top-full z-50 mt-1 w-[min(19rem,calc(100vw-1rem))] origin-top-right rounded-lg border border-white/12 bg-surface-raised p-3 shadow-2xl ring-1 ring-black/20"
              role="menu"
              @click.stop
            >
              <p class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Gemini modeli</p>
              <label class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                Gemini API Key
              </label>
              <input
                :value="store.geminiApiKey"
                type="password"
                class="mb-2 w-full rounded-md border border-white/15 bg-surface-overlay px-2 py-2 text-xs text-fg placeholder:text-fg-subtle focus:border-accent/40"
                :placeholder="
                  hasEnvGeminiApiKey ? 'Opsiyonel (env yoksa kullanılır)' : 'Env bulunamadı, API key gerekli'
                "
                autocomplete="off"
                @input="onGeminiApiKeyInput"
              />
              <p v-if="!hasEnvGeminiApiKey && !hasStoredApiKey" class="mb-3 text-[10px] text-warn">
                AI için buraya anahtar girin; localStorage'da saklanır.
              </p>
              <p v-else class="mb-3 text-[10px] text-fg-subtle">
                `.env` anahtarı varsa öncelik ondadır, yoksa bu alandaki anahtar kullanılır.
              </p>

              <select
                v-model="snapshot.geminiModelId"
                class="mb-3 w-full rounded-md border border-white/15 bg-surface-overlay px-2 py-2 text-xs text-fg focus:border-accent/40 disabled:opacity-50"
                :disabled="snapshot.ai.processing.status === 'running'"
              >
                <option v-for="o in modelChoices" :key="o.id" :value="o.id">
                  {{ o.label }}
                </option>
              </select>

              <button
                type="button"
                class="mb-3 w-full rounded-md border border-accent/45 bg-accent/15 py-2 text-sm font-semibold text-accent hover:bg-accent/25 disabled:opacity-40"
                :disabled="snapshot.ai.processing.status === 'running' || !snapshot.srtBlocks.length"
                @click="runAi"
              >
                AI ile işle
              </button>

              <button
                type="button"
                class="mb-3 w-full rounded-md border border-white/15 py-1.5 text-xs text-fg hover:bg-white/5"
                @click="aiDebugOpen = !aiDebugOpen"
              >
                {{ aiDebugOpen ? 'Debug gizle' : 'Debug göster' }}
              </button>

              <div class="rounded-md border border-white/10 bg-surface-overlay/50 px-2 py-1.5">
                <p class="text-[10px] font-medium uppercase text-fg-subtle">Durum</p>
                <p class="truncate text-xs text-fg-muted">
                  {{ statusLine }}
                </p>
                <p
                  v-for="(item, idx) in aiTimeline.slice().reverse().slice(0, 3)"
                  :key="`${idx}-${item}`"
                  class="truncate text-[10px] text-fg-subtle"
                >
                  {{ item }}
                </p>
              </div>

              <div v-if="aiDebugOpen" class="mt-3">
                <p class="mb-1 text-[10px] font-semibold uppercase text-fg-subtle">Son prompt</p>
                <textarea
                  :value="aiDebugPrompt || '—'"
                  readonly
                  class="max-h-40 w-full resize-y rounded-md border border-white/10 bg-surface-overlay/60 p-2 font-mono text-[10px] text-fg"
                  rows="6"
                />
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <p
      v-if="videoError"
      class="truncate border-t border-white/5 px-3 py-1 text-[11px] text-warn"
    >
      {{ videoError }}
    </p>
    <p
      v-else-if="captionStatus.state === 'loading'"
      class="truncate border-t border-white/5 px-3 py-1 text-[11px] text-fg-muted"
    >
      {{ captionStatus.message }}
    </p>
    <p
      v-else-if="captionStatus.state === 'error'"
      class="truncate border-t border-white/5 px-3 py-1 text-[11px] text-warn"
    >
      {{ captionStatus.message }}
    </p>
    <p
      v-else-if="captionStatus.state === 'ok'"
      class="truncate border-t border-white/5 px-3 py-1 text-[11px] text-accent"
    >
      {{ captionStatus.message }}
    </p>
  </header>
</template>

