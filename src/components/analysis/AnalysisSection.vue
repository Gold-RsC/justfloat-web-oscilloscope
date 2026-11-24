<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  isDark: boolean
}>()
</script>

<template>
  <section class="mb-5 last:mb-0">
    <div class="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <h3 class="text-xs font-semibold tracking-wide" :class="isDark ? 'text-gray-300' : 'text-gray-700'">
        {{ title }}
      </h3>
      <p v-if="description" class="text-[11px]" :class="isDark ? 'text-gray-500' : 'text-gray-500'">
        {{ description }}
      </p>
    </div>
    <slot />
  </section>
</template>
