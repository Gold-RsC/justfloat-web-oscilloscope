/**
 * 格式化数字，保留指定小数位
 * 如果整数部分 >= 7 位，不显示小数
 * 否则确保总位数不超过 7 位（不包括小数点）
 */
export function formatNumber(value: number, decimals: number = 6): string {
  if (!isFinite(value)) return '-'

  const absValue = Math.abs(value)
  const integerPart = Math.floor(absValue)
  const integerDigits = integerPart === 0 ? 1 : Math.floor(Math.log10(integerPart)) + 1

  // 如果整数部分已经有 7 位或更多，不显示小数
  if (integerDigits >= 7) {
    return value.toFixed(0)
  }

  // 计算可以保留的小数位数
  const maxDecimals = Math.max(0, 7 - integerDigits)
  const finalDecimals = Math.min(decimals, maxDecimals)

  return value.toFixed(finalDecimals)
}

/**
 * 格式化大数字（带单位）
 */
export function formatLargeNumber(value: number): string {
  if (value >= 1000000) {
    return (value / 1000000).toFixed(2) + 'M'
  }
  if (value >= 1000) {
    return (value / 1000).toFixed(2) + 'K'
  }
  return value.toString()
}

/**
 * 格式化时间（毫秒）
 */
export function formatTime(ms: number): string {
  if (ms < 1) {
    return (ms * 1000).toFixed(0) + ' μs'
  }
  if (ms < 1000) {
    return ms.toFixed(1) + ' ms'
  }
  if (ms < 60000) {
    return (ms / 1000).toFixed(2) + ' s'
  }
  // 大于1分钟，显示 分钟:秒 格式
  const minutes = Math.floor(ms / 60000)
  const seconds = (ms % 60000) / 1000
  return `${minutes}:${seconds.toFixed(0).padStart(2, '0')} min`
}

/**
 * 格式化频率
 */
export function formatFrequency(hz: number): string {
  if (!isFinite(hz)) return '—'
  if (hz >= 1000000) {
    return (hz / 1000000).toFixed(2) + ' MHz'
  }
  if (hz >= 1000) {
    return (hz / 1000).toFixed(2) + ' kHz'
  }
  if (hz >= 100) {
    return hz.toFixed(2) + ' Hz'
  }
  if (hz >= 1) {
    return hz.toFixed(3) + ' Hz'
  }
  if (hz > 0) {
    return formatSmartNumber(hz, 4) + ' Hz'
  }
  return '0 Hz'
}

/**
 * 格式化数值，保留约 5 位有效数字（极大 / 极小值使用科学计数法）
 */
export function formatSmartNumber(value: number, significantDigits: number = 5): string {
  if (!isFinite(value)) return '—'
  if (value === 0) return '0'

  const abs = Math.abs(value)
  if (abs >= 1e7 || abs < 1e-4) {
    return value.toExponential(Math.max(0, significantDigits - 1))
  }

  const exponent = Math.floor(Math.log10(abs))
  const decimals = Math.max(0, significantDigits - 1 - exponent)
  let text = value.toFixed(Math.min(decimals, 12))
  if (text.includes('.')) {
    text = text.replace(/0+$/, '').replace(/\.$/, '')
  }
  return text
}

/**
 * 紧凑数字格式（坐标轴 / 提示框使用）
 */
export function formatAxisNumber(value: number): string {
  if (!isFinite(value)) return ''
  if (value === 0) return '0'

  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  const compact = (v: number): string => {
    if (v >= 100) return v.toFixed(0)
    if (v >= 10) return v.toFixed(1).replace(/\.0$/, '')
    return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  }

  if (abs >= 1e9) return `${sign}${compact(abs / 1e9)}G`
  if (abs >= 1e6) return `${sign}${compact(abs / 1e6)}M`
  if (abs >= 1e3) return `${sign}${compact(abs / 1e3)}k`
  if (abs >= 1) return `${sign}${compact(abs)}`
  if (abs >= 1e-3) return `${sign}${compact(abs * 1e3)}m`
  if (abs >= 1e-6) return `${sign}${compact(abs * 1e6)}µ`
  return `${sign}${compact(abs * 1e9)}n`
}

/**
 * 紧凑频率格式（坐标轴使用）
 */
export function formatAxisFrequency(hz: number): string {
  if (!isFinite(hz)) return ''
  if (hz === 0) return '0'
  return formatAxisNumber(hz) + 'Hz'
}

/**
 * 紧凑时间格式（坐标轴使用，输入单位秒）
 */
export function formatAxisTime(seconds: number): string {
  if (!isFinite(seconds)) return ''
  if (seconds === 0) return '0'

  const sign = seconds < 0 ? '-' : ''
  const abs = Math.abs(seconds)
  const compact = (v: number): string => {
    if (v >= 100) return v.toFixed(0)
    if (v >= 10) return v.toFixed(1).replace(/\.0$/, '')
    return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  }

  if (abs < 1e-6) return `${sign}${compact(abs * 1e9)}ns`
  if (abs < 1e-3) return `${sign}${compact(abs * 1e6)}µs`
  if (abs < 1) return `${sign}${compact(abs * 1e3)}ms`
  return `${sign}${compact(abs)}s`
}

/**
 * 时长格式化（输入单位秒）
 */
export function formatDurationSeconds(seconds: number): string {
  return formatTime(seconds * 1000)
}

/**
 * 百分比格式化（输入 0-1 的比例）
 */
export function formatPercentRatio(ratio: number, digits: number = 2): string {
  if (!isFinite(ratio)) return '—'
  return `${(ratio * 100).toFixed(digits)}%`
}

/**
 * 下载 Blob
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 下载 JSON 文件
 */
export function downloadJson(data: object, filename: string) {
  const json = JSON.stringify(data, null, 2)
  downloadBlob(new Blob([json], { type: 'application/json' }), filename)
}

/**
 * 下载文本文件
 */
export function downloadText(text: string, filename: string, mime: string = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type: mime }), filename)
}

/**
 * 清理文件名称中的非法字符
 */
export function sanitizeFileName(name: string, fallback: string = 'oscilloscope'): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/-+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[-. ]+|[-. ]+$/g, '')
  return cleaned || fallback
}

/**
 * 去掉已有的 .json / .csv 扩展名
 */
export function stripExportExtension(name: string): string {
  return name.trim().replace(/\.(json|csv)$/i, '')
}

/**
 * 根据导出名称和格式生成最终文件名
 */
export function buildExportFileName(name: string, format: 'json' | 'csv'): string {
  return `${sanitizeFileName(stripExportExtension(name))}.${format}`
}

/**
 * 生成 CSV 文本
 * @param headers 通道表头（不含时间列）
 * @param columns 各通道数据（等长数组）
 * @param sampleRate 采样率，Hz
 * @param includeTimeColumn 是否在首列输出时间（秒）
 * @param precision 数值小数位数
 */
export function buildCsv(
  headers: string[],
  columns: number[][],
  sampleRate: number,
  includeTimeColumn: boolean,
  precision: number
): string {
  if (columns.length === 0) return ''

  let rowCount = 0
  for (const column of columns) rowCount = Math.max(rowCount, column.length)

  const useTime = includeTimeColumn && sampleRate > 0
  const escapeCsv = (value: string): string =>
    /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

  const valueDecimals = Math.max(0, Math.min(10, Math.round(precision)))
  const timeDecimals = Math.max(6, valueDecimals)

  const headerFields = useTime ? ['时间(s)', ...headers] : headers
  const lines: string[] = [headerFields.map(escapeCsv).join(',')]

  for (let row = 0; row < rowCount; row++) {
    const fields: string[] = []
    if (useTime) fields.push((row / sampleRate).toFixed(timeDecimals))
    for (const column of columns) {
      const value = column[row]
      fields.push(Number.isFinite(value) ? value.toFixed(valueDecimals) : '')
    }
    lines.push(fields.join(','))
  }

  return lines.join('\n') + '\n'
}

/**
 * 读取 JSON 文件
 */
export function readJsonFile<T>(file: File): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as T
        resolve(data)
      } catch (error) {
        reject(new Error('无效的 JSON 文件'))
      }
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsText(file)
  })
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastCall >= delay) {
      lastCall = now
      fn(...args)
    }
  }
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}
