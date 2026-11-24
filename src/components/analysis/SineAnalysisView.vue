<script setup lang="ts">
import { computed } from 'vue'
import type { SineAnalysis, AnalysisError } from '@/utils/signalAnalysis'
import { getAnalysisPalette } from '@/utils/analysisTheme'
import {
  formatAxisFrequency,
  formatAxisNumber,
  formatAxisTime,
  formatDurationSeconds,
  formatFrequency,
  formatSmartNumber
} from '@/utils/helpers'
import AnalysisChart from '../AnalysisChart.vue'
import type { AnalysisChartSeries } from './chartTypes'
import AnalysisSection from './AnalysisSection.vue'
import AnalysisNotice from './AnalysisNotice.vue'
import StatTile from './StatTile.vue'

const props = defineProps<{
  analysis: SineAnalysis | AnalysisError
  isDark: boolean
  unit: string
}>()

const result = computed<SineAnalysis | null>(() => (props.analysis.ok ? props.analysis : null))
const errorText = computed(() => (props.analysis.ok ? '' : props.analysis.error))
const palette = computed(() => getAnalysisPalette(props.isDark))

const phaseDegrees = computed(() => {
  if (!result.value) return ''
  return formatSmartNumber((result.value.phase * 180) / Math.PI, 4)
})

const unitSuffix = computed(() => (props.unit ? ` ${props.unit}` : ''))

const timeSeries = computed<AnalysisChartSeries[]>(() => {
  if (!result.value) return []
  return [
    {
      label: '原始信号',
      data: Array.from(result.value.timeSeries.original),
      stroke: palette.value.primary,
      width: 1.6
    },
    {
      label: '正弦拟合',
      data: Array.from(result.value.timeSeries.fitted),
      stroke: palette.value.secondary,
      width: 1.6
    }
  ]
})

const spectrumSeries = computed<AnalysisChartSeries[]>(() => {
  if (!result.value) return []
  const { plotFrequencies: frequencies, plotAmplitudes: amplitudes } = result.value.spectrum
  const markers: (number | null)[] = new Array(frequencies.length).fill(null)

  const nearestIndex = (target: number): number => {
    let bestIndex = 0
    let bestDistance = Infinity
    for (let i = 0; i < frequencies.length; i++) {
      const distance = Math.abs(frequencies[i] - target)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = i
      }
    }
    return bestIndex
  }

  markers[nearestIndex(result.value.frequency)] = result.value.amplitude
  for (const harmonic of result.value.harmonics) {
    if (harmonic.amplitude > 0) {
      markers[nearestIndex(harmonic.frequency)] = harmonic.amplitude
    }
  }

  return [
    {
      label: '幅频谱',
      data: Array.from(amplitudes),
      stroke: palette.value.primary,
      width: 1.4,
      fill: palette.value.primaryFill
    },
    {
      label: '基频 / 谐波',
      data: markers,
      stroke: palette.value.secondary,
      points: true,
      tooltip: false
    }
  ]
})

const timeCaption = computed(() => {
  if (!result.value) return ''
  const time = result.value.timeSeries.time
  const displayDuration = time.length > 0 ? time[time.length - 1] : 0
  return `图中显示最近 ${formatDurationSeconds(displayDuration)} 的原始信号，橙线为最小二乘正弦拟合；R² = ${result.value.fitR2.toFixed(6)}`
})

const spectrumCaption = computed(() => {
  if (!result.value) return ''
  return `Hann 窗幅频谱，FFT ${result.value.spectrum.fftSize.toLocaleString()} 点（分析窗口 ${result.value.windowPoints.toLocaleString()} 点），频率分辨率 Δf = ${formatFrequency(result.value.spectrum.frequencyResolution)}；橙点标出基频及 2–10 次谐波位置`
})
</script>

<template>
  <div v-if="errorText">
    <AnalysisNotice tone="error" :message="errorText" :is-dark="isDark" />
  </div>

  <div v-else-if="result">
    <AnalysisSection title="基波与直流" description="对所选通道的交流分量进行参数提取" :is-dark="isDark">
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <StatTile label="基频" :value="formatFrequency(result.frequency)" :is-dark="isDark" hint="频谱峰值 + 最小二乘精修" />
        <StatTile label="周期" :value="formatDurationSeconds(result.period)" :is-dark="isDark" />
        <StatTile label="直流分量" :value="formatSmartNumber(result.dc)" :unit="unit" :is-dark="isDark" hint="窗口均值" />
        <StatTile label="交流幅值" :value="formatSmartNumber(result.amplitude)" :unit="unit" :is-dark="isDark" hint="基波峰值" />
        <StatTile label="交流 RMS" :value="formatSmartNumber(result.acRms)" :unit="unit" :is-dark="isDark" hint="实测交流有效值" />
        <StatTile label="总 RMS" :value="formatSmartNumber(result.totalRms)" :unit="unit" :is-dark="isDark" />
      </div>
    </AnalysisSection>

    <AnalysisSection title="拟合与失真" description="正弦模型拟合指标" :is-dark="isDark">
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <StatTile label="拟合 R²" :value="result.fitR2.toFixed(6)" :is-dark="isDark" />
        <StatTile label="残差 RMS" :value="formatSmartNumber(result.residualRms)" :unit="unit" :is-dark="isDark" hint="噪声 + 谐波畸变" />
        <StatTile label="THD" :value="formatSmartNumber(result.thdPct, 4)" unit="%" :is-dark="isDark" hint="2–10 次谐波失真" />
        <StatTile
          label="SINAD"
          :value="isFinite(result.sinadDb) && result.sinadDb < 150 ? formatSmartNumber(result.sinadDb, 4) : '—'"
          unit="dB"
          :is-dark="isDark"
          hint="信号与噪声 / 失真比"
        />
        <StatTile label="峰值因数" :value="formatSmartNumber(result.crestFactor, 4)" :is-dark="isDark" hint="峰值 / 交流 RMS" />
        <StatTile label="相位" :value="phaseDegrees" unit="°" :is-dark="isDark" hint="相对分析窗口起点" />
      </div>
    </AnalysisSection>

    <AnalysisSection title="时域波形与拟合" :description="timeCaption" :is-dark="isDark">
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

    <AnalysisSection title="幅频谱" :description="spectrumCaption" :is-dark="isDark">
      <div class="rounded-lg border p-3" :class="isDark ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-white'">
        <AnalysisChart
          :x="result.spectrum.plotFrequencies"
          :series="spectrumSeries"
          :height="230"
          :is-dark="isDark"
          x-label="频率"
          :y-label="`幅值${unitSuffix}`"
          :x-formatter="formatAxisFrequency"
          :y-formatter="formatAxisNumber"
          :value-unit="unit"
        />
      </div>
    </AnalysisSection>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <AnalysisSection title="谐波分量" description="相对基波幅值的百分比" :is-dark="isDark">
        <div
          v-if="result.harmonics.length > 0"
          class="overflow-hidden rounded-lg border"
          :class="isDark ? 'border-gray-700' : 'border-gray-200'"
        >
          <table class="w-full text-xs">
            <thead :class="isDark ? 'bg-gray-900/60 text-gray-400' : 'bg-gray-100 text-gray-600'">
              <tr>
                <th class="text-left font-medium px-3 py-1.5">阶次</th>
                <th class="text-right font-medium px-3 py-1.5">频率</th>
                <th class="text-right font-medium px-3 py-1.5">幅值</th>
                <th class="text-right font-medium px-3 py-1.5">相对基波</th>
              </tr>
            </thead>
            <tbody :class="isDark ? 'divide-y divide-gray-800' : 'divide-y divide-gray-200'">
              <tr v-for="harmonic in result.harmonics" :key="harmonic.order">
                <td class="px-3 py-1.5 font-mono" :class="isDark ? 'text-gray-300' : 'text-gray-800'">{{ harmonic.order }} 次</td>
                <td class="px-3 py-1.5 text-right font-mono tabular-nums" :class="isDark ? 'text-gray-300' : 'text-gray-800'">
                  {{ formatFrequency(harmonic.frequency) }}
                </td>
                <td class="px-3 py-1.5 text-right font-mono tabular-nums" :class="isDark ? 'text-gray-300' : 'text-gray-800'">
                  {{ formatSmartNumber(harmonic.amplitude) }}{{ unitSuffix }}
                </td>
                <td class="px-3 py-1.5 text-right font-mono tabular-nums" :class="isDark ? 'text-gray-300' : 'text-gray-800'">
                  {{ formatSmartNumber(harmonic.relativePct, 3) }}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-xs" :class="isDark ? 'text-gray-500' : 'text-gray-500'">未检测到可分辨的谐波分量</p>
      </AnalysisSection>

      <AnalysisSection title="主要谱峰" description="按幅值排序的前 8 个峰值" :is-dark="isDark">
        <div
          v-if="result.topPeaks.length > 0"
          class="overflow-hidden rounded-lg border"
          :class="isDark ? 'border-gray-700' : 'border-gray-200'"
        >
          <table class="w-full text-xs">
            <thead :class="isDark ? 'bg-gray-900/60 text-gray-400' : 'bg-gray-100 text-gray-600'">
              <tr>
                <th class="text-left font-medium px-3 py-1.5">#</th>
                <th class="text-right font-medium px-3 py-1.5">频率</th>
                <th class="text-right font-medium px-3 py-1.5">幅值</th>
                <th class="text-right font-medium px-3 py-1.5">相对基波</th>
              </tr>
            </thead>
            <tbody :class="isDark ? 'divide-y divide-gray-800' : 'divide-y divide-gray-200'">
              <tr v-for="(peak, index) in result.topPeaks" :key="`${peak.frequency}-${index}`">
                <td class="px-3 py-1.5 font-mono" :class="isDark ? 'text-gray-400' : 'text-gray-500'">{{ index + 1 }}</td>
                <td class="px-3 py-1.5 text-right font-mono tabular-nums" :class="isDark ? 'text-gray-300' : 'text-gray-800'">
                  {{ formatFrequency(peak.frequency) }}
                </td>
                <td class="px-3 py-1.5 text-right font-mono tabular-nums" :class="isDark ? 'text-gray-300' : 'text-gray-800'">
                  {{ formatSmartNumber(peak.amplitude) }}{{ unitSuffix }}
                </td>
                <td class="px-3 py-1.5 text-right font-mono tabular-nums" :class="isDark ? 'text-gray-300' : 'text-gray-800'">
                  {{ formatSmartNumber(peak.relativeDb, 3) }} dB
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-xs" :class="isDark ? 'text-gray-500' : 'text-gray-500'">未检测到明显的谱峰</p>
        <p class="mt-1.5 text-[10px] leading-relaxed" :class="isDark ? 'text-gray-500' : 'text-gray-500'">
          注：谱峰幅值来自 Hann 窗单边频谱，非整周期采样时存在扇贝损失；基波幅值以上方最小二乘拟合结果为准。
        </p>
      </AnalysisSection>
    </div>
  </div>
</template>
