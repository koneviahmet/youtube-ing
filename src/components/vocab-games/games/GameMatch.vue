<script setup lang="ts">
import { shuffle } from '@/lib/vocabGames/shuffle'
import { CORRECT_ADVANCE_MS } from '@/lib/vocabGames/correctAdvanceMs'
import type { VocabCard } from '@/lib/vocabGames/types'
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ words: VocabCard[] }>()

const emit = defineEmits<{
  batchComplete: []
}>()

const matched = ref<Set<string>>(new Set())
const selectedWordId = ref<string | null>(null)
const wrongFlash = ref(false)

const wordCol = computed(() => shuffle([...props.words]))
const meaningItems = computed(() =>
  shuffle(
    props.words.map((w) => ({
      wordId: w.id,
      text: w.meaning_tr,
    })),
  ),
)

watch(
  () => props.words,
  () => {
    matched.value = new Set()
    selectedWordId.value = null
  },
  { deep: true },
)

function onWord(id: string) {
  if (matched.value.has(id)) return
  selectedWordId.value = selectedWordId.value === id ? null : id
}

function onMeaning(wordId: string) {
  if (matched.value.has(wordId)) return
  const sel = selectedWordId.value
  if (!sel) return
  if (sel === wordId) {
    const next = new Set(matched.value)
    next.add(wordId)
    matched.value = next
    selectedWordId.value = null
    return
  }
  wrongFlash.value = true
  window.setTimeout(() => {
    wrongFlash.value = false
  }, 400)
  selectedWordId.value = null
}

const allMatched = computed(
  () => props.words.length > 0 && matched.value.size === props.words.length,
)

let batchTimer: ReturnType<typeof setTimeout> | null = null
watch(allMatched, (v) => {
  if (batchTimer) {
    clearTimeout(batchTimer)
    batchTimer = null
  }
  if (!v) return
  batchTimer = window.setTimeout(() => {
    batchTimer = null
    emit('batchComplete')
  }, CORRECT_ADVANCE_MS)
})
onUnmounted(() => {
  if (batchTimer) clearTimeout(batchTimer)
})
</script>

<template>
  <div class="vocab-game-shell">
    <p class="vocab-game-caption line-clamp-2 text-center">
      Soldan bir kelime seçin, sağdan doğru anlamına dokunun.
    </p>
    <div
      class="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden sm:grid-cols-2 sm:gap-4 lg:gap-6"
      :class="wrongFlash ? 'ring-2 ring-danger/50 ring-offset-2 ring-offset-surface rounded-lg' : ''"
    >
      <div class="flex min-h-0 min-w-0 flex-col">
        <p
          class="mb-1 shrink-0 font-semibold uppercase tracking-wide text-fg-subtle [font-size:clamp(0.75rem,2vmin+0.25vw,1.1rem)]"
        >
          İngilizce
        </p>
        <ul
          class="grid min-h-0 flex-1 gap-1.5 sm:gap-2"
          :style="{
            gridTemplateRows: `repeat(${words.length}, minmax(0, 1fr))`,
          }"
        >
          <li v-for="w in wordCol" :key="w.id" class="min-h-0 min-w-0">
            <button
              type="button"
              class="vocab-game-choice-btn transition-colors"
              :disabled="matched.has(w.id)"
              :class="
                matched.has(w.id)
                  ? 'border-accent/40 bg-accent/10 text-fg opacity-60'
                  : selectedWordId === w.id
                    ? 'border-accent/60 bg-accent/20 text-fg'
                    : 'border-white/10 bg-surface/40 text-fg hover:border-white/25'
              "
              @click="onWord(w.id)"
            >
              <span class="line-clamp-3 break-words">{{ w.word }}</span>
            </button>
          </li>
        </ul>
      </div>
      <div class="flex min-h-0 min-w-0 flex-col">
        <p
          class="mb-1 shrink-0 font-semibold uppercase tracking-wide text-fg-subtle [font-size:clamp(0.75rem,2vmin+0.25vw,1.1rem)]"
        >
          Türkçe
        </p>
        <ul
          class="grid min-h-0 flex-1 gap-1.5 sm:gap-2"
          :style="{
            gridTemplateRows: `repeat(${words.length}, minmax(0, 1fr))`,
          }"
        >
          <li v-for="m in meaningItems" :key="`${m.wordId}-mean`" class="min-h-0 min-w-0">
            <button
              type="button"
              class="vocab-game-choice-btn transition-colors"
              :disabled="matched.has(m.wordId)"
              :class="
                matched.has(m.wordId)
                  ? 'border-accent/40 bg-accent/10 text-fg opacity-60'
                  : 'border-white/10 bg-surface/40 text-fg hover:border-white/25'
              "
              @click="onMeaning(m.wordId)"
            >
              <span class="line-clamp-3 break-words">{{ m.text }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
    <p
      v-if="allMatched"
      class="line-clamp-2 shrink-0 text-center text-sm font-semibold text-accent sm:text-base md:text-lg"
    >
      Tur tamam — bir sonraki 10 kelimeye geçiliyor (veya başlıktaki «Sonraki 10 kelime»).
    </p>
  </div>
</template>
