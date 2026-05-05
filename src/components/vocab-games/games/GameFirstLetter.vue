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
const lastOk = ref<boolean | null>(null)
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
  lastOk.value = null
}

watch(() => props.words, rebuild, { deep: true, immediate: true })

const current = computed(() => {
  const i = order.value[step.value]
  return i !== undefined ? props.words[i] : null
})

const hint = computed(() => {
  const c = current.value
  if (!c) return ''
  const w = c.word
  const plain = w.replace(/[^a-zA-Z]/g, '')
  if (!plain.length) return '______'
  const n = plain.length <= 4 ? 1 : 2
  const head = plain.slice(0, n)
  return `${head}${'_'.repeat(Math.max(0, plain.length - n))}`
})

function norm(s: string) {
  return s.trim().toLowerCase().replace(/['']/g, "'")
}

function check() {
  const c = current.value
  if (!c) return
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
  lastOk.value = norm(input.value) === norm(c.word)
  if (lastOk.value) {
    advanceTimer = window.setTimeout(() => {
      advanceTimer = null
      next()
    }, CORRECT_ADVANCE_MS)
  }
}

function next() {
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
  if (!order.value.length) return
  if (lastOk.value !== true) return
  if (step.value >= order.value.length - 1) {
    emit('batchComplete')
    return
  }
  step.value += 1
  input.value = ''
  lastOk.value = null
}

onUnmounted(() => {
  if (advanceTimer) clearTimeout(advanceTimer)
})
</script>

<template>
  <div class="vocab-game-shell">
    <template v-if="current">
      <p class="vocab-game-caption line-clamp-6 shrink-0 text-center">{{ current.meaning_tr }}</p>
      <p class="shrink-0 font-mono [font-size:clamp(1.45rem,6vmin+0.75vw,3rem)]">{{ hint }}</p>
      <input
        v-model="input"
        class="min-h-10 w-full shrink-0 rounded-lg border border-white/15 bg-surface px-3 py-2 text-fg [font-size:clamp(1.05rem,2.9vmin+0.45vw,1.85rem)] md:min-h-12 md:px-4"
        placeholder="İngilizce kelime"
        @keydown.enter.prevent="check"
      />
      <div class="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          class="vocab-game-action-btn border-accent/40 bg-accent/15 text-accent"
          @click="check"
        >
          Kontrol
        </button>
        <button
          type="button"
          class="vocab-game-action-btn border-white/15 text-fg disabled:opacity-40"
          :disabled="lastOk !== true"
          @click="next"
        >
          Sonraki
        </button>
      </div>
      <p v-if="lastOk === false" class="line-clamp-1 shrink-0 text-sm text-danger md:text-base">Tekrar dene.</p>
      <p v-else-if="lastOk === true" class="line-clamp-3 shrink-0 text-xs text-accent sm:text-sm md:text-base">
        Doğru — {{ Math.ceil(CORRECT_ADVANCE_MS / 1000) }} sn içinde sonraki soru (veya «Sonraki» ile atla).
      </p>
    </template>
  </div>
</template>
