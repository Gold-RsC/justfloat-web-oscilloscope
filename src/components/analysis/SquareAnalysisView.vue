<script setup lang="ts">
import { computed } from 'vue'
import type { SquareAnalysis, AnalysisError } from '@/utils/signalAnalysis'
import { getAnalysisPalette } from '@/utils/analysisTheme'
import {
  formatAxisNumber,
  formatAxisTime,
  formatDurationSeconds,
  formatFrequency,
  formatPercentRatio,
  formatSmartNumber
} from '@/utils/helpers'
import AnalysisChart from '../AnalysisChart.vue'
import type { AnalysisChartSeries } from './chartTypes'
import AnalysisSection from './AnalysisSection.vue'
import AnalysisNotice from './AnalysisNotice.vue'
import StatTile from './StatTile.vue'

const props = defineProps<{
  analysis: SquareAnalysis | AnalysisError
  isDark: boolean
  unit: string
}>()

const result = computed<SquareAnalysis | null>(() => (props.analysis.ok ? props.analysis : null))
const errorText = computed(() => (props.analysis.ok ? '' : props.analysis.error))
const palette = computed(() => getAnalysisPalette(props.isDark))
const unitSuffix = computed(() => (props.unit ? ` ${props.unit}` : ''))

const timeSeries = computed<AnalysisChartSeries[]>(() => {
  if (!result.value) return []
  const series: AnalysisChartSeries[] = [
    {
      label: '原始信号',
      data: Array.from(result.value.timeSeries.original),
      stroke: palette.value.primary,
      width: 1.6
    }
  ]
  if (result.value.timeSeries.reconstructed.length > 0) {
    series.push({
      label: '理想方波重建',
      data: Array.from(result.value.timeSeries.reconstructed),
      stroke: palette.value.secondary,
      width: 1.4
    })
  }
  return series
})

const histogramX = computed<number[]>(() => {
  if (!result.value) return []
  return Array.from(result.value.histogram.binCenters)
})

const histogramXRange = computed<[number, number] | undefined>(() => {
  const x = histogramX.value
  if (x.length < 2) return undefined
  const halfBin = (x[1] - x[0]) / 2
  return [x[0] - halfBin, x[x.length - 1] + halfBin]
})

const histogramSeries = computed<AnalysisChartSeries[]>(() => {
  if (!result.value) return []
  return [
    {
      label: '样本分布',
      data: Array.from(result.value.histogram.counts),
      stroke: palette.value.primary,
      fill: palette.value.primary,
      kind: 'bars'
    }
  ]
})

const dutyBarStyle = computed(() => {
  if (!result.value) return {}
  return {
    positive: { flexGrow: String(result.value.positiveDuty), flexBasis: '0%', backgroundColor: palette.value.primary },
    negative: { flexGrow: String(result.value.negativeDuty), flexBasis: '0%', backgroundColor: palette.value.secondary }
  }
})

const frequencyHint = computed(() => {
  if (!result.value) return ''
  return result.value.frequencySource === 'edges' ? '上升沿间隔中位数' : '频谱峰值估计'
})

const timeCaption = computed(() => {
  if (!result.value) return ''
  const time = result.value.timeSeries.time
  const displayDuration = time.length > 0 ? time[time.length - 1] : 0
  if (!isFinite(result.value.reconstructionR2)) {
    return `图中显示最近 ${formatDurationSeconds(displayDuration)} 的原始信号；未检测到稳定上升沿，无法重建理想方波`
  }
  return `图中显示最近 ${formatDurationSeconds(displayDuration)} 的原始信号，橙线为按中位周期与平均占空比重建的理想方波；R² = ${result.value.reconstructionR2.toFixed(6)}`
})

const histogramCaption = computed(() => {
  if (!result.value) return ''
  return `高 / 低电平由 2-means 聚类估计（${formatSmartNumber(result.value.lowLevel)} / ${formatSmartNumber(result.value.highLevel)}${unitSuffix.value}），判决阈值为 ${formatSmartNumber(result.value.midpoint)}${unitSuffix.value}`
})
</script>

<template>
  <div v-if="errorText">
    <AnalysisNotice tone="error" :message="errorText" :is-dark="isDark" />
  </div>

  <div v-else-if="result">
    <AnalysisSection title="电平与幅度" description="通过双电平聚类分离高 / 低电平" :is-dark="isDark">
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <StatTile label="高电平" :value="formatSmartNumber(result.highLevel)" :unit="unit" :is-dark="isDark" />
        <StatTile label="低电平" :value="formatSmartNumber(result.lowLevel)" :unit="unit" :is-dark="isDark" />
        <StatTile label="幅度（峰峰值）" :value="formatSmartNumber(result.amplitude)" :unit="unit" :is-dark="isDark" />
        <StatTile label="中点" :value="formatSmartNumber(result.midpoint)" :unit="unit" :is-dark="isDark" />
        <StatTile label="直流均值" :value="formatSmartNumber(result.mean)" :unit="unit" :is-dark="isDark" />
        <StatTile label="交流 RMS" :value="formatSmartNumber(result.acRms)" :unit="unit" :is-dark="isDark" />
      </div>
    </AnalysisSection>

    <AnalysisSection title="频率与边沿" description="由迟滞比较器检测跳变沿" :is-dark="isDark">
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <StatTile label="频率" :value="formatFrequency(result.frequency)" :is-dark="isDark" :hint="frequencyHint" />
        <StatTile label="周期" :value="formatDurationSeconds(result.period)" :is-dark="isDark" />
        <StatTile label="周期抖动" :value="formatSmartNumber(result.periodJitterPct, 4)" unit="%" :is-dark="isDark" hint="周期标准差 / 均值" />
        <StatTile label="上升沿" :value="String(result.riseCount)" :is-dark="isDark" />
        <StatTile label="下降沿" :value="String(result.fallCount)" :is-dark="isDark" />
        <StatTile
          label="重建 R²"
          :value="isFinite(result.reconstructionR2) ? result.reconstructionR2.toFixed(6) : '—'"
          :is-dark="isDark"
        />
      </div>
    </AnalysisSection>

    <AnalysisSection title="占空比" description="一个周期内高电平与低电平的时间占比" :is-dark="isDark">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div class="lg:col-span-2 grid grid-cols-2 gap-2">
          <StatTile label="正占空比" :value="formatPercentRatio(result.positiveDuty)" :is-dark="isDark" hint="高电平时间 / 周期" />
          <StatTile label="负占空比" :value="formatPercentRatio(result.negativeDuty)" :is-dark="isDark" hint="低电平时间 / 周期" />
        </div>
        <StatTile label="占空比周期间波动" :value="formatSmartNumber(result.dutyStdPct, 4)" unit="pp" :is-dark="isDark" hint="标准差（百分点）" />
      </div>

      <div class="mt-3">
        <div class="flex h-2.5 w-full overflow-hidden rounded-full gap-[2px]">
          <div class="h-full rounded-l-full transition-all" :style="dutyBarStyle.positive"></div>
          <div class="h-full rounded-r-full transition-all" :style="dutyBarStyle.negative"></div>
        </div>
        <div class="mt-2 flex items-center gap-4 text-[11px]" :class="isDark ? 'text-gray-400' : 'text-gray-600'">
          <span class="inline-flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-sm" :style="{ backgroundColor: palette.primary }"></span>
            正占空比 {{ formatPercentRatio(result.positiveDuty) }}
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-sm" :style="{ backgroundColor: palette.secondary }"></span>
            负占空比 {{ formatPercentRatio(result.negativeDuty) }}
          </span>
        </div>
      </div>
    </AnalysisSection>

    <AnalysisSection title="时域波形与理想方波" :description="timeCaption" :is-dark="isDark">
      <div class="rounded-lg border p-3" :class="isDark ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-white'">
        <AnalysisChart
          :x="result.timeSeries.time"
          :series="timeSeries"
          :height="220"
          :is-dark="isDark"
          x-label="时间"
          :y-label="`幅值${unitSuffix}`"
          :x-formatter="formatAxisTime"
          :y-formatter="formatAxisNumber"
          :value-unit="unit"
        />
      </div>
    </AnalysisSection>

    <AnalysisSection title="电平分布" :description="histogramCaption" :is-dark="isDark">
      <div class="rounded-lg border p-3" :class="isDark ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-white'">
        <AnalysisChart
          :x="histogramX"
          :series="histogramSeries"
          :height="210"
          :is-dark="isDark"
          :x-label="`电平${unitSuffix}`"
          y-label="样本数"
          :x-formatter="formatAxisNumber"
          :y-formatter="formatAxisNumber"
          :x-range="histogramXRange"
        />
      </div>
    </AnalysisSection>
  </div>
</template>
