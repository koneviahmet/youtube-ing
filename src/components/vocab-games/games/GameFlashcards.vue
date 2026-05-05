<script setup lang="ts">
import type { VocabCard } from '@/lib/vocabGames/types'
import { computed, ref, watch } from 'vue'

const props = defineProps<{ words: VocabCard[] }>()

const emit = defineEmits<{
  batchComplete: []
}>()

const idx = ref(0)
const flipped = ref(false)

const current = computed(() => props.words[idx.value] ?? null)

watch(
  () => props.words,
  () => {
    idx.value = 0
    flipped.value = false
  },
  { deep: true },
)

function next() {
  if (!props.words.length) return
  flipped.value = false
  if (idx.value >= props.words.length - 1) {
    emit('batchComplete')
    return
  }
  idx.value += 1
}

function prev() {
  if (!props.words.length) return
  flipped.value = false
  idx.value = (idx.value - 1 + props.words.length) % props.words.length
}

function toggleFlip() {
  flipped.value = !flipped.value
}
</script>

<template>
  <div class="vocab-game-shell items-stretch">
    <template v-if="current">
      <div
        class="flex min-h-0 flex-1 cursor-pointer select-none flex-col overflow-hidden rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/15 to-surface-overlay shadow-panel transition-transform hover:scale-[1.01] touch-manipulation"
        role="button"
        tabindex="0"
        @click="toggleFlip"
        @keydown.enter.prevent="toggleFlip"
        @keydown.space.prevent="toggleFlip"
      >
        <div class="flex min-h-0 flex-1 flex-col justify-center overflow-hidden p-4 sm:p-6 xl:p-8">
          <p
            class="shrink-0 font-semibold uppercase tracking-wide text-fg-subtle [font-size:clamp(0.75rem,2vmin+0.3vw,1.1rem)]"
          >
            {{ flipped ? 'Türkçe' : 'İngilizce' }}
          </p>
          <p
            class="mt-3 line-clamp-[12] text-center font-semibold leading-snug text-fg [font-size:clamp(1.35rem,5.5vmin+0.7vw,3.15rem)]"
          >
            {{ flipped ? current.meaning_tr : current.word }}
          </p>
          <p
            v-if="!flipped && current.example"
            class="mt-3 line-clamp-4 text-center text-fg-muted [font-size:clamp(1rem,2.9vmin+0.45vw,1.65rem)]"
          >
            {{ current.example }}
          </p>
          <p
            class="mt-auto shrink-0 pt-4 text-center text-fg-subtle [font-size:clamp(0.8rem,2.1vmin+0.3vw,1.15rem)]"
          >
            Karta dokunarak çevir
          </p>
        </div>
      </div>

      <div class="flex w-full max-w-2xl shrink-0 flex-wrap justify-center gap-2 sm:gap-3">
        <button
          type="button"
          class="vocab-game-action-btn min-h-10 min-w-[8rem] flex-1 border-white/15 px-3 py-2 text-sm hover:border-accent/40 disabled:opacity-40 sm:flex-none md:min-h-12 md:text-base"
          :disabled="!words.length"
          @click="prev"
        >
          Önceki
        </button>
        <button
          type="button"
          class="vocab-game-action-btn min-h-10 min-w-[8rem] flex-1 border-white/15 px-3 py-2 text-sm hover:border-accent/40 disabled:opacity-40 sm:flex-none md:min-h-12 md:text-base"
          :disabled="!words.length"
          @click="next"
        >
          Sonraki
        </button>
      </div>
      <p v-if="words.length" class="line-clamp-1 shrink-0 text-center text-xs text-fg-muted sm:text-sm md:text-base">
        {{ idx + 1 }} / {{ words.length }}
      </p>
    </template>
  </div>
</template>
