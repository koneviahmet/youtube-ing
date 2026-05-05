<script setup lang="ts">
import RightPanel from '@/components/RightPanel.vue'
import SubtitleList from '@/components/SubtitleList.vue'
import YoutubePlayer from '@/components/YoutubePlayer.vue'
import { useAppStore } from '@/stores/app'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const store = useAppStore()
const { snapshot, videoId } = storeToRefs(store)

const shellRef = ref<HTMLElement | null>(null)
const dragging = ref(false)
const mqWide = ref(false)

function refreshMq() {
  mqWide.value = window.matchMedia('(min-width: 768px)').matches
}

const leftFlex = computed(() => {
  if (!mqWide.value) return undefined
  const pct = Math.min(95, Math.max(20, snapshot.value.panelRatio * 100))
  return { flex: `0 0 ${pct}%` } as const
})

function onDividerDown(e: MouseEvent) {
  e.preventDefault()
  dragging.value = true
}

function onMove(e: MouseEvent) {
  if (!dragging.value || !shellRef.value || !mqWide.value) return
  const rect = shellRef.value.getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / rect.width
  store.setPanelRatio(ratio)
}

function onUp() {
  dragging.value = false
}

onMounted(() => {
  refreshMq()
  window.addEventListener('resize', refreshMq)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', refreshMq)
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', onUp)
})
</script>

<template>
  <div
    ref="shellRef"
    class="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row"
    :class="dragging ? 'cursor-col-resize select-none md:cursor-col-resize' : ''"
  >
    <section
      class="flex min-h-[42vh] shrink-0 flex-col gap-2 border-white/10 p-2 md:min-h-0 md:border-r md:p-3"
      :style="leftFlex"
    >
      <YoutubePlayer :video-id="videoId" />
      <SubtitleList />
    </section>

    <div
      class="hidden h-auto w-px shrink-0 bg-white/15 md:block md:h-auto md:w-2 md:bg-transparent md:px-1"
      role="separator"
      aria-orientation="vertical"
      aria-label="Panel genişliği"
      tabindex="0"
      @mousedown="onDividerDown"
    >
      <div
        class="mx-auto hidden h-full w-1 rounded-full bg-white/20 hover:bg-accent/50 md:block"
      />
    </div>

    <section class="flex min-h-[38vh] min-w-0 flex-1 flex-col p-2 md:min-h-0 md:p-3">
      <RightPanel />
    </section>
  </div>
</template>
