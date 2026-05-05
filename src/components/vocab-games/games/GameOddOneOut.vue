<script setup lang="ts">
import { shuffle } from '@/lib/vocabGames/shuffle'
import { CORRECT_ADVANCE_MS } from '@/lib/vocabGames/correctAdvanceMs'
import type { VocabCard } from '@/lib/vocabGames/types'
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ words: VocabCard[] }>()
const emit = defineEmits<{ batchComplete: [] }>()

const order = ref<number[]>([])
const round = ref(0)
const opts = ref<VocabCard[]>([])
const picked = ref<string | null>(null)
const revealed = ref(false)
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
  round.value = 0
  buildRound()
}

watch(() => props.words, rebuild, { deep: true, immediate: true })

const current = computed(() => {
  const i = order.value[round.value]
  return i !== undefined ? props.words[i] : null
})

function buildRound() {
  const c = current.value
  picked.value = null
  revealed.value = false
  if (!c || props.words.length < 4) {
    opts.value = props.words.length ? [c!] : []
    return
  }
  const wrong = shuffle(props.words.filter((x) => x.id !== c.id)).slice(0, 3)
  opts.value = shuffle([c, ...wrong])
}

watch(round, buildRound)

function choose(id: string) {
  if (revealed.value || !current.value) return
  picked.value = id
  revealed.value = true
}

function nextRound() {
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
  if (!order.value.length) return
  if (round.value >= order.value.length - 1) {
    emit('batchComplete')
    return
  }
  round.value += 1
}

const wasCorrect = computed(() => {
  if (!revealed.value || !picked.value || !current.value) return null
  return picked.value !== current.value.id
})

watch(revealed, (v) => {
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
  if (!v || !wasCorrect.value) return
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
    <p class="vocab-game-caption line-clamp-3">
      Bu Türkçe anlama <strong>uygun olmayan</strong> İngilizce kelimeyi seçin.
    </p>
    <template v-if="current">
      <p
        class="line-clamp-4 shrink-0 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-center [font-size:clamp(1.2rem,3.3vmin+0.55vw,2.35rem)]"
      >
        {{ current.meaning_tr }}
      </p>
      <p v-if="words.length < 4" class="line-clamp-2 shrink-0 text-xs text-warn sm:text-sm md:text-base">
        Bu oyun için en az 4 kelime seçin.
      </p>
      <ul
        v-else
        class="grid min-h-0 flex-1 auto-rows-[minmax(0,1fr)] grid-cols-1 gap-2 md:grid-cols-2 md:gap-3"
      >
        <li v-for="o in opts" :key="o.id" class="min-h-0 min-w-0">
          <button
            type="button"
            class="vocab-game-choice-btn"
            :class="[
              picked === o.id && revealed
                ? o.id !== current.id
                  ? 'border-accent/60 bg-accent/15'
                  : 'border-danger/50 bg-danger/10'
                : 'border-white/10 bg-surface/40 hover:border-white/25',
            ]"
            :disabled="revealed"
            @click="choose(o.id)"
          >
            <span class="line-clamp-4 break-words">{{ o.word }}</span>
          </button>
        </li>
      </ul>
      <p
        v-if="revealed && picked === current.id"
        class="line-clamp-3 shrink-0 text-xs text-danger sm:text-sm md:text-base"
      >
        Bu kelime aslında uyuyor — üç diğerinden birini seçmeliydin.
      </p>
      <p
        v-else-if="revealed && picked && picked !== current.id"
        class="line-clamp-1 shrink-0 text-xs text-accent sm:text-base md:text-lg"
      >
        Doğru.
      </p>
      <button
        v-if="revealed && picked === current.id"
        type="button"
        class="vocab-game-action-btn shrink-0 border-white/20 text-fg"
        @click="nextRound"
      >
        Sonraki
      </button>
    </template>
  </div>
</template>
