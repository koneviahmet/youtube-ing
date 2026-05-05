<script setup lang="ts">
import { shuffle } from '@/lib/vocabGames/shuffle'
import { CORRECT_ADVANCE_MS } from '@/lib/vocabGames/correctAdvanceMs'
import type { VocabCard } from '@/lib/vocabGames/types'
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ words: VocabCard[] }>()
const emit = defineEmits<{ batchComplete: [] }>()

const order = ref<number[]>([])
const step = ref(0)
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
  input.value = ''
}

watch(() => props.words, rebuild, { deep: true, immediate: true })

const current = computed(() => {
  const i = order.value[step.value]
  return i !== undefined ? props.words[i] : null
})

const promptLine = computed(() => {
  const c = current.value
  if (!c) return ''
  const w = c.word.trim()
  const ex = c.example?.trim()
  if (ex && w.length) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(esc, 'gi')
    if (re.test(ex)) return ex.replace(re, '______')
  }
  return `______ (${c.meaning_tr})`
})

function norm(s: string) {
  return s.trim().toLowerCase().replace(/['']/g, "'")
}

function advance() {
  if (step.value >= order.value.length - 1) emit('batchComplete')
  else {
    step.value += 1
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
      <p class="vocab-game-caption shrink-0">Boşluğu İngilizce kelime ile doldurun.</p>
      <p
        class="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-surface-overlay/50 px-4 py-3 text-center leading-snug text-fg line-clamp-[12] [font-size:clamp(1.05rem,3vmin+0.45vw,1.75rem)] sm:line-clamp-[16]"
      >
        {{ promptLine }}
      </p>
      <input
        v-model="input"
        type="text"
        class="min-h-10 w-full shrink-0 rounded-lg border border-white/15 bg-surface px-3 py-2 text-fg [font-size:clamp(1.05rem,2.9vmin+0.45vw,1.85rem)] md:min-h-12 md:px-4"
        placeholder="Kelime"
        @keydown.enter.prevent="check"
      />
      <button
        type="button"
        class="vocab-game-action-btn w-full max-w-xs shrink-0 border-accent/40 bg-accent/15 text-accent sm:w-auto"
        @click="check"
      >
        Kontrol
      </button>
    </template>
  </div>
</template>
