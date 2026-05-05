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
      class="flex shrink-0 items-center justify-center gap-0.5 border-b border-white/10 px-1 py-1"
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
