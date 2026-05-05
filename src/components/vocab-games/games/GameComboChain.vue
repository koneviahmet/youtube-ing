<script setup lang="ts">
import { shuffle } from '@/lib/vocabGames/shuffle'
import { CORRECT_ADVANCE_MS } from '@/lib/vocabGames/correctAdvanceMs'
import type { VocabCard } from '@/lib/vocabGames/types'
import { computed, onUnmounted, ref, watch } from 'vue'

const WRONG_ADVANCE_MS = 1200

const props = defineProps<{ words: VocabCard[] }>()
const emit = defineEmits<{ batchComplete: [] }>()

const order = ref<number[]>([])
const round = ref(0)
const combo = ref(0)
const best = ref(0)
const picked = ref<string | null>(null)
const revealed = ref(false)
let advanceTimer: ReturnType<typeof setTimeout> | null = null

function clearAdvance() {
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
}

function rebuild() {
  clearAdvance()
  if (!props.words.length) {
    order.value = []
    return
  }
  order.value = shuffle(props.words.map((_, i) => i))
  round.value = 0
  combo.value = 0
  best.value = 0
  picked.value = null
  revealed.value = false
}

watch(() => props.words, rebuild, { deep: true, immediate: true })

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
  const wrong = shuffle(wrongPool).slice(0, 3)
  const mix = shuffle([w, ...wrong].slice(0, 4))
  options.value = mix.map((x) => ({ wordId: x.id, label: x.word }))
}

watch([current, () => props.words.length], buildOptions, { immediate: true })

function choose(wordId: string) {
  if (revealed.value) return
  picked.value = wordId
  revealed.value = true
  const ok = wordId === current.value?.id
  if (ok) {
    combo.value += 1
    best.value = Math.max(best.value, combo.value)
  } else {
    combo.value = 0
  }
}

function nextRound() {
  clearAdvance()
  if (!order.value.length) return
  if (round.value >= order.value.length - 1) {
    emit('batchComplete')
    return
  }
  round.value += 1
  picked.value = null
  revealed.value = false
  buildOptions()
}

const correctId = computed(() => current.value?.id ?? '')

watch([revealed, picked, round, correctId], () => {
  clearAdvance()
  if (!revealed.value || !picked.value || !current.value) return
  const ok = picked.value === correctId.value
  const delay = ok ? CORRECT_ADVANCE_MS : WRONG_ADVANCE_MS
  advanceTimer = window.setTimeout(() => {
    advanceTimer = null
    nextRound()
  }, delay)
})

onUnmounted(clearAdvance)
</script>

<template>
  <div class="vocab-game-shell">
    <div
      class="flex shrink-0 flex-wrap items-center justify-between gap-2 [font-size:clamp(0.95rem,2.5vmin+0.4vw,1.75rem)]"
    >
      <span class="text-accent">Seri: {{ combo }}</span>
      <span class="text-fg-muted">En iyi: {{ best }}</span>
    </div>
    <template v-if="current">
      <p
        class="line-clamp-4 shrink-0 rounded-xl border border-white/10 bg-surface-overlay/50 px-4 py-3 text-center [font-size:clamp(1.2rem,3.3vmin+0.55vw,2.35rem)]"
      >
        {{ current.meaning_tr }}
      </p>
      <ul
        class="grid min-h-0 flex-1 auto-rows-[minmax(0,1fr)] grid-cols-1 gap-2 md:grid-cols-2 md:gap-3"
      >
        <li v-for="o in options" :key="o.wordId" class="min-h-0 min-w-0">
          <button
            type="button"
            class="vocab-game-choice-btn"
            :class="[
              picked === o.wordId && revealed
                ? o.wordId === correctId
                  ? 'border-accent/60 bg-accent/15'
                  : 'border-danger/50 bg-danger/10'
                : 'border-white/10 bg-surface/40 hover:border-white/25',
            ]"
            :disabled="revealed"
            @click="choose(o.wordId)"
          >
            <span class="line-clamp-4 break-words">{{ o.label }}</span>
          </button>
        </li>
      </ul>
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
