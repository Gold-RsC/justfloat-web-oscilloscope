export interface AnalysisChartSeries {
  label: string
  data: (number | null)[]
  stroke: string
  width?: number
  fill?: string
  /** line: 普通折线；bars: 柱状图 */
  kind?: 'line' | 'bars'
  /** 只显示数据点（用于频谱谐波标记） */
  points?: boolean
  /** 是否在提示框中显示（默认 true） */
  tooltip?: boolean
}
