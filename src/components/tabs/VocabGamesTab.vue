<script setup lang="ts">
import VocabGamesModal from '@/components/vocab-games/VocabGamesModal.vue'
import { buildVocabPool } from '@/lib/vocabGames/pool'
import { VOCAB_GAMES } from '@/lib/vocabGames/registry'
import type { VocabGameId } from '@/lib/vocabGames/types'
import { useAppStore } from '@/stores/app'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

const store = useAppStore()
const { snapshot } = storeToRefs(store)

const pool = computed(() => buildVocabPool(snapshot.value.ai.chunks))

const modalOpen = ref(false)
const activeGameId = ref<VocabGameId | null>(null)
const selectedIds = ref<string[]>([])

watch(
  pool,
  (p) => {
    if (!modalOpen.value && p.length && selectedIds.value.length === 0) {
      selectedIds.value = p.map((w) => w.id)
    }
  },
  { immediate: true },
)

function openGame(id: VocabGameId) {
  activeGameId.value = id
  selectedIds.value = pool.value.length ? pool.value.map((w) => w.id) : []
  modalOpen.value = true
}

function closeModal() {
  modalOpen.value = false
  activeGameId.value = null
}
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-fg-muted">
      AI çıktısındaki kelime hazinesinden kelime seçip tam ekran etkinliklerde çalışın. Pencerede kelime
      listesi önce gizlidir; üstte <strong class="text-fg">Kelimeleri göster</strong> ile açıp kapatabilirsiniz.
    </p>

    <p v-if="!pool.length" class="rounded-md border border-dashed border-white/15 p-6 text-center text-sm text-fg-muted">
      Henüz kelime listesi yok. Öğrenme kartları için önce <strong class="text-fg">AI ile işle</strong> çalıştırın.
    </p>

    <ul v-else class="grid gap-3 sm:grid-cols-2">
      <li
        v-for="g in VOCAB_GAMES"
        :key="g.id"
        class="flex flex-col rounded-lg border border-white/10 bg-surface-overlay/40 p-4 shadow-panel"
      >
        <h3 class="font-semibold text-fg">{{ g.title }}</h3>
        <p class="mt-1 flex-1 text-xs text-fg-muted">{{ g.description }}</p>
        <button
          type="button"
          class="mt-3 min-h-12 w-full touch-manipulation rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-base font-semibold text-accent hover:bg-accent/20 sm:w-auto"
          @click="openGame(g.id)"
        >
          Başlat
        </button>
      </li>
    </ul>

    <VocabGamesModal
      :open="modalOpen"
      :game-id="activeGameId"
      :all-words="pool"
      :selected-ids="selectedIds"
      @close="closeModal"
      @update:selected-ids="selectedIds = $event"
    />
  </div>
</template>
