<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ChannelConfig, ChannelStats, ProtocolType } from '@/types'
import { MIN_BUFFER_SIZE, MAX_BUFFER_SIZE, PROTOCOL_OPTIONS } from '@/types'
import { formatFrequency } from '@/utils/helpers'
import ChannelItem from './ChannelItem.vue'

const props = defineProps<{
  bufferSize: number
  protocol: ProtocolType
  channels: ChannelConfig[]
  channelCount: number
  cursorValues: number[] | null
  cursorIndex: number | null
  getChannelStats: (channelIndex: number) => ChannelStats | null
  sampleRateOverride: number | null
  effectiveSampleRate: number
  isDark: boolean
}>()

const emit = defineEmits<{
  'update:bufferSize': [value: number]
  'update:protocol': [value: ProtocolType]
  'updateChannel': [id: number, updates: Partial<ChannelConfig>]
  'toggleVisibility': [id: number]
  'analyzeChannel': [id: number]
  'update:sampleRateOverride': [value: number | null]
}>()

// 本地状态（防止输入时被外部值覆盖）
const localBufferSize = ref(props.bufferSize)
const isEditingBufferSize = ref(false)

// 监听外部变化，仅在非编辑状态下同步
watch(() => props.bufferSize, (newVal) => {
  if (!isEditingBufferSize.value) {
    localBufferSize.value = newVal
  }
})

// 提交缓冲区大小
const commitBufferSize = () => {
  isEditingBufferSize.value = false
  const value = Math.max(MIN_BUFFER_SIZE, Math.min(MAX_BUFFER_SIZE, localBufferSize.value))
  localBufferSize.value = value
  emit('update:bufferSize', value)
}

// 采样率手动锁定
const localSampleRate = ref(
  props.sampleRateOverride ?? (props.effectiveSampleRate > 0 ? props.effectiveSampleRate : 1000)
)

watch(() => props.sampleRateOverride, (value) => {
  if (value != null) localSampleRate.value = value
})

watch(() => props.effectiveSampleRate, (value) => {
  if (props.sampleRateOverride == null && value > 0) {
    localSampleRate.value = value
  }
})

const handleAutoRateChange = (event: Event) => {
  const auto = (event.target as HTMLInputElement).checked
  if (auto) {
    emit('update:sampleRateOverride', null)
  } else {
    const current = props.effectiveSampleRate > 0 ? props.effectiveSampleRate : localSampleRate.value
    const value = current > 0 ? current : 1000
    localSampleRate.value = value
    emit('update:sampleRateOverride', value)
  }
}

const commitSampleRate = () => {
  const parsed = Number(localSampleRate.value)
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 1000
  localSampleRate.value = value
  emit('update:sampleRateOverride', value)
}

// 显示的通道数量
const displayChannels = computed(() => {
  return props.channels.slice(0, props.channelCount)
})

// 获取指定通道的光标值（图表数据已应用系数，直接返回）
const getCursorValue = (channelId: number): number | null => {
  if (!props.cursorValues || channelId >= props.cursorValues.length) {
    return null
  }
  return props.cursorValues[channelId]
}
</script>

<template>
  <aside :class="['w-72 flex-shrink-0 border-r flex flex-col overflow-hidden', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300']">
    <!-- 连接配置 -->
    <div :class="['p-4 border-b', isDark ? 'border-gray-700' : 'border-gray-300']">
      <h2 :class="['text-sm font-semibold mb-3', isDark ? 'text-gray-400' : 'text-gray-700']">连接配置</h2>

      <!-- 协议选择 -->
      <div class="mb-3">
        <label :class="['block text-xs mb-1', isDark ? 'text-gray-500' : 'text-gray-600']">协议类型</label>
        <select
          :value="protocol"
          :class="['w-full rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500', isDark ? 'bg-gray-700 border border-gray-600 text-white' : 'bg-white border border-gray-400 text-gray-900']"
          @change="emit('update:protocol', ($event.target as HTMLSelectElement).value as ProtocolType)"
        >
          <option v-for="opt in PROTOCOL_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <div :class="['text-xs mt-1', isDark ? 'text-gray-600' : 'text-gray-500']">
          {{ PROTOCOL_OPTIONS.find(o => o.value === protocol)?.description }}
        </div>
      </div>

      <!-- 缓冲区大小 -->
      <div>
        <label :class="['block text-xs mb-1', isDark ? 'text-gray-500' : 'text-gray-600']">
          缓冲区大小 ({{ MIN_BUFFER_SIZE.toLocaleString() }} - {{ MAX_BUFFER_SIZE.toLocaleString() }})
        </label>
        <input
          type="number"
          v-model.number="localBufferSize"
          :min="MIN_BUFFER_SIZE"
          :max="MAX_BUFFER_SIZE"
          step="1000"
          :class="['w-full rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500', isDark ? 'bg-gray-700 border border-gray-600 text-white' : 'bg-white border border-gray-400 text-gray-900']"
          @focus="isEditingBufferSize = true"
          @blur="commitBufferSize"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
      </div>

      <!-- 采样率 -->
      <div class="mt-3">
        <div class="flex items-center justify-between mb-1">
          <label :class="['block text-xs', isDark ? 'text-gray-500' : 'text-gray-600']">采样率 (Hz)</label>
          <label :class="['flex items-center gap-1 text-xs cursor-pointer', isDark ? 'text-gray-400' : 'text-gray-600']">
            <input
              type="checkbox"
              :checked="sampleRateOverride == null"
              class="accent-blue-600"
              @change="handleAutoRateChange"
            />
            自动
          </label>
        </div>
        <input
          v-if="sampleRateOverride != null"
          type="number"
          v-model.number="localSampleRate"
          min="1"
          step="1"
          :class="['w-full rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500', isDark ? 'bg-gray-700 border border-gray-600 text-white' : 'bg-white border border-gray-400 text-gray-900']"
          @blur="commitSampleRate"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        <div v-else :class="['text-sm font-mono', isDark ? 'text-gray-300' : 'text-gray-800']">
          {{ effectiveSampleRate > 0 ? formatFrequency(effectiveSampleRate) : '等待数据...' }}
        </div>
        <div :class="['text-[10px] mt-1', isDark ? 'text-gray-600' : 'text-gray-500']">
          锁定后用于基频、时长和导出时间列
        </div>
      </div>
    </div>

    <!-- 通道列表 -->
    <div class="flex-1 overflow-y-auto p-4">
      <h2 :class="['text-sm font-semibold mb-3', isDark ? 'text-gray-400' : 'text-gray-700']">
        通道 ({{ channelCount }})
      </h2>

      <div v-if="channelCount === 0" :class="['text-sm text-center py-4', isDark ? 'text-gray-500' : 'text-gray-500']">
        等待数据...
      </div>

      <div v-else class="space-y-2">
        <ChannelItem
          v-for="channel in displayChannels"
          :key="channel.id"
          :channel="channel"
          :stats="getChannelStats(channel.id)"
          :cursor-value="getCursorValue(channel.id)"
          :cursor-index="cursorIndex"
          :is-dark="isDark"
          @update="(updates) => emit('updateChannel', channel.id, updates)"
          @toggle-visibility="emit('toggleVisibility', channel.id)"
          @analyze="emit('analyzeChannel', channel.id)"
        />
      </div>
    </div>
  </aside>
</template>
