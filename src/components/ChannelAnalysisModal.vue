<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { ChannelConfig } from '@/types'
import type { WaveformType, SineAnalysis, SquareAnalysis, StableAnalysis, AnalysisError } from '@/utils/signalAnalysis'
import { analyzeSine, analyzeSquare, analyzeStable, MAX_ANALYSIS_POINTS } from '@/utils/signalAnalysis'
import { formatDurationSeconds, formatFrequency } from '@/utils/helpers'
import SineAnalysisView from './analysis/SineAnalysisView.vue'
import SquareAnalysisView from './analysis/SquareAnalysisView.vue'
import StableAnalysisView from './analysis/StableAnalysisView.vue'

const props = defineProps<{
  channel: ChannelConfig
  data: Float64Array
  sampleRate: number
  isDark: boolean
  /** 打开时默认选中的波形类型（不传则显示类型选择页） */
  initialTab?: WaveformType
}>()

const emit = defineEmits<{
  close: []
}>()

const activeTab = ref<WaveformType | null>(props.initialTab ?? null)

const waveformOptions: {
  value: WaveformType
  label: string
  description: string
  features: string
}[] = [
  {
    value: 'sine',
    label: '正弦波',
    description: '周期性交流信号',
    features: '基频、直流分量、交流幅值 / RMS、THD、频谱、拟合 R²'
  },
  {
    value: 'square',
    label: '方波',
    description: '高低电平切换信号',
    features: '高 / 低电平、正负占空比、频率、边沿抖动、重建 R²'
  },
  {
    value: 'stable',
    label: '稳定值',
    description: '近似恒定的直流量',
    features: '均值、中位数、标准差、置信区间、漂移、分布'
  }
]

const sineAnalysis = computed<SineAnalysis | AnalysisError>(() =>
  analyzeSine(props.data, props.sampleRate)
)
const squareAnalysis = computed<SquareAnalysis | AnalysisError>(() =>
  analyzeSquare(props.data, props.sampleRate)
)
const stableAnalysis = computed<StableAnalysis | AnalysisError>(() =>
  analyzeStable(props.data, props.sampleRate)
)

const channelName = computed(() => props.channel.name || `通道 ${props.channel.id + 1}`)
const dataDuration = computed(() =>
  props.sampleRate > 0 ? props.data.length / props.sampleRate : 0
)

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
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    role="dialog"
    aria-modal="true"
    aria-label="波形分析"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-[1080px] max-h-[92vh] flex flex-col rounded-xl border shadow-2xl overflow-hidden"
      :class="isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'"
    >
      <!-- 头部 -->
      <div class="flex items-start justify-between gap-4 px-5 py-4 border-b" :class="isDark ? 'border-gray-700' : 'border-gray-200'">
        <div class="min-w-0">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :style="{ backgroundColor: channel.color }"></span>
            <h2 class="text-base font-semibold truncate" :class="isDark ? 'text-white' : 'text-gray-900'">
              波形分析 · {{ channelName }}
            </h2>
            <span v-if="channel.unit" class="text-xs flex-shrink-0" :class="isDark ? 'text-gray-400' : 'text-gray-600'">
              ({{ channel.unit }})
            </span>
          </div>
          <p class="mt-1 text-[11px] leading-relaxed" :class="isDark ? 'text-gray-400' : 'text-gray-600'">
            采样率 {{ sampleRate > 0 ? formatFrequency(sampleRate) : '未知' }}
            <span class="mx-1.5">·</span>
            {{ data.length.toLocaleString() }} 个数据点
            <span v-if="dataDuration > 0">
              <span class="mx-1.5">·</span>
              总时长 {{ formatDurationSeconds(dataDuration) }}
            </span>
            <span class="mx-1.5">·</span>
            分析基于当前缓冲区快照
            <template v-if="data.length > MAX_ANALYSIS_POINTS">
              <span class="mx-1.5">·</span>
              分析窗口取最近 {{ MAX_ANALYSIS_POINTS.toLocaleString() }} 点
            </template>
          </p>
        </div>
        <button
          class="p-1.5 rounded flex-shrink-0"
          :class="isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'"
          title="关闭（Esc）"
          @click="emit('close')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- 分页 -->
      <div class="px-5 pt-3 border-b" :class="isDark ? 'border-gray-700' : 'border-gray-200'">
        <div class="flex items-center gap-1" role="tablist" aria-label="波形类型">
          <button
            v-for="option in waveformOptions"
            :key="option.value"
            class="px-3 py-2 text-xs rounded-t-md border-b-2 transition-colors"
            :class="activeTab === option.value
              ? (isDark ? 'border-blue-500 text-blue-400 bg-blue-500/10' : 'border-blue-600 text-blue-700 bg-blue-50')
              : (isDark ? 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-700/50' : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100')"
            :aria-selected="activeTab === option.value"
            role="tab"
            @click="activeTab = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <!-- 内容 -->
      <div class="flex-1 overflow-y-auto px-5 py-4">
        <!-- 未选择波形 -->
        <div v-if="activeTab == null" class="py-6">
          <div class="text-center mb-5">
            <h3 class="text-sm font-semibold" :class="isDark ? 'text-white' : 'text-gray-900'">请选择波形类型</h3>
            <p class="mt-1 text-xs" :class="isDark ? 'text-gray-400' : 'text-gray-600'">
              选择后将对当前通道执行对应的参数提取和可视化分析
            </p>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              v-for="option in waveformOptions"
              :key="option.value"
              class="text-left rounded-xl border p-4 transition-colors"
              :class="isDark ? 'border-gray-700 bg-gray-900/40 hover:border-blue-500 hover:bg-gray-700/50' : 'border-gray-200 bg-gray-50 hover:border-blue-500 hover:bg-blue-50'"
              @click="activeTab = option.value"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-semibold" :class="isDark ? 'text-white' : 'text-gray-900'">{{ option.label }}</span>
                <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <p class="mt-0.5 text-[11px]" :class="isDark ? 'text-gray-400' : 'text-gray-600'">{{ option.description }}</p>
              <p class="mt-2 text-[11px] leading-relaxed" :class="isDark ? 'text-gray-500' : 'text-gray-500'">{{ option.features }}</p>
            </button>
          </div>
        </div>

        <SineAnalysisView
          v-else-if="activeTab === 'sine'"
          :analysis="sineAnalysis"
          :is-dark="isDark"
          :unit="channel.unit"
        />
        <SquareAnalysisView
          v-else-if="activeTab === 'square'"
          :analysis="squareAnalysis"
          :is-dark="isDark"
          :unit="channel.unit"
        />
        <StableAnalysisView
          v-else
          :analysis="stableAnalysis"
          :is-dark="isDark"
          :unit="channel.unit"
        />
      </div>
    </div>
  </div>
</template>
