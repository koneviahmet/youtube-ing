<script setup lang="ts">
import SplitShell from '@/components/SplitShell.vue'
import StickyBar from '@/components/StickyBar.vue'
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-surface text-fg">
    <StickyBar />
    <SplitShell />
  </div>
</template>
