<script setup lang="ts">
defineProps<{
  tone: 'info' | 'warning' | 'error'
  message: string
  isDark: boolean
}>()

const toneClass = {
  info: 'text-blue-500',
  warning: 'text-amber-500',
  error: 'text-red-500'
}

const surfaceClass = (tone: 'info' | 'warning' | 'error', isDark: boolean) => {
  if (isDark) {
    if (tone === 'error') return 'bg-red-900/20 border-red-700/40'
    if (tone === 'warning') return 'bg-amber-900/20 border-amber-700/40'
    return 'bg-blue-900/20 border-blue-700/40'
  }
  if (tone === 'error') return 'bg-red-50 border-red-200'
  if (tone === 'warning') return 'bg-amber-50 border-amber-200'
  return 'bg-blue-50 border-blue-200'
}
</script>

<template>
  <div class="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs mb-3" :class="surfaceClass(tone, isDark)">
    <svg class="w-4 h-4 flex-shrink-0 mt-0.5" :class="toneClass[tone]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        v-if="tone === 'error'"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
      <path
        v-else
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
    <span :class="isDark ? 'text-gray-300' : 'text-gray-700'">{{ message }}</span>
  </div>
</template>
