<script setup lang="ts">
import type { VocabCard } from '@/lib/vocabGames/types'
import { computed } from 'vue'

const props = defineProps<{
  words: VocabCard[]
  modelValue: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [ids: string[]]
}>()

const selectedSet = computed(() => new Set(props.modelValue))

function toggle(id: string, checked: boolean) {
  const next = new Set(props.modelValue)
  if (checked) next.add(id)
  else next.delete(id)
  emit('update:modelValue', [...next])
}

function selectAll() {
  emit(
    'update:modelValue',
    props.words.map((w) => w.id),
  )
}

function clearAll() {
  emit('update:modelValue', [])
}

const count = computed(() => props.modelValue.length)
</script>

<template>
  <div class="flex h-full min-h-0 max-h-[38vh] flex-col gap-2 overflow-hidden md:h-auto md:max-h-none">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs font-semibold uppercase text-fg-subtle md:text-sm">
        Kelimeler ({{ count }}/{{ words.length }})
      </p>
      <div class="flex gap-2 touch-manipulation">
        <button
          type="button"
          class="min-h-10 rounded-lg border border-white/15 px-3 py-2 text-xs hover:border-accent/40 md:text-sm"
          @click="selectAll"
        >
          Tümü
        </button>
        <button
          type="button"
          class="min-h-10 rounded-lg border border-white/15 px-3 py-2 text-xs hover:border-accent/40 md:text-sm"
          @click="clearAll"
        >
          Hiçbiri
        </button>
      </div>
    </div>
    <ul class="thin-scroll min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
      <li v-for="w in words" :key="w.id">
        <label
          class="flex min-h-12 cursor-pointer touch-manipulation items-start gap-3 rounded-lg border border-white/10 bg-surface-overlay/40 px-3 py-2.5 hover:border-white/20 [font-size:clamp(0.95rem,2.6vmin+0.4vw,1.45rem)] md:min-h-14"
          :class="selectedSet.has(w.id) ? 'border-accent/40 bg-accent/10' : ''"
        >
          <input
            type="checkbox"
            class="mt-1 h-5 w-5 shrink-0 accent-accent md:h-6 md:w-6"
            :checked="selectedSet.has(w.id)"
            @change="toggle(w.id, ($event.target as HTMLInputElement).checked)"
          />
          <span>
            <span class="font-semibold text-fg">{{ w.word }}</span>
            <span class="mt-0.5 block text-fg-muted">{{ w.meaning_tr }}</span>
          </span>
        </label>
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
