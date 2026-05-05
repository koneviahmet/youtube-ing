<script setup lang="ts">
import { shuffle } from '@/lib/vocabGames/shuffle'
import { CORRECT_ADVANCE_MS } from '@/lib/vocabGames/correctAdvanceMs'
import type { VocabCard } from '@/lib/vocabGames/types'
import { onUnmounted, ref, watch } from 'vue'

const WRONG_ANSWER_ADVANCE_MS = 800

const props = defineProps<{ words: VocabCard[] }>()
const emit = defineEmits<{ batchComplete: [] }>()

const order = ref<number[]>([])
const step = ref(0)
/** Bu turda çift doğru mu (kelime bu anlama uyuyor mu) */
const pairIsTrue = ref(true)
const answered = ref(false)
const lastCorrect = ref<boolean | null>(null)

function pickRound() {
  const i = order.value[step.value]
  const c = i !== undefined ? props.words[i] : null
  if (!c) {
    displayWord.value = ''
    displayMeaning.value = ''
    return
  }
  if (props.words.length < 2) {
    pairIsTrue.value = true
    displayWord.value = c.word
    displayMeaning.value = c.meaning_tr
    return
  }
  pairIsTrue.value = Math.random() > 0.45
  if (!pairIsTrue.value) {
    const others = props.words.filter((x) => x.id !== c.id)
    const other = others[Math.floor(Math.random() * others.length)]
    if (other) {
      displayWord.value = c.word
      displayMeaning.value = other.meaning_tr
      return
    }
  }
  pairIsTrue.value = true
  displayWord.value = c.word
  displayMeaning.value = c.meaning_tr
}

const displayWord = ref('')
const displayMeaning = ref('')
let answerTimer: ReturnType<typeof setTimeout> | null = null

function rebuild() {
  if (answerTimer) {
    clearTimeout(answerTimer)
    answerTimer = null
  }
  if (!props.words.length) {
    order.value = []
    return
  }
  order.value = shuffle(props.words.map((_, i) => i))
  step.value = 0
  answered.value = false
  lastCorrect.value = null
  pickRound()
}

watch(() => props.words, rebuild, { deep: true, immediate: true })

watch(step, () => {
  answered.value = false
  lastCorrect.value = null
  pickRound()
})

function answer(yes: boolean) {
  if (answered.value) return
  answered.value = true
  const correct = yes === pairIsTrue.value
  lastCorrect.value = correct
  if (answerTimer) {
    clearTimeout(answerTimer)
    answerTimer = null
  }
  const delay = correct ? CORRECT_ADVANCE_MS : WRONG_ANSWER_ADVANCE_MS
  answerTimer = window.setTimeout(() => {
    answerTimer = null
    if (step.value >= order.value.length - 1) {
      emit('batchComplete')
      return
    }
    step.value += 1
  }, delay)
}

onUnmounted(() => {
  if (answerTimer) clearTimeout(answerTimer)
})
</script>

<template>
  <div class="vocab-game-shell">
    <p class="vocab-game-caption">Bu eşleşme doğru mu?</p>
    <div
      class="shrink-0 overflow-hidden rounded-xl border border-white/10 bg-surface-overlay/50 p-3 text-center sm:p-4 md:p-5"
    >
      <p
        class="line-clamp-2 text-lg font-semibold text-fg [font-size:clamp(1.25rem,3.8vmin+0.55vw,2.35rem)]"
      >
        {{ displayWord }}
      </p>
      <p
        class="mt-2 line-clamp-3 text-fg-muted [font-size:clamp(1.05rem,3.1vmin+0.45vw,1.95rem)]"
      >
        {{ displayMeaning }}
      </p>
    </div>
    <div
      class="grid min-h-0 flex-1 auto-rows-[minmax(0,1fr)] touch-manipulation grid-cols-2 gap-2 sm:gap-3 md:gap-4"
    >
      <button
        type="button"
        class="flex h-full min-h-10 items-center justify-center rounded-xl border border-accent/40 bg-accent/15 py-2 text-center font-semibold text-accent [font-size:clamp(1.15rem,4vmin+0.55vw,2.1rem)] disabled:opacity-50"
        :disabled="answered"
        @click="answer(true)"
      >
        Doğru
      </button>
      <button
        type="button"
        class="flex h-full min-h-10 items-center justify-center rounded-xl border border-white/20 py-2 text-center font-semibold text-fg [font-size:clamp(1.15rem,4vmin+0.55vw,2.1rem)] disabled:opacity-50"
        :disabled="answered"
        @click="answer(false)"
      >
        Yanlış
      </button>
    </div>
    <p v-if="lastCorrect === true" class="line-clamp-1 shrink-0 text-sm text-accent sm:text-base md:text-lg">
      Doğru cevap.
    </p>
    <p v-else-if="lastCorrect === false" class="line-clamp-1 shrink-0 text-sm text-danger sm:text-base md:text-lg">
      Yanlış.
    </p>
  </div>
</template>
