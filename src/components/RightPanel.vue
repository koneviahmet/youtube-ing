<script setup lang="ts">
import LearningCardsTab from '@/components/tabs/LearningCardsTab.vue'
import QuizTab from '@/components/tabs/QuizTab.vue'
import VocabGamesTab from '@/components/tabs/VocabGamesTab.vue'
import { useAppStore } from '@/stores/app'
import { storeToRefs } from 'pinia'

const store = useAppStore()
const { snapshot } = storeToRefs(store)

const tabs = [
  { id: 'cards' as const, label: 'Öğrenme kartları', text: 'Kartlar' },
  { id: 'games' as const, label: 'Kelime oyunları', text: 'Oyunlar' },
  { id: 'quiz' as const, label: 'Sınav', text: 'Sınav' },
]
</script>

<template>
  <section
    class="flex min-h-0 flex-1 flex-col rounded-lg border border-white/10 bg-surface-raised/30 shadow-panel"
  >
    <div
      class="relative flex shrink-0 items-center justify-center gap-0.5 border-b border-white/10 px-1 py-1 pr-11 sm:pr-12"
      role="tablist"
      aria-label="Sağ panel"
    >
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        role="tab"
        class="flex h-9 min-w-0 flex-1 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent sm:text-sm"
        :class="
          snapshot.activeTab === t.id
            ? 'bg-accent/20 text-accent'
            : 'text-fg-muted hover:bg-white/5 hover:text-fg'
        "
        :aria-selected="snapshot.activeTab === t.id"
        :title="t.label"
        @click="store.setActiveTab(t.id)"
      >
        <span class="truncate">{{ t.text }}</span>
      </button>
      <button
        v-if="snapshot.activeTab === 'cards' && store.learningCardsHasActiveEdit"
        type="button"
        class="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-accent/45 bg-accent/15 text-accent transition-colors hover:bg-accent/25"
        title="Kart düzenleme aktif — güncel durumu JSON olarak indir"
        aria-label="Düzenlenmiş kartların JSON çıktısını indir"
        @click="store.exportSnapshotJsonDownload()"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
          />
        </svg>
      </button>
    </div>

    <div class="thin-scroll min-h-0 flex-1 overflow-y-auto p-3">
      <Transition name="fade" mode="out-in">
        <LearningCardsTab v-if="snapshot.activeTab === 'cards'" key="cards" />
        <VocabGamesTab v-else-if="snapshot.activeTab === 'games'" key="games" />
        <QuizTab v-else key="quiz" />
      </Transition>
    </div>
  </section>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.16s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.thin-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.35) transparent;
}
</style>
