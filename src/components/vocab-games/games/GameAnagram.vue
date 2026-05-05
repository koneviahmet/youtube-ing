<script setup lang="ts">
import { shuffle } from '@/lib/vocabGames/shuffle'
import { CORRECT_ADVANCE_MS } from '@/lib/vocabGames/correctAdvanceMs'
import type { VocabCard } from '@/lib/vocabGames/types'
import { computed, onUnmounted, ref, watch } from 'vue'

const TILE_COLS = 6

const props = defineProps<{ words: VocabCard[] }>()
const emit = defineEmits<{ batchComplete: [] }>()

type Tile = { id: number; ch: string }

const order = ref<number[]>([])
const step = ref(0)
const tiles = ref<Tile[]>([])
const picked = ref<Tile[]>([])
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
  picked.value = []
  buildTiles()
}

watch(() => props.words, rebuild, { deep: true, immediate: true })

const current = computed(() => {
  const i = order.value[step.value]
  return i !== undefined ? props.words[i] : null
})

function buildTiles() {
  const w = current.value?.word ?? ''
  const arr = w
    .split('')
    .filter((c) => /[a-zA-Z]/.test(c))
    .map((ch, idx) => ({ id: idx, ch: ch.toUpperCase() }))
  if (!arr.length) {
    tiles.value = []
    return
  }
  let uid = 0
  const pool = arr.map((t) => ({ id: uid++, ch: t.ch }))
  tiles.value = shuffle(pool)
  picked.value = []
}

watch(current, buildTiles)

const built = computed(() => picked.value.map((t) => t.ch).join(''))
const targetNorm = computed(() =>
  (current.value?.word ?? '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase(),
)

const solved = computed(() => built.value === targetNorm.value && built.value.length > 0)

const poolGridStyle = computed(() => {
  const n = tiles.value.length
  if (!n) return {}
  const rows = Math.ceil(n / TILE_COLS)
  return {
    gridTemplateColumns: `repeat(${TILE_COLS}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  }
})

function tapTile(t: Tile) {
  if (solved.value) return
  tiles.value = tiles.value.filter((x) => x.id !== t.id)
  picked.value = [...picked.value, t]
}

function undo() {
  if (!picked.value.length) return
  const last = picked.value[picked.value.length - 1]!
  picked.value = picked.value.slice(0, -1)
  tiles.value = [...tiles.value, last]
}

function shuffleTiles() {
  tiles.value = shuffle([...tiles.value])
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
  picked.value = []
  buildTiles()
}

watch(solved, (v) => {
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
    <template v-if="current">
      <p class="vocab-game-caption shrink-0">Harfleri doğru sıraya getirin.</p>
      <p
        class="line-clamp-3 shrink-0 rounded-xl border border-accent/25 bg-accent/10 px-3 py-2 text-center [font-size:clamp(1.1rem,3.2vmin+0.5vw,1.95rem)]"
      >
        {{ current.meaning_tr }}
      </p>
      <div
        class="min-h-0 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-surface-overlay/40 px-2 py-2 font-mono tracking-wide line-clamp-2 [font-size:clamp(1.15rem,4.2vmin+0.55vw,2.35rem)]"
      >
        {{ built || '…' }}
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          class="vocab-game-action-btn border-white/15 px-3 py-2 text-xs text-fg md:text-sm"
          @click="undo"
        >
          Geri al
        </button>
        <button
          type="button"
          class="vocab-game-action-btn border-white/15 px-3 py-2 text-xs text-fg md:text-sm"
          @click="shuffleTiles"
        >
          Karıştır
        </button>
      </div>
      <div
        class="grid min-h-0 flex-1 touch-manipulation gap-1.5 sm:gap-2"
        :style="poolGridStyle"
      >
        <button
          v-for="t in tiles"
          :key="t.id"
          type="button"
          class="flex h-full min-h-0 w-full min-w-0 items-center justify-center rounded-xl border border-white/20 text-center text-[clamp(1.05rem,4.2vmin+0.55vw,2.1rem)] font-semibold uppercase"
          @click="tapTile(t)"
        >
          {{ t.ch }}
        </button>
      </div>
    </template>
  </div>
</template>
