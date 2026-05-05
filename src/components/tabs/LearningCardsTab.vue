<script setup lang="ts">
import { useSubtitleSync } from '@/composables/useSubtitleSync'
import type { KeyVocabItem, LearningChunk, SubtitleBlock } from '@/lib/schema'
import { useAppStore } from '@/stores/app'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'

const store = useAppStore()
const { snapshot, activeCueIndex, playerCurrentSec } = storeToRefs(store)
const { activeChunk } = useSubtitleSync()

const timingPanelChunkId = ref<string | null>(null)

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

function snapSec(t: number) {
  return Math.round(Math.max(0, t) * 100) / 100
}

function fmtSec(sec: number) {
  const s = Math.floor(sec % 60)
  const m = Math.floor((sec / 60) % 60)
  const h = Math.floor(sec / 3600)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** SRT indeksleriyle türeyen kesit */
function getSrtDerivedPlaybackRange(chunk: LearningChunk): { startSec: number; endSec: number } | null {
  const indices = chunk.srtIndices?.filter((n) => Number.isInteger(n) && n >= 0) ?? []
  if (!indices.length) return null
  const blocks = indices
    .map((idx) => snapshot.value.srtBlocks[idx])
    .filter((b): b is SubtitleBlock => !!b)
  if (!blocks.length) return null
  const startSec = Math.min(...blocks.map((b) => b.startSec))
  const endSec = Math.max(...blocks.map((b) => b.endSec))
  if (!(Number.isFinite(startSec) && Number.isFinite(endSec) && endSec > startSec)) return null
  return { startSec, endSec }
}

/** Yerel zaman ayarları birleştirilir; eksik kenar için SRT türevi kullanılır */
function getChunkPlaybackRange(chunk: LearningChunk): { startSec: number; endSec: number } | null {
  const base = getSrtDerivedPlaybackRange(chunk)
  const hasStart = typeof chunk.playbackStartSec === 'number' && Number.isFinite(chunk.playbackStartSec)
  const hasEnd = typeof chunk.playbackEndSec === 'number' && Number.isFinite(chunk.playbackEndSec)
  const startSec = hasStart ? snapSec(chunk.playbackStartSec!) : base?.startSec
  const endSec = hasEnd ? snapSec(chunk.playbackEndSec!) : base?.endSec
  if (startSec !== undefined && endSec !== undefined && endSec > startSec) {
    return { startSec, endSec }
  }
  return null
}

function playChunkSegment(chunk: LearningChunk) {
  const range = getChunkPlaybackRange(chunk)
  if (!range) return
  window.dispatchEvent(
    new CustomEvent('youtube-ing-play-segment', {
      detail: { startSec: range.startSec, endSec: range.endSec },
    }),
  )
}

function chunkEditing(chunk: LearningChunk): boolean {
  return store.learningCardsEditingChunkIds.includes(chunk.id)
}

function toggleChunkEdit(chunk: LearningChunk) {
  store.toggleLearningCardChunkEditing(chunk.id)
}

function grammarModel(chunk: LearningChunk): string {
  return chunk.grammar_note ?? ''
}

function setGrammarModel(chunk: LearningChunk, raw: string) {
  chunk.grammar_note = raw.trim() ? raw : undefined
}

function addVocabItem(chunk: LearningChunk) {
  const row: KeyVocabItem = { word: '', meaning_tr: '', example: '' }
  chunk.key_vocab = [...chunk.key_vocab, row]
}

function removeVocabAt(chunk: LearningChunk, index: number) {
  chunk.key_vocab = chunk.key_vocab.filter((_, i) => i !== index)
}

function toggleTimingPanel(chunkId: string) {
  timingPanelChunkId.value = timingPanelChunkId.value === chunkId ? null : chunkId
}

/** Panelde gösterilen / ± ile değişen başlangıç (tam saniye; özel ayar ya da altyazı aralığı) */
function getDisplayStartSec(chunk: LearningChunk): number {
  const base = getSrtDerivedPlaybackRange(chunk)
  if (typeof chunk.playbackStartSec === 'number' && Number.isFinite(chunk.playbackStartSec)) {
    return Math.round(chunk.playbackStartSec)
  }
  if (base) return Math.round(base.startSec)
  return 0
}

function getDisplayEndSec(chunk: LearningChunk): number {
  const base = getSrtDerivedPlaybackRange(chunk)
  if (typeof chunk.playbackEndSec === 'number' && Number.isFinite(chunk.playbackEndSec)) {
    return Math.round(chunk.playbackEndSec)
  }
  if (base) return Math.round(base.endSec)
  const s = getDisplayStartSec(chunk)
  return Math.max(s + 1, 1)
}

function bumpPlaybackStart(chunk: LearningChunk, deltaSec: number) {
  const next = Math.max(0, getDisplayStartSec(chunk) + deltaSec)
  chunk.playbackStartSec = next
}

function bumpPlaybackEnd(chunk: LearningChunk, deltaSec: number) {
  const next = Math.max(0, getDisplayEndSec(chunk) + deltaSec)
  chunk.playbackEndSec = next
}

function clearPlaybackOverrides(chunk: LearningChunk) {
  chunk.playbackStartSec = undefined
  chunk.playbackEndSec = undefined
}

function timingPanelOpen(chunkId: string) {
  return timingPanelChunkId.value === chunkId
}
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
      class="relative rounded-lg border p-4 pb-4 pr-[7.25rem] shadow-panel transition-colors sm:pr-32"
      :class="
        c.id === activeChunkId
          ? 'border-accent/60 bg-accent/10'
          : 'border-white/10 bg-surface-overlay/40'
      "
    >
      <div class="absolute right-3 top-3 flex gap-1">
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-35"
          :class="
            chunkEditing(c)
              ? 'border-accent/50 bg-accent/15 text-accent'
              : 'border-white/15 bg-surface/70 text-fg-muted'
          "
          title="Kartı düzenle veya görüntüle"
          :aria-label="'Kartı düzenle'"
          :aria-pressed="chunkEditing(c)"
          @click="toggleChunkEdit(c)"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors hover:border-accent/50 hover:text-accent"
          :class="
            timingPanelOpen(c.id)
              ? 'border-accent/50 bg-accent/15 text-accent'
              : (c.playbackStartSec !== undefined || c.playbackEndSec !== undefined)
                ? 'border-amber-500/35 bg-amber-500/10 text-amber-200/90'
                : 'border-white/15 bg-surface/70 text-fg-muted'
          "
          title="Videodaki kesitin başını ve sonunu ayarla"
          aria-label="Oynatma aralığı"
          :aria-expanded="timingPanelOpen(c.id)"
          @click.stop="toggleTimingPanel(c.id)"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke-linecap="round" stroke-linejoin="round" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 2" />
          </svg>
        </button>
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/15 bg-surface/70 text-fg-muted transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-35"
          :disabled="!getChunkPlaybackRange(c)"
          title="Bu cümleyi oynat"
          aria-label="Bu cümleyi oynat"
          @click="playChunkSegment(c)"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      </div>
      <div
        v-if="timingPanelOpen(c.id)"
        class="absolute right-3 top-[2.875rem] z-20 w-[min(17.5rem,calc(100%-1.5rem))] rounded-lg border border-white/15 bg-surface-raised px-3 py-2.5 text-left shadow-xl"
        role="dialog"
        aria-label="Oynatma aralığı"
        @click.stop
      >
        <p class="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Kesit süreleri</p>
        <p class="mt-1 text-[11px] text-fg-muted">
          Oynatıcı: <span class="font-mono text-fg-muted/90">{{ fmtSec(playerCurrentSec) }}</span>
        </p>
        <p v-if="!getChunkPlaybackRange(c)" class="mt-2 text-[11px] leading-snug text-amber-200/85">
          Bitiş süresini baştan büyük yapınca oynatmak mümkün olur.
        </p>
        <div class="mt-2 flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <span class="shrink-0 text-[11px] text-fg-muted">Başlangıç</span>
            <div class="flex min-w-0 flex-1 items-center justify-end gap-0.5">
              <button
                type="button"
                class="flex h-7 w-8 shrink-0 items-center justify-center rounded border border-white/15 bg-surface/60 text-sm leading-none text-fg hover:border-accent/40 hover:text-accent"
                aria-label="Başlangıcı bir saniye azalt"
                @click="bumpPlaybackStart(c, -1)"
              >
                −
              </button>
              <span class="min-w-[3.75rem] text-center font-mono text-sm tabular-nums text-accent">{{
                fmtSec(getDisplayStartSec(c))
              }}</span>
              <button
                type="button"
                class="flex h-7 w-8 shrink-0 items-center justify-center rounded border border-white/15 bg-surface/60 text-sm leading-none text-fg hover:border-accent/40 hover:text-accent"
                aria-label="Başlangıcı bir saniye artır"
                @click="bumpPlaybackStart(c, 1)"
              >
                +
              </button>
            </div>
          </div>
          <div class="flex items-center justify-between gap-2">
            <span class="shrink-0 text-[11px] text-fg-muted">Bitiş</span>
            <div class="flex min-w-0 flex-1 items-center justify-end gap-0.5">
              <button
                type="button"
                class="flex h-7 w-8 shrink-0 items-center justify-center rounded border border-white/15 bg-surface/60 text-sm leading-none text-fg hover:border-accent/40 hover:text-accent"
                aria-label="Bitişi bir saniye azalt"
                @click="bumpPlaybackEnd(c, -1)"
              >
                −
              </button>
              <span class="min-w-[3.75rem] text-center font-mono text-sm tabular-nums text-accent">{{
                fmtSec(getDisplayEndSec(c))
              }}</span>
              <button
                type="button"
                class="flex h-7 w-8 shrink-0 items-center justify-center rounded border border-white/15 bg-surface/60 text-sm leading-none text-fg hover:border-accent/40 hover:text-accent"
                aria-label="Bitişi bir saniye artır"
                @click="bumpPlaybackEnd(c, 1)"
              >
                +
              </button>
            </div>
          </div>
          <button
            v-if="c.playbackStartSec !== undefined || c.playbackEndSec !== undefined"
            type="button"
            class="w-full rounded border border-white/10 bg-transparent px-2 py-1.5 text-left text-[11px] text-fg-muted underline decoration-white/15 hover:text-amber-200"
            @click="clearPlaybackOverrides(c)"
          >
            Özel başlangıç/bitişi kaldır (altyazı aralığı)
          </button>
        </div>
      </div>
      <div class="min-w-0">
        <p class="text-[13px] font-medium uppercase tracking-wide text-fg-subtle">İngilizce</p>
        <textarea
          v-if="chunkEditing(c)"
          v-model="c.original"
          rows="3"
          class="mt-1 w-full resize-y rounded-md border border-white/15 bg-surface/80 px-2 py-1.5 text-base leading-relaxed text-fg outline-none ring-accent/40 focus-visible:ring-2"
          aria-label="İngilizce metin"
        />
        <p v-else class="mt-1 text-base leading-relaxed text-fg">{{ c.original }}</p>

        <p class="mt-3 text-[13px] font-medium uppercase tracking-wide text-fg-subtle">Türkçe</p>
        <textarea
          v-if="chunkEditing(c)"
          v-model="c.translation_tr"
          rows="3"
          class="mt-1 w-full resize-y rounded-md border border-white/15 bg-surface/80 px-2 py-1.5 text-sm leading-relaxed text-fg outline-none ring-accent/40 focus-visible:ring-2"
          aria-label="Türkçe çeviri"
        />
        <p v-else class="mt-1 text-sm leading-relaxed text-fg-muted">{{ c.translation_tr }}</p>

        <div v-if="c.key_vocab.length || chunkEditing(c)" class="mt-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-[13px] font-medium uppercase tracking-wide text-accent">Kelime haznesi</p>
            <button
              v-if="chunkEditing(c)"
              type="button"
              class="rounded border border-white/15 bg-surface/60 px-2 py-0.5 text-xs text-fg-muted hover:border-accent/40 hover:text-accent"
              @click="addVocabItem(c)"
            >
              Kelime ekle
            </button>
          </div>
          <ul class="mt-2 grid gap-2 sm:grid-cols-2">
            <li
              v-for="(v, vi) in c.key_vocab"
              :key="vi"
              class="rounded-md border border-white/10 bg-surface/60 px-3 py-2"
            >
              <template v-if="chunkEditing(c)">
                <label class="sr-only">{{ vi + 1 }}. kelime (EN)</label>
                <input
                  v-model="v.word"
                  type="text"
                  class="w-full rounded border border-white/10 bg-surface/90 px-2 py-1 text-sm font-semibold text-fg outline-none ring-accent/30 focus-visible:ring-2"
                  placeholder="Kelime"
                />
                <label class="sr-only">{{ vi + 1 }}. anlam</label>
                <input
                  v-model="v.meaning_tr"
                  type="text"
                  class="mt-2 w-full rounded border border-white/10 bg-surface/90 px-2 py-1 text-sm text-fg-muted outline-none ring-accent/30 focus-visible:ring-2"
                  placeholder="Türkçe anlam"
                />
                <label class="sr-only">{{ vi + 1 }}. örnek cümle</label>
                <textarea
                  v-model="v.example"
                  rows="2"
                  class="mt-2 w-full resize-y rounded border border-white/10 bg-surface/90 px-2 py-1 font-mono text-xs text-fg-subtle outline-none ring-accent/30 focus-visible:ring-2"
                  placeholder="Örnek cümle"
                />
                <button
                  type="button"
                  class="mt-2 text-xs text-fg-muted underline decoration-white/25 hover:text-accent"
                  @click="removeVocabAt(c, vi)"
                >
                  Kaldır
                </button>
              </template>
              <template v-else>
                <span class="font-semibold text-fg">{{ v.word }}</span>
                <span v-if="v.meaning_tr" class="mt-0.5 block text-sm text-fg-muted">{{ v.meaning_tr }}</span>
                <span v-if="v.example" class="mt-1 block font-mono text-xs text-fg-subtle">{{ v.example }}</span>
              </template>
            </li>
          </ul>
        </div>
        <div v-if="c.grammar_note || chunkEditing(c)" class="mt-4 rounded-md bg-accent/5 px-3 py-2 text-sm text-fg-muted">
          <span class="font-semibold text-accent">Gramer:</span>
          <textarea
            v-if="chunkEditing(c)"
            :value="grammarModel(c)"
            rows="3"
            class="mt-2 w-full resize-y rounded border border-white/10 bg-surface/80 px-2 py-1.5 text-sm leading-relaxed text-fg-muted outline-none ring-accent/40 focus-visible:ring-2"
            aria-label="Gramer notu"
            @input="setGrammarModel(c, ($event.target as HTMLTextAreaElement).value)"
          />
          <template v-else>
            {{ c.grammar_note }}
          </template>
        </div>
      </div>
    </article>
  </div>
</template>
