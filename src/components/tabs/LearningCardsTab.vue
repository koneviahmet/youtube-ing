<script setup lang="ts">
import { useSubtitleSync } from '@/composables/useSubtitleSync'
import { useAppStore } from '@/stores/app'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'

const store = useAppStore()
const { snapshot, activeCueIndex } = storeToRefs(store)
const { activeChunk } = useSubtitleSync()

const itemRefs = ref<Map<string, HTMLElement>>(new Map())

function setItemRef(el: unknown, id: string) {
  if (el instanceof HTMLElement) itemRefs.value.set(id, el)
  else itemRefs.value.delete(id)
}

const activeChunkId = computed(() => activeChunk.value?.id ?? null)

watch(activeChunkId, async (id) => {
  if (!id) return
  await nextTick()
  const el = itemRefs.value.get(id)
  el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
})
</script>

<template>
  <div class="space-y-3">
    <p v-if="!snapshot.ai.chunks.length" class="rounded-md border border-dashed border-white/15 p-6 text-center text-sm text-fg-muted">
      Henüz AI çıktısı yok. Önce SRT yükleyip sağ üstte <strong class="text-fg">AI ile işle</strong> düğmesine basın.
    </p>
    <section
      v-else-if="activeChunk"
      class="rounded-lg border border-accent/40 bg-accent/10 p-4 shadow-panel"
    >
      <p class="text-xs font-semibold uppercase tracking-wide text-accent">Şu an dinlediğin cümle</p>
      <p class="mt-1 text-base leading-relaxed text-fg">{{ activeChunk.original }}</p>
      <p class="mt-2 text-sm leading-relaxed text-fg-muted">{{ activeChunk.translation_tr }}</p>
      <p class="mt-2 text-xs text-fg-subtle">Aktif altyazı satırı: {{ activeCueIndex + 1 }}</p>
    </section>
    <article
      v-for="c in snapshot.ai.chunks"
      :key="c.id"
      :ref="(el) => setItemRef(el, c.id)"
      class="rounded-lg border p-4 shadow-panel transition-colors"
      :class="
        c.id === activeChunkId
          ? 'border-accent/60 bg-accent/10'
          : 'border-white/10 bg-surface-overlay/40'
      "
    >
      <p class="text-[13px] font-medium uppercase tracking-wide text-fg-subtle">İngilizce</p>
      <p class="mt-1 text-base leading-relaxed text-fg">{{ c.original }}</p>
      <p class="mt-3 text-[13px] font-medium uppercase tracking-wide text-fg-subtle">Türkçe</p>
      <p class="mt-1 text-sm leading-relaxed text-fg-muted">{{ c.translation_tr }}</p>
      <div v-if="c.key_vocab.length" class="mt-4">
        <p class="text-[13px] font-medium uppercase tracking-wide text-accent">Kelime haznesi</p>
        <ul class="mt-2 grid gap-2 sm:grid-cols-2">
          <li
            v-for="v in c.key_vocab"
            :key="v.word"
            class="rounded-md border border-white/10 bg-surface/60 px-3 py-2"
          >
            <span class="font-semibold text-fg">{{ v.word }}</span>
            <span v-if="v.meaning_tr" class="mt-0.5 block text-sm text-fg-muted">{{ v.meaning_tr }}</span>
            <span v-if="v.example" class="mt-1 block font-mono text-xs text-fg-subtle">{{ v.example }}</span>
          </li>
        </ul>
      </div>
      <p v-if="c.grammar_note" class="mt-4 rounded-md bg-accent/5 px-3 py-2 text-sm text-fg-muted">
        <span class="font-semibold text-accent">Gramer:</span>
        {{ c.grammar_note }}
      </p>
    </article>
  </div>
</template>
