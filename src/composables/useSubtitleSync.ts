import type { LearningChunk } from '@/lib/schema'
import { useAppStore } from '@/stores/app'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

/** Öğrenme parçası — aktif altyazı satırına göre en iyi eşleşme */
export function useSubtitleSync() {
  const store = useAppStore()
  const { snapshot, activeCueIndex } = storeToRefs(store)

  const activeChunk = computed<LearningChunk | null>(() => {
    const idx = activeCueIndex.value
    const chunks = snapshot.value.ai.chunks
    if (idx < 0 || !chunks.length) return null
    const exact = chunks.find((c) => c.srtIndices?.includes(idx))
    if (exact) return exact
    const approx = Math.min(chunks.length - 1, Math.max(0, Math.floor(idx / 4)))
    return chunks[approx] ?? null
  })

  return { activeChunk }
}
