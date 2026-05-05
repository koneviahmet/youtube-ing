<script setup lang="ts">
import { shuffle } from '@/lib/vocabGames/shuffle'
import { CORRECT_ADVANCE_MS } from '@/lib/vocabGames/correctAdvanceMs'
import type { VocabCard } from '@/lib/vocabGames/types'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ words: VocabCard[] }>()

const emit = defineEmits<{
  batchComplete: []
}>()

type Tile = {
  uid: string
  pairId: string
  face: 'en' | 'tr'
  label: string
  matched: boolean
}

let uid = 0
function nextUid() {
  uid += 1
  return `t-${uid}`
}

const tiles = ref<Tile[]>([])
const flippedIds = ref<string[]>([])

const pairSubset = computed(() => props.words.slice(0, Math.min(6, props.words.length)))

function buildTiles() {
  uid = 0
  flippedIds.value = []
  const list = pairSubset.value
  const flat: Tile[] = []
  for (const w of list) {
    flat.push(
      { uid: nextUid(), pairId: w.id, face: 'en', label: w.word, matched: false },
      { uid: nextUid(), pairId: w.id, face: 'tr', label: w.meaning_tr, matched: false },
    )
  }
  tiles.value = shuffle(flat)
}

watch(() => props.words, buildTiles, { deep: true })
onMounted(buildTiles)

function onTile(t: Tile) {
  if (t.matched || flippedIds.value.length >= 2) return
  if (flippedIds.value.includes(t.uid)) return

  flippedIds.value = [...flippedIds.value, t.uid]
  if (flippedIds.value.length < 2) return

  const [id1, id2] = flippedIds.value
  const a = tiles.value.find((x) => x.uid === id1)
  const b = tiles.value.find((x) => x.uid === id2)
  if (!a || !b) {
    flippedIds.value = []
    return
  }
  if (a.pairId === b.pairId && a.face !== b.face) {
    tiles.value = tiles.value.map((x) =>
      x.pairId === a.pairId ? { ...x, matched: true } : x,
    )
    flippedIds.value = []
  } else {
    window.setTimeout(() => {
      flippedIds.value = []
    }, 700)
  }
}

function isFaceUp(t: Tile) {
  return t.matched || flippedIds.value.includes(t.uid)
}

const done = computed(
  () =>
    pairSubset.value.length > 0 &&
    tiles.value.length > 0 &&
    tiles.value.every((t) => t.matched),
)

let batchTimer: ReturnType<typeof setTimeout> | null = null
watch(done, (v) => {
  if (batchTimer) {
    clearTimeout(batchTimer)
    batchTimer = null
  }
  if (!v) return
  batchTimer = window.setTimeout(() => {
    batchTimer = null
    emit('batchComplete')
  }, CORRECT_ADVANCE_MS)
})
onUnmounted(() => {
  if (batchTimer) clearTimeout(batchTimer)
})
</script>

<template>
  <div class="vocab-game-shell">
    <p class="vocab-game-caption line-clamp-2 text-center">
      En fazla 6 kelime çifti; aynı kelimenin İngilizce ve Türkçe kartını bulun.
    </p>
    <div
      class="grid min-h-0 flex-1 touch-manipulation grid-cols-2 auto-rows-[minmax(0,1fr)] gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4"
    >
      <button
        v-for="t in tiles"
        :key="t.uid"
        type="button"
        class="flex min-h-0 touch-manipulation items-center justify-center overflow-hidden rounded-xl border p-1 text-center text-[clamp(0.85rem,3.2vmin+0.45vw,1.4rem)] leading-tight transition-colors focus-visible:ring-2 focus-visible:ring-accent sm:p-2"
        :class="
          t.matched
            ? 'border-accent/50 bg-accent/15 text-fg'
            : isFaceUp(t)
              ? 'border-white/20 bg-surface-overlay text-fg'
              : 'border-white/10 bg-accent/5 text-transparent hover:border-accent/30'
        "
        :disabled="t.matched"
        @click="onTile(t)"
      >
        <span v-if="isFaceUp(t) || t.matched" class="line-clamp-4 w-full min-w-0 break-words text-center">{{
          t.label
        }}</span>
        <span v-else class="w-full text-center text-fg-subtle">?</span>
      </button>
    </div>
    <p v-if="done" class="line-clamp-2 shrink-0 text-center text-sm font-semibold text-accent sm:text-base">
      Hepsi eşleşti.
    </p>
  </div>
</template>
