<script setup lang="ts">
import { shuffle } from '@/lib/vocabGames/shuffle'
import { CORRECT_ADVANCE_MS } from '@/lib/vocabGames/correctAdvanceMs'
import type { VocabCard } from '@/lib/vocabGames/types'
import { computed, onUnmounted, ref, watch } from 'vue'

const WRONG_OR_TIMEOUT_ADVANCE_MS = 1200

const props = defineProps<{ words: VocabCard[] }>()
const emit = defineEmits<{ batchComplete: [] }>()

const SECONDS = 12

const order = ref<number[]>([])
const round = ref(0)
const picked = ref<string | null>(null)
const revealed = ref(false)
const timeLeft = ref(SECONDS)
let tick: ReturnType<typeof setInterval> | null = null
let afterRevealTimer: ReturnType<typeof setTimeout> | null = null

function clearAfterReveal() {
  if (afterRevealTimer) {
    clearTimeout(afterRevealTimer)
    afterRevealTimer = null
  }
}

function clearTick() {
  if (tick) {
    clearInterval(tick)
    tick = null
  }
}

function startTimer() {
  clearTick()
  timeLeft.value = SECONDS
  tick = setInterval(() => {
    timeLeft.value -= 1
    if (timeLeft.value <= 0) {
      clearTick()
      if (!revealed.value && current.value) {
        picked.value = '__timeout__'
        revealed.value = true
      }
    }
  }, 1000)
}

function rebuildOrder() {
  clearAfterReveal()
  if (!props.words.length) {
    order.value = []
    return
  }
  order.value = shuffle(props.words.map((_, i) => i))
  round.value = 0
  picked.value = null
  revealed.value = false
  startTimer()
}

watch(() => props.words, rebuildOrder, { deep: true, immediate: true })

const current = computed(() => {
  const i = order.value[round.value]
  return i !== undefined ? props.words[i] : null
})

type Opt = { wordId: string; label: string }

const options = ref<Opt[]>([])

function buildOptions() {
  const w = current.value
  if (!w || !props.words.length) {
    options.value = []
    return
  }
  const wrongPool = props.words.filter((x) => x.id !== w.id)
  const take = Math.min(3, Math.max(0, wrongPool.length))
  const wrong = shuffle(wrongPool).slice(0, take)
  const need = 4 - 1 - wrong.length
  const filler =
    need > 0
      ? shuffle(wrongPool)
          .filter((x) => !wrong.includes(x))
          .slice(0, need)
      : []
  const mix = shuffle([w, ...wrong, ...filler].filter(Boolean).slice(0, 4))
  options.value = mix.map((x) => ({ wordId: x.id, label: x.word }))
  if (options.value.length < 2 && w) {
    options.value = [{ wordId: w.id, label: w.word }]
  }
}

watch([current, () => props.words.length], buildOptions, { immediate: true })

function choose(wordId: string) {
  if (revealed.value) return
  clearTick()
  picked.value = wordId
  revealed.value = true
}

function nextRound() {
  clearAfterReveal()
  clearTick()
  if (!order.value.length) return
  if (round.value >= order.value.length - 1) {
    emit('batchComplete')
    return
  }
  round.value += 1
  picked.value = null
  revealed.value = false
  buildOptions()
  startTimer()
}

const correctId = computed(() => current.value?.id ?? '')
const isCorrect = computed(() => picked.value === correctId.value)

watch([revealed, picked, round, correctId], () => {
  clearAfterReveal()
  if (!revealed.value || !order.value.length) return
  if (round.value > order.value.length - 1) return
  const timeoutPick = picked.value === '__timeout__'
  const correct = !timeoutPick && picked.value === correctId.value
  const delay = correct ? CORRECT_ADVANCE_MS : WRONG_OR_TIMEOUT_ADVANCE_MS
  afterRevealTimer = window.setTimeout(() => {
    afterRevealTimer = null
    nextRound()
  }, delay)
})

onUnmounted(() => {
  clearTick()
  clearAfterReveal()
})
</script>

<template>
  <div class="vocab-game-shell">
    <template v-if="current">
      <div class="flex shrink-0 items-center justify-between gap-2 sm:gap-4">
        <p
          class="font-medium text-fg-muted [font-size:clamp(0.95rem,2.6vmin+0.4vw,1.75rem)]"
        >
          Süre: {{ timeLeft }} sn
        </p>
        <div class="h-2 flex-1 overflow-hidden rounded-full bg-white/10 sm:h-2.5 md:h-3">
          <div
            class="h-full rounded-full bg-accent transition-all"
            :style="{ width: `${(timeLeft / SECONDS) * 100}%` }"
          />
        </div>
      </div>
      <p
        class="line-clamp-4 shrink-0 rounded-xl border border-white/10 bg-surface-overlay/50 px-4 py-3 text-center text-fg [font-size:clamp(1.2rem,3.3vmin+0.55vw,2.35rem)]"
      >
        {{ current.meaning_tr }}
      </p>
      <ul
        class="grid min-h-0 flex-1 auto-rows-[minmax(0,1fr)] grid-cols-1 gap-2 md:grid-cols-2 md:gap-3"
      >
        <li v-for="o in options" :key="o.wordId" class="min-h-0 min-w-0">
          <button
            type="button"
            class="vocab-game-choice-btn transition-colors"
            :class="[
              picked === o.wordId && revealed
                ? o.wordId === correctId
                  ? 'border-accent/60 bg-accent/15 text-fg'
                  : 'border-danger/50 bg-danger/10 text-fg'
                : 'border-white/10 bg-surface/40 text-fg hover:border-white/25',
            ]"
            :disabled="revealed"
            @click="choose(o.wordId)"
          >
            <span class="line-clamp-4 break-words">{{ o.label }}</span>
          </button>
        </li>
      </ul>
      <p
        v-if="revealed"
        class="line-clamp-2 shrink-0 text-xs sm:text-sm md:text-base lg:text-lg"
        :class="isCorrect ? 'text-accent' : 'text-danger'"
      >
        {{ picked === '__timeout__' ? 'Süre doldu' : isCorrect ? 'Doğru' : 'Yanlış' }} —
        {{ current.word }}
      </p>
      <button
        type="button"
        class="vocab-game-action-btn shrink-0 border-accent/40 bg-accent/10 text-accent disabled:opacity-40"
        :disabled="!revealed"
        @click="nextRound"
      >
        Sonraki
      </button>
    </template>
  </div>
</template>
