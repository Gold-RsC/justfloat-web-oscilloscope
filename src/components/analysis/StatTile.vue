<script setup lang="ts">
defineProps<{
  label: string
  value: string
  unit?: string
  hint?: string
  isDark: boolean
}>()
</script>

<template>
  <div
    class="rounded-lg border px-3 py-2.5 min-w-0"
    :class="isDark ? 'bg-gray-900/50 border-gray-700' : 'bg-gray-50 border-gray-200'"
  >
    <div class="text-[11px] truncate" :class="isDark ? 'text-gray-400' : 'text-gray-600'">{{ label }}</div>
    <div class="mt-1 flex items-baseline gap-1 min-w-0">
      <span
        class="text-base font-semibold font-mono tabular-nums truncate"
        :class="isDark ? 'text-white' : 'text-gray-900'"
      >{{ value }}</span>
      <span v-if="unit" class="text-[11px] flex-shrink-0" :class="isDark ? 'text-gray-400' : 'text-gray-600'">{{ unit }}</span>
    </div>
    <div v-if="hint" class="mt-0.5 text-[10px] leading-snug" :class="isDark ? 'text-gray-500' : 'text-gray-500'">{{ hint }}</div>
  </div>
</template>
