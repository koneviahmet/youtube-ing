import { shuffle } from '@/lib/vocabGames/shuffle'
import type { VocabCard } from '@/lib/vocabGames/types'
import { computed, type Ref, ref, watch } from 'vue'

type PoolRef = Ref<VocabCard[]> | { readonly value: VocabCard[] }

export const WORD_BATCH_SIZE = 10

/**
 * Seçili kelime havuzunu karıştırır, 10’arlı dilimler; tur bittiğinde sonraki dilime
 * veya listenin sonunda yeniden karıştırılmış havuza döner.
 */
export function useWordBatches(poolRef: PoolRef) {
  const shuffled = ref<VocabCard[]>([])
  const chunkIndex = ref(0)
  /** Oyun bileşenini yeni tur için yeniden oluşturmak için */
  const batchVersion = ref(0)

  function reshuffle() {
    const p = poolRef.value
    shuffled.value = p.length ? shuffle([...p]) : []
    chunkIndex.value = 0
    batchVersion.value++
  }

  watch(() => poolRef.value, reshuffle, { deep: true, immediate: true })

  const chunks = computed(() => {
    const s = shuffled.value
    const out: VocabCard[][] = []
    for (let i = 0; i < s.length; i += WORD_BATCH_SIZE) {
      out.push(s.slice(i, i + WORD_BATCH_SIZE))
    }
    return out
  })

  const currentBatch = computed(() => chunks.value[chunkIndex.value] ?? [])

  const batchProgressLabel = computed(() => {
    const n = chunks.value.length
    if (!n) return ''
    return `Tur ${chunkIndex.value + 1}/${n} · bu turda ${currentBatch.value.length} kelime`
  })

  function nextBatch() {
    if (!chunks.value.length) return
    if (chunkIndex.value < chunks.value.length - 1) {
      chunkIndex.value++
      batchVersion.value++
    } else {
      reshuffle()
    }
  }

  return {
    currentBatch,
    batchProgressLabel,
    nextBatch,
    reshuffle,
    chunkIndex,
    chunks,
    batchVersion,
  }
}
