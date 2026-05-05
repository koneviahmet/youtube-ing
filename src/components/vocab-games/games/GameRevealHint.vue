<script setup lang="ts">
import { shuffle } from '@/lib/vocabGames/shuffle'
import { CORRECT_ADVANCE_MS } from '@/lib/vocabGames/correctAdvanceMs'
import type { VocabCard } from '@/lib/vocabGames/types'
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ words: VocabCard[] }>()
const emit = defineEmits<{ batchComplete: [] }>()

const order = ref<number[]>([])
const step = ref(0)
const revealedIdx = ref<Set<number>>(new Set())
const input = ref('')
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
  revealedIdx.value = new Set()
  input.value = ''
}

watch(() => props.words, rebuild, { deep: true, immediate: true })

const current = computed(() => {
  const i = order.value[step.value]
  return i !== undefined ? props.words[i] : null
})

const letters = computed(() => {
  const w = current.value?.word ?? ''
  return w.split('')
})

const mask = computed(() =>
  letters.value
    .map((ch, i) => {
      if (!/[a-zA-Z]/.test(ch)) return ch
      return revealedIdx.value.has(i) ? ch : '_'
    })
    .join(''),
)

function revealOne() {
  const w = current.value?.word ?? ''
  const hidden: number[] = []
  w.split('').forEach((ch, i) => {
    if (/[a-zA-Z]/.test(ch) && !revealedIdx.value.has(i)) hidden.push(i)
  })
  if (!hidden.length) return
  const pick = hidden[Math.floor(Math.random() * hidden.length)]!
  revealedIdx.value = new Set([...revealedIdx.value, pick])
}

function norm(s: string) {
  return s.trim().toLowerCase().replace(/['']/g, "'")
}

function advance() {
  if (step.value >= order.value.length - 1) emit('batchComplete')
  else {
    step.value += 1
    revealedIdx.value = new Set()
    input.value = ''
  }
}

function check() {
  const c = current.value
  if (!c) return
  if (norm(input.value) !== norm(c.word)) return
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
  advanceTimer = window.setTimeout(() => {
    advanceTimer = null
    advance()
  }, CORRECT_ADVANCE_MS)
}

onUnmounted(() => {
  if (advanceTimer) clearTimeout(advanceTimer)
})
</script>

<template>
  <div class="vocab-game-shell">
    <template v-if="current">
      <p class="vocab-game-caption line-clamp-6 shrink-0 text-center">{{ current.meaning_tr }}</p>
      <p
        class="min-h-0 shrink-0 overflow-hidden text-center font-mono tracking-wider text-fg line-clamp-3 [font-size:clamp(1.45rem,6.2vmin+0.75vw,3.25rem)]"
      >
        {{ mask }}
      </p>
      <button
        type="button"
        class="vocab-game-action-btn w-full max-w-xs shrink-0 border-white/20 text-fg sm:w-auto"
        @click="revealOne"
      >
        Harf aç
      </button>
      <input
        v-model="input"
        class="min-h-10 w-full shrink-0 rounded-lg border border-white/15 bg-surface px-3 py-2 text-fg [font-size:clamp(1.05rem,2.9vmin+0.45vw,1.85rem)] md:min-h-12 md:px-4"
        placeholder="Tam kelime"
        @keydown.enter.prevent="check"
      />
      <button
        type="button"
        class="vocab-game-action-btn shrink-0 border-accent/40 bg-accent/15 text-accent"
        @click="check"
      >
        Kontrol
      </button>
    </template>
  </div>
</template>
