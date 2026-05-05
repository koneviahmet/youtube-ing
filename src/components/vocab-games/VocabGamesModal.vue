<script setup lang="ts">
import VocabWordPicker from '@/components/vocab-games/VocabWordPicker.vue'
import { useWordBatches } from '@/composables/useWordBatches'
import { getGameEntry } from '@/lib/vocabGames/registry'
import type { VocabCard, VocabGameId } from '@/lib/vocabGames/types'
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  gameId: VocabGameId | null
  allWords: VocabCard[]
  selectedIds: string[]
}>()

const emit = defineEmits<{
  close: []
  'update:selectedIds': [ids: string[]]
}>()

const entry = computed(() => (props.gameId ? getGameEntry(props.gameId) : undefined))

const GameComp = computed(() => entry.value?.component)

const selectedWords = computed(() =>
  props.allWords.filter((w) => props.selectedIds.includes(w.id)),
)

const batches = useWordBatches(selectedWords)

watch(
  () => [props.open, props.gameId] as const,
  ([o, gid]) => {
    if (o && gid && gid !== 'snake') batches.reshuffle()
  },
)

/** Yılan hariç: havuz rastgele karıştırılır, tur başına en fazla 10 kelime */
const wordsForGame = computed(() => {
  if (!props.gameId || props.gameId === 'snake') return selectedWords.value
  return batches.currentBatch.value
})

const gameMountKey = computed(() => {
  if (props.gameId === 'snake') return 'snake'
  return `${props.gameId ?? 'x'}-${batches.batchVersion.value}`
})

function onBatchComplete() {
  batches.nextBatch()
}

/** Kelime seçici yan panel — varsayılan kapalı */
const wordsPanelOpen = ref(false)

watch(
  () => !!(props.open && props.gameId),
  (active) => {
    if (active) wordsPanelOpen.value = false
  },
)

watch(
  () => props.open,
  (o) => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = o ? 'hidden' : ''
  },
)

function onClose() {
  emit('close')
}

const headerFullTitle = computed(() => {
  const e = entry.value
  if (!e) return 'Kelime etkinliği'
  return `Kelime · ${e.title}${e.description ? ` · ${e.description}` : ''}`
})

const wordsPanelLabel = computed(() =>
  wordsPanelOpen.value
    ? 'Kelimeleri gizle'
    : `Kelimeler (${props.selectedIds.length}/${props.allWords.length || 0}) — göster`,
)

const nextBatchTitle = computed(
  () =>
    `${batches.batchProgressLabel}. Her tur en fazla 10 kelime, rastgele sıra.`,
)

const showBatchControls = computed(
  () => !!(props.gameId && props.gameId !== 'snake' && selectedWords.value.length),
)

let escListener: ((e: KeyboardEvent) => void) | null = null
watch(
  () => props.open && props.gameId,
  (active) => {
    if (escListener) {
      window.removeEventListener('keydown', escListener)
      escListener = null
    }
    if (!active) return
    escListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', escListener)
  },
)

onUnmounted(() => {
  if (escListener) window.removeEventListener('keydown', escListener)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && gameId"
      class="fixed inset-0 z-[100] flex h-dvh max-h-dvh flex-col overflow-hidden bg-surface text-fg shadow-2xl"
      role="dialog"
      aria-modal="true"
      :aria-label="entry?.title ?? 'Kelime etkinliği'"
    >
      <header
        class="flex min-h-14 shrink-0 touch-manipulation items-center gap-3 border-b border-white/10 px-3 py-2 md:min-h-16 md:px-4"
      >
        <p
          class="min-w-0 flex-1 truncate text-sm leading-tight text-fg md:text-base"
          :title="headerFullTitle"
        >
          <span class="text-fg-subtle">Kelime</span>
          <span class="text-fg-muted"> · </span>
          <span class="font-medium">{{ entry?.title }}</span>
          <span v-if="entry?.description" class="text-fg-muted"> · {{ entry?.description }}</span>
        </p>
        <div class="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            v-if="showBatchControls"
            type="button"
            class="touch-manipulation rounded-lg border border-white/15 px-2.5 py-2 text-xs font-medium text-fg transition-colors hover:border-accent/40 hover:bg-white/5 sm:px-3 sm:text-sm md:min-h-11 md:py-2.5"
            :title="nextBatchTitle"
            :aria-label="`Sonraki 10 kelime. ${batches.batchProgressLabel}`"
            @click="batches.nextBatch"
          >
            <span class="hidden sm:inline">Sonraki 10 kelime</span>
            <span class="sm:hidden">Sonraki 10</span>
          </button>
          <button
            type="button"
            class="flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-lg border border-white/15 text-fg-muted transition-colors hover:border-white/25 hover:bg-white/5 hover:text-fg md:h-12 md:min-h-12 md:w-12 md:min-w-12"
            :aria-expanded="wordsPanelOpen"
            :aria-label="wordsPanelLabel"
            aria-controls="vocab-word-panel"
            @click="wordsPanelOpen = !wordsPanelOpen"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke-linecap="round" />
            </svg>
          </button>
          <button
            type="button"
            class="flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-lg border border-white/15 text-fg-muted transition-colors hover:border-white/25 hover:bg-white/5 hover:text-fg md:h-12 md:min-h-12 md:w-12 md:min-w-12"
            aria-label="Kapat (Esc)"
            @click="onClose"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <div class="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside
          v-if="wordsPanelOpen"
          id="vocab-word-panel"
          class="flex min-h-0 max-h-[38vh] shrink-0 flex-col overflow-hidden border-b border-white/10 p-4 md:max-h-none md:w-[min(22rem,100%)] md:border-b-0 md:border-r"
        >
          <VocabWordPicker
            :words="allWords"
            :model-value="selectedIds"
            @update:model-value="emit('update:selectedIds', $event)"
          />
        </aside>

        <main
          class="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4 lg:p-6"
          :class="gameId === 'snake' ? '!p-0' : ''"
        >
          <p v-if="!allWords.length" class="text-center text-base text-fg-muted md:text-lg">
            Önce AI ile işleyip kelime hazinesi üretin; kartlarda görünen kelimeler burada listelenir.
          </p>
          <p v-else-if="!selectedWords.length" class="text-center text-base text-warn md:text-lg">
            En az bir kelime seçin.
          </p>
          <template v-else-if="GameComp && wordsForGame.length">
            <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
              <component
                :is="GameComp"
                :key="gameMountKey"
                :words="wordsForGame"
                @batch-complete="onBatchComplete"
              />
            </div>
          </template>
        </main>
      </div>
    </div>
  </Teleport>
</template>

