<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

const store = useAppStore()
const { snapshot } = storeToRefs(store)

const picks = ref<Record<string, string>>({})
const revealed = ref(false)

const questions = computed(() => snapshot.value.ai.quiz)

function choose(qid: string, oid: string) {
  picks.value = { ...picks.value, [qid]: oid }
}

const score = computed(() => {
  let n = 0
  for (const q of questions.value) {
    if (picks.value[q.id] === q.correctOptionId) n += 1
  }
  return n
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-fg-muted">
        {{ questions.length ? `${questions.length} soru` : 'Henüz sınav üretilmedi.' }}
      </p>
      <button
        v-if="questions.length"
        type="button"
        class="rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold hover:border-accent/40"
        @click="revealed = !revealed"
      >
        {{ revealed ? 'Cevapları gizle' : 'Cevapları göster' }}
      </button>
    </div>

    <article
      v-for="(q, idx) in questions"
      :key="q.id"
      class="rounded-lg border border-white/10 bg-surface-overlay/40 p-4"
    >
      <p class="text-sm font-semibold text-fg">
        <span class="text-fg-subtle">{{ idx + 1 }}.</span>
        {{ q.prompt }}
      </p>
      <ul class="mt-3 space-y-2">
        <li v-for="o in q.options" :key="o.id">
          <button
            type="button"
            class="flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent"
            :class="
              picks[q.id] === o.id
                ? 'border-accent/60 bg-accent/10 text-fg'
                : 'border-white/10 bg-surface/40 text-fg-muted hover:border-white/20'
            "
            @click="choose(q.id, o.id)"
          >
            <span class="font-mono text-xs text-fg-subtle">{{ o.id }}</span>
            <span>{{ o.text }}</span>
          </button>
        </li>
      </ul>
      <p
        v-if="revealed"
        class="mt-3 rounded-md bg-warn/10 px-3 py-2 text-xs text-warn"
      >
        Doğru seçenek:
        <span class="font-semibold">{{ q.correctOptionId }}</span>
      </p>
    </article>

    <p v-if="questions.length" class="text-sm text-fg-muted">
      Skor: <span class="font-semibold text-accent">{{ score }}</span> / {{ questions.length }}
    </p>
  </div>
</template>
