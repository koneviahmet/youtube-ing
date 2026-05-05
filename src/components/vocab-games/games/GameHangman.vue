<script setup lang="ts">
import { shuffle } from '@/lib/vocabGames/shuffle'
import { CORRECT_ADVANCE_MS } from '@/lib/vocabGames/correctAdvanceMs'
import type { VocabCard } from '@/lib/vocabGames/types'
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ words: VocabCard[] }>()
const emit = defineEmits<{ batchComplete: [] }>()

const MAX_WRONG = 7
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const order = ref<number[]>([])
const step = ref(0)
const guessed = ref<Set<string>>(new Set())
const wrong = ref(0)
let advanceTimer: ReturnType<typeof setTimeout> | null = null

function rebuild() {
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
  if (!props.words.length) {
    order.value = []
    return
  }
  order.value = shuffle(props.words.map((_, i) => i))
  step.value = 0
  guessed.value = new Set()
  wrong.value = 0
}

watch(() => props.words, rebuild, { deep: true, immediate: true })

const current = computed(() => {
  const i = order.value[step.value]
  return i !== undefined ? props.words[i] : null
})

function masked(): string {
  const t = current.value
  if (!t) return ''
  return t.word
    .split('')
    .map((ch) => {
      if (!/[a-zA-Z]/.test(ch)) return ch
      return guessed.value.has(ch.toUpperCase()) ? ch : '_'
    })
    .join('')
}

const won = computed(() => {
  const t = current.value
  if (!t) return false
  return t.word.split('').every((ch) => {
    if (!/[a-zA-Z]/.test(ch)) return true
    return guessed.value.has(ch.toUpperCase())
  })
})

const lost = computed(() => wrong.value >= MAX_WRONG)

function guess(L: string) {
  if (!current.value || won.value || lost.value) return
  const up = L.toUpperCase()
  if (guessed.value.has(up)) return
  guessed.value.add(up)
  const raw = current.value.word.toUpperCase()
  if (!raw.includes(up)) wrong.value += 1
}

function nextRound() {
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
  if (!order.value.length) return
  if (step.value >= order.value.length - 1) {
    emit('batchComplete')
    return
  }
  step.value += 1
  guessed.value = new Set()
  wrong.value = 0
}

watch(won, (v) => {
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
  if (!v) return
  advanceTimer = window.setTimeout(() => {
    advanceTimer = null
    nextRound()
  }, CORRECT_ADVANCE_MS)
})
onUnmounted(() => {
  if (advanceTimer) clearTimeout(advanceTimer)
})
</script>

<template>
  <div class="vocab-game-shell">
    <p v-if="!words.length" class="text-center text-base text-fg-muted md:text-lg">Kelime yok.</p>
    <template v-else-if="current">
      <p
        class="shrink-0 text-center text-fg-muted [font-size:clamp(0.9rem,2.3vmin+0.35vw,1.4rem)]"
      >
        Türkçe anlam
      </p>
      <p
        class="line-clamp-3 shrink-0 rounded-xl border border-white/10 bg-surface-overlay/50 px-3 py-2 text-center [font-size:clamp(1.1rem,3.4vmin+0.5vw,2rem)] sm:px-4 sm:py-3"
      >
        {{ current.meaning_tr }}
      </p>
      <p
        class="shrink-0 text-center font-mono tracking-widest text-fg [font-size:clamp(1.5rem,6.5vmin+0.85vw,3.25rem)]"
      >
        {{ masked() }}
      </p>
      <p class="line-clamp-1 shrink-0 text-center text-[10px] text-fg-muted sm:text-xs md:text-sm">
        Kalan hak: {{ Math.max(0, MAX_WRONG - wrong) }} / {{ MAX_WRONG }}
      </p>
      <p v-if="lost" class="line-clamp-3 shrink-0 text-center text-xs text-danger sm:text-sm md:text-base">
        Bitti — kelime: <strong>{{ current.word }}</strong>
        <button
          type="button"
          class="ml-1 inline-flex min-h-8 touch-manipulation items-center rounded-lg border border-white/20 px-2 py-1 text-[10px] sm:min-h-9 sm:px-3 sm:text-xs md:text-sm"
          @click="nextRound"
        >
          Sonraki
        </button>
      </p>
      <div
        class="mx-auto grid min-h-0 w-full max-w-5xl flex-1 touch-manipulation auto-rows-[minmax(0,1fr)] grid-cols-7 grid-rows-4 gap-1.5 sm:grid-cols-[repeat(13,minmax(0,1fr))] sm:grid-rows-2 sm:gap-2"
      >
        <button
          v-for="L in letters"
          :key="L"
          type="button"
          class="flex min-h-0 h-full min-w-0 items-center justify-center rounded-lg border border-white/15 py-0.5 text-center text-[clamp(0.85rem,3.6vmin+0.45vw,1.35rem)] font-semibold uppercase disabled:opacity-30"
          :disabled="guessed.has(L) || won || lost"
          @click="guess(L)"
        >
          {{ L }}
        </button>
      </div>
    </template>
  </div>
</template>
