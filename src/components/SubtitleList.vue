<script setup lang="ts">
import type { SubtitleBlock } from '@/lib/schema'
import { useAppStore } from '@/stores/app'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'

const store = useAppStore()
const { snapshot, activeCueIndex, playerCurrentSec, srtError } = storeToRefs(store)

/** Üst çubuktan açılır; açıkken satıra tıklamak düzenleme modalını açar (kapalıyken tıklama videoya gider). */
const subtitleEditMode = ref(false)
/** Açıkken satır sürüklenip başka satırın üzerine bırakılarak birleştirilir. */
const mergeDragMode = ref(false)
const dragSourceIndex = ref<number | null>(null)
const dropHoverIndex = ref<number | null>(null)
/** Sürükle-bıraktan sonra oluşan hayalet tıklamayı yutar. */
const suppressRowClickUntil = ref(0)
const editModalBlockId = ref<string | null>(null)
const draftText = ref('')
const modalTextareaRef = ref<HTMLTextAreaElement | null>(null)

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

function openEditModal(b: SubtitleBlock) {
  editModalBlockId.value = b.id
  draftText.value = b.text
  void nextTick(() => modalTextareaRef.value?.focus())
}

function dismissEditModal() {
  editModalBlockId.value = null
}

function saveEditModal() {
  const id = editModalBlockId.value
  if (!id) return
  const block = snapshot.value.srtBlocks.find((x) => x.id === id)
  if (block) {
    block.text = draftText.value.replace(/\r\n/g, '\n').trim()
  }
  dismissEditModal()
}

const editingModalBlock = computed(() => {
  const id = editModalBlockId.value
  return id ? snapshot.value.srtBlocks.find((x) => x.id === id) ?? null : null
})

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

watch(subtitleEditMode, (on) => {
  if (!on) {
    dismissEditModal()
    for (const b of snapshot.value.srtBlocks) {
      b.text = b.text.replace(/\r\n/g, '\n').trim()
    }
  }
})

watch(mergeDragMode, (on) => {
  if (!on) {
    dragSourceIndex.value = null
    dropHoverIndex.value = null
  }
})

function onMergeDragStart(e: DragEvent, i: number) {
  if (!mergeDragMode.value) return
  dragSourceIndex.value = i
  e.dataTransfer!.effectAllowed = 'move'
  e.dataTransfer!.setData('text/plain', String(i))
}

function onMergeDragEnd() {
  dragSourceIndex.value = null
  dropHoverIndex.value = null
}

function onMergeDragOver(i: number) {
  if (dragSourceIndex.value === null) return
  if (dropHoverIndex.value !== i) dropHoverIndex.value = i
}

function onMergeDrop(dropIdx: number) {
  const from = dragSourceIndex.value
  if (from === null || from === dropIdx) {
    onMergeDragEnd()
    return
  }
  store.mergeSrtBlocksOnto(from, dropIdx)
  suppressRowClickUntil.value = Date.now() + 350
  onMergeDragEnd()
}

function onRowActivate(b: SubtitleBlock) {
  if (Date.now() < suppressRowClickUntil.value) return
  if (subtitleEditMode.value) openEditModal(b)
  else store.seekSeconds(b.startSec + 0.02, true)
}

function rowButtonClass(i: number) {
  return [
    'w-full rounded-md border px-2 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-accent',
    activeCueIndex.value === i
      ? 'border-accent/60 bg-accent/10 text-fg'
      : 'border-transparent bg-transparent text-fg-muted hover:border-white/10 hover:bg-white/5 hover:text-fg',
  ]
}
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col rounded-lg border border-white/10 bg-surface-raised/40 shadow-panel"
  >
    <div class="relative flex items-center border-b border-white/10 px-3 py-2">
      <span class="text-xs font-medium uppercase tracking-wide text-fg-muted">Altyazı</span>
      <span
        class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-xs tabular-nums text-accent"
        aria-live="polite"
      >
        {{ fmt(playerCurrentSec) }}
      </span>
      <div class="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:ring-accent"
          :class="
            mergeDragMode
              ? 'border-amber-500/55 bg-amber-500/12 text-amber-400'
              : 'border-white/15 text-fg-muted hover:border-white/25 hover:bg-white/5 hover:text-fg'
          "
          :aria-pressed="mergeDragMode"
          aria-label="Satır birleştirme modunu aç veya kapat"
          :title="
            mergeDragMode
              ? 'Birleştirme modunu kapatın.'
              : 'Açıkken bir satırı sürükleyip diğerinin üzerine bırakın: metin birleşir; süre bıraktığınız satırın başlangıcı ile sürüklediğiniz satırın bitişi olur.'
          "
          @click="mergeDragMode = !mergeDragMode"
        >
          <!-- git-branch / birleştir -->
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <circle cx="18" cy="19" r="2.25" />
            <circle cx="6" cy="5" r="2.25" />
            <path stroke-linecap="round" d="M6 7.25v2.5a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v1.75" />
          </svg>
        </button>
        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:ring-accent"
          :class="
            subtitleEditMode
              ? 'border-accent/55 bg-accent/15 text-accent'
              : 'border-white/15 text-fg-muted hover:border-white/25 hover:bg-white/5 hover:text-fg'
          "
          :aria-pressed="subtitleEditMode"
          :aria-label="subtitleEditMode ? 'Düzenleme modunu kapat' : 'Düzenleme modunu aç'"
          :title="
            subtitleEditMode
              ? 'Düzenlemeyi kapatın; satırlar yine videoya gider. AI güncel metni kullanır.'
              : 'Açıkken satıra tıklayınca metin düzenlenir; kapalıyken tıklama videoda o ana gider.'
          "
          @click="subtitleEditMode = !subtitleEditMode"
        >
          <svg
            v-if="!subtitleEditMode"
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
            />
          </svg>
          <svg
            v-else
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
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
        :draggable="mergeDragMode"
        class="rounded-md transition-[opacity,box-shadow]"
        :class="{
          'cursor-grab active:cursor-grabbing': mergeDragMode,
          'opacity-65': mergeDragMode && dragSourceIndex === i,
          'ring-2 ring-amber-500/75 ring-offset-2 ring-offset-surface-raised':
            mergeDragMode && dropHoverIndex === i && dragSourceIndex !== i,
        }"
        @dragstart="onMergeDragStart($event, i)"
        @dragend="onMergeDragEnd"
        @dragover.prevent="onMergeDragOver(i)"
        @drop.prevent="onMergeDrop(i)"
      >
        <button
          type="button"
          draggable="false"
          :class="rowButtonClass(i)"
          :aria-label="subtitleEditMode ? 'Alt yazıyı düzenle' : 'Videoda bu zamana git'"
          @click="onRowActivate(b)"
        >
          <span class="block font-mono text-[11px] text-fg-subtle">
            {{ fmt(b.startSec) }} → {{ fmt(b.endSec) }}
          </span>
          <span class="mt-1 block text-sm leading-snug">{{ b.text }}</span>
        </button>
      </li>
    </ul>

    <Teleport to="body">
      <div
        v-if="editingModalBlock"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click.self="dismissEditModal"
        @keydown.esc="dismissEditModal"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="subtitle-edit-title"
          class="w-full max-w-lg rounded-xl border border-white/15 bg-surface-raised p-4 shadow-2xl"
          @click.stop
        >
          <h2 id="subtitle-edit-title" class="text-sm font-semibold text-fg">
            Alt yazıyı düzenle
          </h2>
          <p class="mt-1 font-mono text-[11px] tabular-nums text-fg-muted">
            {{ fmt(editingModalBlock.startSec) }} → {{ fmt(editingModalBlock.endSec) }}
          </p>
          <textarea
            ref="modalTextareaRef"
            v-model="draftText"
            rows="6"
            class="mt-3 w-full resize-y rounded-md border border-white/15 bg-surface/90 px-3 py-2 text-sm leading-relaxed text-fg focus:border-accent/45 focus:outline-none focus:ring-1 focus:ring-accent/35"
            @keydown.esc.stop="dismissEditModal"
          />
          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-md border border-white/15 px-3 py-1.5 text-sm text-fg-muted transition-colors hover:border-white/25 hover:bg-white/5 hover:text-fg"
              @click="dismissEditModal"
            >
              İptal
            </button>
            <button
              type="button"
              class="rounded-md border border-accent/50 bg-accent/15 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/25"
              @click="saveEditModal"
            >
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.thin-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.35) transparent;
}
</style>
