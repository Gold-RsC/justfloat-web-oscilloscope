<script setup lang="ts">
import { computed } from 'vue'
import type { StableAnalysis, AnalysisError } from '@/utils/signalAnalysis'
import { getAnalysisPalette } from '@/utils/analysisTheme'
import {
  formatAxisNumber,
  formatAxisTime,
  formatDurationSeconds,
  formatSmartNumber
} from '@/utils/helpers'
import AnalysisChart from '../AnalysisChart.vue'
import type { AnalysisChartSeries } from './chartTypes'
import AnalysisSection from './AnalysisSection.vue'
import AnalysisNotice from './AnalysisNotice.vue'
import StatTile from './StatTile.vue'

const props = defineProps<{
  analysis: StableAnalysis | AnalysisError
  isDark: boolean
  unit: string
}>()

const result = computed<StableAnalysis | null>(() => (props.analysis.ok ? props.analysis : null))
const errorText = computed(() => (props.analysis.ok ? '' : props.analysis.error))
const palette = computed(() => getAnalysisPalette(props.isDark))
const unitSuffix = computed(() => (props.unit ? ` ${props.unit}` : ''))

const stabilityDisplay = computed(() => {
  if (!result.value || result.value.stabilityPct == null) return '—'
  return formatSmartNumber(result.value.stabilityPct, 4)
})

const timeSeries = computed<AnalysisChartSeries[]>(() => {
  if (!result.value) return []
  return [
    {
      label: '采样值',
      data: Array.from(result.value.timeSeries.values),
      stroke: palette.value.primary,
      width: 1.5
    },
    {
      label: '窗口均值',
      data: Array.from(result.value.timeSeries.meanLine),
      stroke: palette.value.secondary,
      width: 1.2
    }
  ]
})

const histogramX = computed<number[]>(() => {
  if (!result.value) return []
  return Array.from(result.value.distribution.binCenters)
})

const histogramXRange = computed<[number, number] | undefined>(() => {
  const x = histogramX.value
  if (x.length < 2) return undefined
  const halfBin = (x[1] - x[0]) / 2
  return [x[0] - halfBin, x[x.length - 1] + halfBin]
})

const distributionSeries = computed<AnalysisChartSeries[]>(() => {
  if (!result.value) return []
  return [
    {
      label: '样本分布',
      data: Array.from(result.value.distribution.counts),
      stroke: palette.value.primary,
      fill: palette.value.primary,
      kind: 'bars'
    },
    {
      label: '正态拟合',
      data: Array.from(result.value.distribution.gaussian),
      stroke: palette.value.secondary,
      width: 1.6,
      tooltip: false
    }
  ]
})

const timeCaption = computed(() => {
  if (!result.value) return ''
  const points = result.value.timeSeries.values.length
  const sampled = points < result.value.windowPoints
  const time = result.value.timeSeries.time
  const displayDuration = time.length > 0 ? time[time.length - 1] : 0
  return `分析窗口内 ${formatDurationSeconds(displayDuration)} 的采样值${sampled ? '（显示时已均匀降采样）' : ''}，橙线为窗口均值 ${formatSmartNumber(result.value.mean)}${unitSuffix.value}`
})

const distributionCaption = computed(() => {
  if (!result.value || !(result.value.std > 0)) {
    return '数据波动为 0，无法进行分布拟合'
  }
  return `直方图（${result.value.distribution.counts.length} 个区间）与同均值 / 标准差的正态分布曲线；均值 ${formatSmartNumber(result.value.mean)}${unitSuffix.value}，σ = ${formatSmartNumber(result.value.std)}${unitSuffix.value}`
})
</script>

<template>
  <div v-if="errorText">
    <AnalysisNotice tone="error" :message="errorText" :is-dark="isDark" />
  </div>

  <div v-else-if="result">
    <AnalysisSection title="稳定值" description="对分析窗口内的通道数据做统计估计" :is-dark="isDark">
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <StatTile label="均值" :value="formatSmartNumber(result.mean)" :unit="unit" :is-dark="isDark" />
        <StatTile label="中位数" :value="formatSmartNumber(result.median)" :unit="unit" :is-dark="isDark" />
        <StatTile label="均值 95% CI" :value="`± ${formatSmartNumber(result.ci95)}`" :unit="unit" :is-dark="isDark" hint="1.96 · σ / √N" />
        <StatTile label="相对稳定性" :value="stabilityDisplay" unit="%" :is-dark="isDark" hint="σ / |均值|" />
        <StatTile label="总 RMS" :value="formatSmartNumber(result.rms)" :unit="unit" :is-dark="isDark" />
        <StatTile label="分析窗口" :value="`${result.windowPoints.toLocaleString()} 点`" :is-dark="isDark" :hint="formatDurationSeconds(result.duration)" />
      </div>
    </AnalysisSection>

    <AnalysisSection title="波动与噪声" description="数值围绕均值的离散程度" :is-dark="isDark">
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <StatTile label="标准差（AC RMS）" :value="formatSmartNumber(result.std)" :unit="unit" :is-dark="isDark" />
        <StatTile label="峰峰值噪声" :value="formatSmartNumber(result.p2p)" :unit="unit" :is-dark="isDark" hint="最大值 − 最小值" />
        <StatTile label="最小值" :value="formatSmartNumber(result.min)" :unit="unit" :is-dark="isDark" />
        <StatTile label="最大值" :value="formatSmartNumber(result.max)" :unit="unit" :is-dark="isDark" />
        <StatTile label="P5 分位数" :value="formatSmartNumber(result.p05)" :unit="unit" :is-dark="isDark" />
        <StatTile label="P95 分位数" :value="formatSmartNumber(result.p95)" :unit="unit" :is-dark="isDark" />
      </div>
    </AnalysisSection>

    <AnalysisSection title="漂移" description="线性趋势拟合，用于判断数值是否随时间缓慢变化" :is-dark="isDark">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
        <StatTile
          label="漂移速率"
          :value="formatSmartNumber(result.driftPerSecond)"
          :unit="unit ? `${unit}/s` : '/s'"
          :is-dark="isDark"
        />
        <StatTile label="窗口内累计漂移" :value="formatSmartNumber(result.totalDrift)" :unit="unit" :is-dark="isDark" />
        <StatTile label="线性拟合 R²" :value="result.driftR2.toFixed(6)" :is-dark="isDark" />
      </div>
    </AnalysisSection>

    <AnalysisSection title="时域稳定性" :description="timeCaption" :is-dark="isDark">
      <div class="rounded-lg border p-3" :class="isDark ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-white'">
        <AnalysisChart
          :x="result.timeSeries.time"
          :series="timeSeries"
          :height="220"
          :is-dark="isDark"
          x-label="时间"
          :y-label="`数值${unitSuffix}`"
          :x-formatter="formatAxisTime"
          :y-formatter="formatAxisNumber"
          :value-unit="unit"
        />
      </div>
    </AnalysisSection>

    <AnalysisSection title="数值分布" :description="distributionCaption" :is-dark="isDark">
      <div class="rounded-lg border p-3" :class="isDark ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-white'">
        <AnalysisChart
          :x="histogramX"
          :series="distributionSeries"
          :height="210"
          :is-dark="isDark"
          :x-label="`数值${unitSuffix}`"
          y-label="样本数"
          :x-formatter="formatAxisNumber"
          :y-formatter="formatAxisNumber"
          :x-range="histogramXRange"
        />
      </div>
    </AnalysisSection>
  </div>
</template>
