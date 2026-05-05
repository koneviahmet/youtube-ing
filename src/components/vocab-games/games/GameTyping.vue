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
const step = ref(0)
const input = ref('')
const lastOk = ref<boolean | null>(null)

function rebuild() {
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

function normalize(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/['']/g, "'")
}

let advanceTimer: ReturnType<typeof setTimeout> | null = null
function clearAdvanceTimer() {
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
}

function check() {
  const c = current.value
  if (!c) return
  clearAdvanceTimer()
  lastOk.value = normalize(input.value) === normalize(c.word)
  if (lastOk.value) {
    advanceTimer = window.setTimeout(() => {
      advanceTimer = null
      next()
    }, CORRECT_ADVANCE_MS)
  }
}

function next() {
  clearAdvanceTimer()
  if (!order.value.length) return
  if (step.value >= order.value.length - 1) {
    emit('batchComplete')
    return
  }
  step.value += 1
  input.value = ''
  lastOk.value = null
}

onUnmounted(clearAdvanceTimer)
</script>

<template>
  <div class="vocab-game-shell">
    <template v-if="current">
      <p class="vocab-game-caption shrink-0">Türkçe anlamı okuyun; İngilizce kelimeyi yazın.</p>
      <p
        class="min-h-0 flex-1 overflow-hidden rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-center leading-snug line-clamp-[12] [font-size:clamp(1.2rem,3.5vmin+0.55vw,2.25rem)] sm:line-clamp-[14]"
      >
        {{ current.meaning_tr }}
      </p>
      <input
        v-model="input"
        type="text"
        autocomplete="off"
        class="min-h-10 w-full shrink-0 rounded-lg border border-white/15 bg-surface px-3 py-2 text-fg placeholder:text-fg-subtle focus:border-accent/40 [font-size:clamp(1.05rem,2.9vmin+0.45vw,1.85rem)] md:min-h-12 md:px-4"
        placeholder="İngilizce kelime"
        @keydown.enter.prevent="check"
      />
      <div class="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          class="vocab-game-action-btn border-accent/40 bg-accent/15 text-accent"
          @click="check"
        >
          Kontrol et
        </button>
        <button
          type="button"
          class="vocab-game-action-btn border-white/15 text-fg hover:border-accent/40"
          @click="next"
        >
          Sonraki
        </button>
      </div>
      <p v-if="lastOk === true" class="line-clamp-1 shrink-0 text-sm text-accent md:text-base lg:text-lg">
        Doğru.
      </p>
      <p v-else-if="lastOk === false" class="line-clamp-3 shrink-0 text-xs text-danger sm:text-sm md:text-base">
        Yanlış — doğru cevap: <span class="font-semibold">{{ current.word }}</span>
      </p>
    </template>
  </div>
</template>
