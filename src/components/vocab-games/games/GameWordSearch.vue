<script setup lang="ts">
import { shuffle } from '@/lib/vocabGames/shuffle'
import { CORRECT_ADVANCE_MS } from '@/lib/vocabGames/correctAdvanceMs'
import type { VocabCard } from '@/lib/vocabGames/types'
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ words: VocabCard[] }>()
const emit = defineEmits<{ batchComplete: [] }>()

const ROWS = 10
const COLS = 10
const lettersFill = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

const grid = ref<string[][]>([])
const found = ref<Set<string>>(new Set())
const answers = ref<string[]>([])
const input = ref('')
const msg = ref('')
let batchTimer: ReturnType<typeof setTimeout> | null = null

function normWord(w: string) {
  return w.replace(/[^a-zA-Z]/g, '').toUpperCase()
}

function buildGrid() {
  if (batchTimer) {
    clearTimeout(batchTimer)
    batchTimer = null
  }
  const g: string[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(''))
  const pool = shuffle([...props.words])
    .slice(0, Math.min(5, props.words.length))
    .map((c) => normWord(c.word))
    .filter((w) => w.length >= 2 && w.length <= Math.max(ROWS, COLS))
  const placed: string[] = []
  for (const raw of pool) {
    let okPlaced = false
    for (let t = 0; t < 100 && !okPlaced; t++) {
      const horiz = Math.random() > 0.5
      if (horiz) {
        const r = Math.floor(Math.random() * ROWS)
        const c = Math.floor(Math.random() * (COLS - raw.length + 1))
        let ok = true
        for (let i = 0; i < raw.length; i++) {
          const ch = g[r]![c + i]
          if (ch && ch !== raw[i]) ok = false
        }
        if (ok) {
          for (let i = 0; i < raw.length; i++) g[r]![c + i] = raw[i]!
          placed.push(raw)
          okPlaced = true
        }
      } else {
        const r = Math.floor(Math.random() * (ROWS - raw.length + 1))
        const c = Math.floor(Math.random() * COLS)
        let ok = true
        for (let i = 0; i < raw.length; i++) {
          const ch = g[r + i]![c]
          if (ch && ch !== raw[i]) ok = false
        }
        if (ok) {
          for (let i = 0; i < raw.length; i++) g[r + i]![c] = raw[i]!
          placed.push(raw)
          okPlaced = true
        }
      }
    }
  }
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (!g[r]![c]) g[r]![c] = lettersFill[Math.floor(Math.random() * 26)]!
  grid.value = g
  answers.value = placed
  found.value = new Set()
  input.value = ''
  msg.value = placed.length ? '' : 'Kelime yerleştirilemedi; daha fazla kelime seçin.'
}

watch(() => props.words, buildGrid, { deep: true, immediate: true })

function existsStraight(w: string): boolean {
  const W = w.toUpperCase()
  const g = grid.value
  if (!W.length) return false
  for (let r = 0; r < ROWS; r++) {
    const row = g[r]!.join('')
    if (row.includes(W)) return true
    const rev = [...W].reverse().join('')
    if (row.includes(rev)) return true
  }
  for (let c = 0; c < COLS; c++) {
    let col = ''
    for (let r = 0; r < ROWS; r++) col += g[r]![c]
    if (col.includes(W)) return true
    const rev = [...W].reverse().join('')
    if (col.includes(rev)) return true
  }
  return false
}

function submit() {
  const w = normWord(input.value)
  input.value = ''
  if (!w) return
  if (found.value.has(w)) {
    msg.value = 'Zaten bulundu.'
    return
  }
  if (!answers.value.includes(w)) {
    msg.value = 'Bu turda yok.'
    return
  }
  if (!existsStraight(w)) {
    msg.value = 'Izgarada düz çizgide bulunamadı.'
    return
  }
  found.value = new Set([...found.value, w])
  msg.value = 'Bulundu!'
  if (found.value.size >= answers.value.length && answers.value.length > 0) {
    if (batchTimer) clearTimeout(batchTimer)
    batchTimer = window.setTimeout(() => {
      batchTimer = null
      emit('batchComplete')
    }, CORRECT_ADVANCE_MS)
  }
}

onUnmounted(() => {
  if (batchTimer) clearTimeout(batchTimer)
})

const remaining = computed(() => answers.value.filter((a) => !found.value.has(a)))

const flatGrid = computed(() => grid.value.flat())
</script>

<template>
  <div class="vocab-game-shell">
    <p class="vocab-game-caption line-clamp-2">
      Izgarada yatay veya dikey düz çizgide gizlenen İngilizce kelimeleri yazıp «Bul» deyin.
    </p>
    <div class="relative min-h-0 w-full flex-1 overflow-hidden">
      <div
        class="grid h-full min-h-0 w-full border border-white/10 font-mono [font-size:clamp(0.7rem,3.2vmin+0.55vw,1.4rem)]"
        :style="{
          gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
        }"
      >
        <div
          v-for="(cell, i) in flatGrid"
          :key="i"
          class="flex h-full min-h-0 min-w-0 items-center justify-center border border-white/10 text-center leading-none"
        >
          {{ cell }}
        </div>
      </div>
    </div>
    <p class="line-clamp-2 shrink-0 text-[11px] text-fg-muted sm:text-xs md:text-sm">
      Aranan: {{ remaining.join(', ') || '—' }}
    </p>
    <div class="flex shrink-0 flex-wrap gap-2">
      <input
        v-model="input"
        type="text"
        class="min-h-10 min-w-0 flex-1 rounded-lg border border-white/15 bg-surface px-3 py-2 uppercase [font-size:clamp(1rem,2.8vmin+0.45vw,1.75rem)] md:min-h-12 md:px-4"
        placeholder="Kelime"
        @keydown.enter.prevent="submit"
      />
      <button
        type="button"
        class="vocab-game-action-btn shrink-0 border-accent/40 bg-accent/15 text-accent"
        @click="submit"
      >
        Bul
      </button>
    </div>
    <p v-if="msg" class="line-clamp-2 shrink-0 text-[11px] text-fg-muted sm:text-xs">{{ msg }}</p>
    <button
      v-if="!answers.length && words.length"
      type="button"
      class="vocab-game-action-btn shrink-0 border-white/20 text-fg"
      @click="emit('batchComplete')"
    >
      Turu atla
    </button>
  </div>
</template>
