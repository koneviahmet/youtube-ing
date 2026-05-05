<script setup lang="ts">
import { shuffle } from '@/lib/vocabGames/shuffle'
import { CORRECT_ADVANCE_MS } from '@/lib/vocabGames/correctAdvanceMs'
import type { VocabCard } from '@/lib/vocabGames/types'
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ words: VocabCard[] }>()

const emit = defineEmits<{
  batchComplete: []
}>()

const order = ref<number[]>([])
const round = ref(0)
const picked = ref<string | null>(null)
const revealed = ref(false)

function rebuildOrder() {
  if (!props.words.length) {
    order.value = []
    return
  }
  order.value = shuffle(props.words.map((_, i) => i))
  round.value = 0
  picked.value = null
  revealed.value = false
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
  picked.value = wordId
  revealed.value = true
}

let advanceTimer: ReturnType<typeof setTimeout> | null = null
function clearAdvanceTimer() {
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
}

function nextRound() {
  clearAdvanceTimer()
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
const isCorrect = computed(() => picked.value === correctId.value)

watch([revealed, isCorrect, round], () => {
  clearAdvanceTimer()
  if (!revealed.value || !isCorrect.value) return
  advanceTimer = window.setTimeout(() => {
    advanceTimer = null
    nextRound()
  }, CORRECT_ADVANCE_MS)
})

onUnmounted(clearAdvanceTimer)
</script>

<template>
  <div class="vocab-game-shell">
    <template v-if="current">
      <p class="vocab-game-caption">Bu ifadenin karşılığı hangi kelimedir?</p>
      <p
        class="shrink-0 line-clamp-4 rounded-xl border border-white/10 bg-surface-overlay/50 px-4 py-3 text-center text-fg [font-size:clamp(1.2rem,3.2vmin+0.55vw,2.35rem)]"
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
        class="line-clamp-2 shrink-0 [font-size:clamp(0.95rem,2.4vmin+0.4vw,1.5rem)]"
        :class="isCorrect ? 'text-accent' : 'text-danger'"
      >
        {{ isCorrect ? 'Doğru' : 'Yanlış' }} — doğru: {{ current.word }}
      </p>
      <button
        type="button"
        class="vocab-game-action-btn shrink-0 border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
        @click="nextRound"
      >
        Sonraki soru
      </button>
    </template>
  </div>
</template>
