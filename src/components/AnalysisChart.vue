<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { getAnalysisPalette } from '@/utils/analysisTheme'
import { formatSmartNumber } from '@/utils/helpers'
import type { AnalysisChartSeries } from './analysis/chartTypes'

const props = defineProps<{
  x: number[] | Float64Array
  series: AnalysisChartSeries[]
  height?: number
  isDark: boolean
  xLabel?: string
  yLabel?: string
  xFormatter?: (value: number) => string
  yFormatter?: (value: number) => string
  showLegend?: boolean
  /** 固定 X 轴范围（用于柱状图两侧留白） */
  xRange?: [number, number]
  /** 提示框中数值的单位 */
  valueUnit?: string
}>()

const container = ref<HTMLDivElement | null>(null)
const chart = shallowRef<uPlot | null>(null)
const tooltipVisible = ref(false)
const tooltipPosition = ref({ left: 0, top: 0 })
const tooltipTitle = ref('')
const tooltipRows = ref<{ label: string; value: string; color: string }[]>([])

let overElement: HTMLElement | null = null
let resizeObserver: ResizeObserver | null = null
let mountFrame: number | null = null

const formatX = (value: number): string => {
  if (props.xFormatter) return props.xFormatter(value)
  return formatSmartNumber(value, 4)
}

const formatY = (value: number): string => {
  if (!isFinite(value)) return '—'
  if (props.yFormatter) return props.yFormatter(value)
  return formatSmartNumber(value, 4)
}

const hideTooltip = () => {
  tooltipVisible.value = false
}

const updateTooltip = (u: uPlot) => {
  const index = u.cursor.idx
  const left = u.cursor.left
  const top = u.cursor.top
  if (index == null || index < 0 || left == null || top == null) {
    hideTooltip()
    return
  }

  const xValue = props.x[index]
  if (xValue == null) {
    hideTooltip()
    return
  }

  tooltipTitle.value = props.xLabel ? `${props.xLabel} ${formatX(xValue)}` : formatX(xValue)
  tooltipRows.value = props.series
    .filter(series => series.tooltip !== false)
    .map(series => {
      const raw = series.data[index]
      const unit = props.valueUnit ? ` ${props.valueUnit}` : ''
      return {
        label: series.label,
        value: raw == null || !isFinite(raw) ? '—' : `${formatY(raw)}${unit}`,
        color: series.stroke
      }
    })

  const overLeft = overElement?.offsetLeft ?? 0
  const overTop = overElement?.offsetTop ?? 0
  const width = container.value?.clientWidth ?? 0
  const height = container.value?.clientHeight ?? 0
  const tooltipWidth = 190
  const tooltipHeight = 32 + tooltipRows.value.length * 18

  let x = overLeft + left + 14
  let y = overTop + top + 14
  if (x + tooltipWidth > width) x = overLeft + left - tooltipWidth - 14
  if (y + tooltipHeight > height) y = overTop + top - tooltipHeight - 10

  tooltipPosition.value = { left: Math.max(4, x), top: Math.max(4, y) }
  tooltipVisible.value = true
}

const createOptions = (width: number, height: number): uPlot.Options => {
  const palette = getAnalysisPalette(props.isDark)
  const xRange = props.xRange

  const seriesOptions: uPlot.Series[] = [{ label: 'x', show: false }]
  for (const series of props.series) {
    const isBars = series.kind === 'bars'
    const barsPath = isBars
      ? uPlot.paths.bars?.({ size: [0.72, 28], align: 1, radius: [2, 0], gap: 1 })
      : undefined

    seriesOptions.push({
      label: series.label,
      stroke: series.stroke,
      width: isBars ? 0 : (series.width ?? 2),
      fill: isBars ? (series.fill ?? series.stroke) : series.fill,
      paths: barsPath,
      points: series.points
        ? { show: true, size: 8, width: 0, fill: series.stroke, stroke: series.stroke }
        : { show: false },
      spanGaps: false
    })
  }

  return {
    width,
    height,
    series: seriesOptions,
    scales: {
      x: {
        time: false,
        range: xRange ? () => xRange : undefined
      },
      y: { auto: true }
    },
    axes: [
      {
        stroke: palette.axis,
        grid: { stroke: palette.grid, width: 1 },
        ticks: { stroke: palette.axis, width: 1 },
        font: '10px system-ui',
        labelFont: '11px system-ui',
        label: props.xLabel,
        labelSize: props.xLabel ? 16 : 8,
        labelGap: 4,
        size: 30,
        values: (_u, splits) => splits.map(value => formatX(value))
      },
      {
        stroke: palette.axis,
        grid: { stroke: palette.grid, width: 1 },
        ticks: { stroke: palette.axis, width: 1 },
        font: '10px system-ui',
        labelFont: '11px system-ui',
        label: props.yLabel,
        labelSize: props.yLabel ? 16 : 8,
        labelGap: 4,
        size: 58,
        values: (_u, splits) => splits.map(value => formatY(value))
      }
    ],
    cursor: {
      show: true,
      drag: { x: false, y: false },
      focus: { prox: 24 },
      points: {
        size: 7,
        fill: (u, seriesIndex) => u.series[seriesIndex].stroke as string
      }
    },
    legend: { show: false },
    select: { show: false, left: 0, top: 0, width: 0, height: 0 },
    hooks: {
      setCursor: [
        (u) => {
          updateTooltip(u)
        }
      ]
    }
  }
}

const buildData = (): uPlot.AlignedData => {
  return [props.x, ...props.series.map(series => series.data)] as unknown as uPlot.AlignedData
}

const createChart = () => {
  if (!container.value || props.series.length === 0 || chart.value) return

  const rect = container.value.getBoundingClientRect()
  const width = Math.max(260, Math.floor(rect.width || 640))
  const height = props.height ?? 220

  chart.value = new uPlot(createOptions(width, height), buildData(), container.value)

  overElement = container.value.querySelector('.u-over') as HTMLElement | null
  overElement?.addEventListener('mouseleave', hideTooltip)

  resizeObserver = new ResizeObserver(() => {
    if (!container.value || !chart.value) return
    const nextWidth = Math.max(260, Math.floor(container.value.getBoundingClientRect().width))
    if (Math.abs(chart.value.width - nextWidth) > 1) {
      chart.value.setSize({ width: nextWidth, height })
    }
  })
  resizeObserver.observe(container.value)
}

const destroyChart = () => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (overElement) {
    overElement.removeEventListener('mouseleave', hideTooltip)
    overElement = null
  }
  if (chart.value) {
    chart.value.destroy()
    chart.value = null
  }
  hideTooltip()
}

const rebuild = () => {
  destroyChart()
  if (mountFrame != null) cancelAnimationFrame(mountFrame)
  nextTick(() => {
    mountFrame = requestAnimationFrame(createChart)
  })
}

watch(
  () => [props.x, props.series, props.isDark, props.height, props.xRange],
  () => rebuild()
)

onMounted(() => {
  mountFrame = requestAnimationFrame(createChart)
})

onUnmounted(() => {
  if (mountFrame != null) cancelAnimationFrame(mountFrame)
  destroyChart()
})
</script>

<template>
  <div class="w-full">
    <div
      v-if="(showLegend ?? series.length > 1) && series.length > 1"
      class="flex flex-wrap items-center gap-x-4 gap-y-1 mb-1.5 px-1"
    >
      <span
        v-for="item in series"
        :key="item.label"
        class="inline-flex items-center gap-1.5 text-[11px]"
        :class="isDark ? 'text-gray-400' : 'text-gray-600'"
      >
        <span class="w-2.5 h-0.5 rounded-full inline-block" :style="{ backgroundColor: item.stroke }"></span>
        {{ item.label }}
      </span>
    </div>

    <div class="relative w-full">
      <div ref="container" class="w-full" :style="{ height: `${height ?? 220}px` }"></div>

      <div
        v-if="tooltipVisible"
        class="pointer-events-none absolute z-20 rounded-lg border px-2.5 py-2 text-[11px] shadow-xl min-w-[140px]"
        :class="isDark ? 'bg-gray-900/95 border-gray-600 text-gray-200' : 'bg-white/95 border-gray-300 text-gray-800'"
        :style="{ left: `${tooltipPosition.left}px`, top: `${tooltipPosition.top}px` }"
      >
        <div class="font-medium mb-1" :class="isDark ? 'text-white' : 'text-gray-900'">{{ tooltipTitle }}</div>
        <div v-for="row in tooltipRows" :key="row.label" class="flex items-center justify-between gap-4">
          <span class="inline-flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: row.color }"></span>
            {{ row.label }}
          </span>
          <span class="font-mono tabular-nums">{{ row.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.u-wrap) {
  background: transparent !important;
}
</style>
