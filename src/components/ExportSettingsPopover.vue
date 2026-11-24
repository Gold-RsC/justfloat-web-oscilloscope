<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ExportFormat, ExportSettings } from '@/types'
import { buildExportFileName } from '@/utils/helpers'

const props = defineProps<{
  settings: ExportSettings
  hasData: boolean
  isDark: boolean
}>()

const emit = defineEmits<{
  'update:settings': [value: ExportSettings]
  export: []
  close: []
}>()

// 本地副本：连续修改（例如输入名称后立刻切换格式）也不会丢失前一次修改
const localSettings = ref<ExportSettings>({ ...props.settings })

watch(
  () => props.settings,
  (settings) => {
    localSettings.value = { ...settings }
  },
  { deep: true }
)

const settings = computed(() => localSettings.value)

const update = (patch: Partial<ExportSettings>) => {
  localSettings.value = { ...localSettings.value, ...patch }
  emit('update:settings', localSettings.value)
}

const handleNameInput = (event: Event) => {
  update({ fileName: (event.target as HTMLInputElement).value })
}

const setFormat = (format: ExportFormat) => {
  update({ format })
}

const handlePrecisionInput = (event: Event) => {
  const parsed = Number((event.target as HTMLInputElement).value)
  const precision = Number.isFinite(parsed) ? Math.max(0, Math.min(10, Math.round(parsed))) : localSettings.value.precision
  update({ precision })
}

const handleIncludeConfig = (event: Event) => {
  update({ includeConfig: (event.target as HTMLInputElement).checked })
}

const handleIncludeTime = (event: Event) => {
  update({ includeTimeColumn: (event.target as HTMLInputElement).checked })
}

const actualFileName = computed(() => buildExportFileName(localSettings.value.fileName, localSettings.value.format))

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    class="absolute right-0 top-full mt-2 w-80 rounded-xl border shadow-2xl p-4 z-50"
    :class="isDark ? 'bg-gray-800 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-800'"
    @mousedown.stop
  >
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-semibold" :class="isDark ? 'text-white' : 'text-gray-900'">导出设置</h3>
      <span
        class="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5"
        :class="isDark ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-700'"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        更改即保存
      </span>
    </div>

    <!-- 文件名称 -->
    <label class="block text-xs mb-1" :class="isDark ? 'text-gray-400' : 'text-gray-600'">文件名称</label>
    <input
      type="text"
      :value="settings.fileName"
      placeholder="oscilloscope"
      class="w-full rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-blue-500 border"
      :class="isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'"
      @input="handleNameInput"
    />
    <div class="mt-1 text-[11px] flex items-center gap-1 min-w-0" :class="isDark ? 'text-gray-500' : 'text-gray-500'">
      <span class="flex-shrink-0">实际文件名</span>
      <span class="font-mono truncate" :class="isDark ? 'text-gray-300' : 'text-gray-700'">{{ actualFileName }}</span>
    </div>

    <!-- 格式 -->
    <label class="block text-xs mt-3 mb-1" :class="isDark ? 'text-gray-400' : 'text-gray-600'">导出格式</label>
    <div class="grid grid-cols-2 gap-1 p-1 rounded-lg" :class="isDark ? 'bg-gray-900/60' : 'bg-gray-100'">
      <button
        class="px-2 py-1.5 text-xs rounded-md"
        :class="settings.format === 'json'
          ? 'bg-blue-600 text-white'
          : (isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900')"
        @click="setFormat('json')"
      >
        JSON
      </button>
      <button
        class="px-2 py-1.5 text-xs rounded-md"
        :class="settings.format === 'csv'
          ? 'bg-blue-600 text-white'
          : (isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900')"
        @click="setFormat('csv')"
      >
        CSV
      </button>
    </div>
    <p class="mt-1 text-[11px] leading-relaxed" :class="isDark ? 'text-gray-500' : 'text-gray-500'">
      {{ settings.format === 'json'
        ? '保留原始采样值与通道配置，可重新导入本应用'
        : '应用通道系数，输出时间列，便于 Excel / Python 分析' }}
    </p>

    <!-- 格式相关选项 -->
    <template v-if="settings.format === 'csv'">
      <div class="mt-3 grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs mb-1" :class="isDark ? 'text-gray-400' : 'text-gray-600'">小数位数</label>
          <input
            type="number"
            min="0"
            max="10"
            :value="settings.precision"
            class="w-full rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-blue-500 border"
            :class="isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'"
            @input="handlePrecisionInput"
          />
        </div>
        <label class="flex items-end gap-2 pb-1.5 text-xs cursor-pointer" :class="isDark ? 'text-gray-300' : 'text-gray-700'">
          <input
            type="checkbox"
            :checked="settings.includeTimeColumn"
            class="accent-blue-600"
            @change="handleIncludeTime"
          />
          包含时间列
        </label>
      </div>
    </template>
    <label
      v-else
      class="mt-3 flex items-center gap-2 text-xs cursor-pointer"
      :class="isDark ? 'text-gray-300' : 'text-gray-700'"
    >
      <input
        type="checkbox"
        :checked="settings.includeConfig"
        class="accent-blue-600"
        @change="handleIncludeConfig"
      />
      包含通道配置（名称、单位、系数、颜色）
    </label>

    <button
      class="w-full mt-4 px-3 py-2 text-sm rounded-md text-white"
      :class="hasData ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-500 cursor-not-allowed opacity-60'"
      :disabled="!hasData"
      @click="emit('export')"
    >
      导出当前数据
    </button>
    <p v-if="!hasData" class="mt-1.5 text-[11px] text-center" :class="isDark ? 'text-gray-500' : 'text-gray-500'">
      暂无数据可导出
    </p>
  </div>
</template>
