<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { storeToRefs } from 'pinia'
import { nextTick, ref, watch } from 'vue'

const store = useAppStore()
const { snapshot, activeCueIndex, playerCurrentSec, srtError } = storeToRefs(store)

const listRef = ref<HTMLElement | null>(null)
const itemRefs = ref<Map<string, HTMLElement>>(new Map())

function setItemRef(el: unknown, id: string) {
  if (el instanceof HTMLElement) itemRefs.value.set(id, el)
  else itemRefs.value.delete(id)
}

function fmt(sec: number) {
  const s = Math.floor(sec % 60)
  const m = Math.floor((sec / 60) % 60)
  const h = Math.floor(sec / 3600)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

watch(
  activeCueIndex,
  async (idx) => {
    if (idx < 0) return
    await nextTick()
    const block = snapshot.value.srtBlocks[idx]
    if (!block) return
    const el = itemRefs.value.get(block.id)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  },
)
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col rounded-lg border border-white/10 bg-surface-raised/40 shadow-panel"
  >
    <div class="flex items-center justify-between border-b border-white/10 px-3 py-2">
      <span class="text-xs font-medium uppercase tracking-wide text-fg-muted">Altyazı</span>
      <span class="font-mono text-xs text-accent">{{ fmt(playerCurrentSec) }}</span>
    </div>
    <p v-if="srtError" class="px-3 py-2 text-sm text-danger">{{ srtError }}</p>
    <div
      v-else-if="!snapshot.srtBlocks.length"
      class="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-muted"
    >
      Soldan bir .srt dosyası yükleyin; satırlar burada senkron görünür ve tıklayınca video o ana gider.
    </div>
    <ul
      v-else
      ref="listRef"
      class="thin-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2"
      role="list"
    >
      <li
        v-for="(b, i) in snapshot.srtBlocks"
        :key="b.id"
        :ref="(el) => setItemRef(el, b.id)"
        role="listitem"
      >
        <button
          type="button"
          class="w-full rounded-md border px-2 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-accent"
          :class="
            i === activeCueIndex
              ? 'border-accent/60 bg-accent/10 text-fg'
              : 'border-transparent bg-transparent text-fg-muted hover:border-white/10 hover:bg-white/5 hover:text-fg'
          "
          @click="store.seekSeconds(b.startSec + 0.02, true)"
        >
          <span class="block font-mono text-[11px] text-fg-subtle">
            {{ fmt(b.startSec) }} → {{ fmt(b.endSec) }}
          </span>
          <span class="mt-1 block text-sm leading-snug">{{ b.text }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.thin-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.35) transparent;
}
</style>
