/**
 * 波形分析算法
 *
 * - 正弦波：基频、直流分量、交流幅值 / RMS、THD、SINAD、幅频谱、正弦拟合 R²
 * - 方波：高 / 低电平、频率、正负占空比、边沿抖动、理想方波重建 R²
 * - 稳定值：均值、中位数、标准差、置信区间、漂移、分布直方图
 *
 * 所有输入均为按时间均匀采样的通道数据（已应用通道系数），采样率单位 Hz。
 */

export type WaveformType = 'sine' | 'square' | 'stable'

export interface AnalysisMeta {
  sampleRate: number
  /** 原始通道数据点数 */
  totalPoints: number
  /** 参与分析的点数（最近 windowPoints 个点） */
  windowPoints: number
  /** 分析窗口在原始数组中的起始索引 */
  windowStart: number
  /** 分析窗口时长（秒） */
  duration: number
}

export interface AnalysisError {
  ok: false
  error: string
}

export interface HarmonicInfo {
  order: number
  frequency: number
  amplitude: number
  relativePct: number
}

export interface SpectrumPeak {
  frequency: number
  amplitude: number
  relativeDb: number
}

export interface SpectrumData {
  /** 完整幅频谱（不含直流分量） */
  frequencies: Float64Array
  amplitudes: Float64Array
  /** 用于绘图的降采样频谱，保留每个频段峰值 */
  plotFrequencies: Float64Array
  plotAmplitudes: Float64Array
  /** 频率分辨率 fs / N */
  frequencyResolution: number
  fftSize: number
}

export interface SineTimeSeries {
  /** 相对绘图起点的秒数 */
  time: Float64Array
  original: Float64Array
  fitted: Float64Array
}

export interface SineAnalysis extends AnalysisMeta {
  ok: true
  dc: number
  acRms: number
  totalRms: number
  /** 基波幅值（最小二乘拟合） */
  amplitude: number
  /** 基波理论有效值 A / √2 */
  amplitudeRms: number
  frequency: number
  period: number
  /** 相位（弧度，-π ~ π） */
  phase: number
  fitR2: number
  /** 正弦拟合残差有效值（噪声 + 畸变） */
  residualRms: number
  thdPct: number
  sinadDb: number
  crestFactor: number
  spectrum: SpectrumData
  harmonics: HarmonicInfo[]
  topPeaks: SpectrumPeak[]
  timeSeries: SineTimeSeries
}

export interface SquareTimeSeries {
  time: Float64Array
  original: Float64Array
  /** 根据估计参数重建的理想方波（无有效相位时为空数组） */
  reconstructed: Float64Array
}

export interface HistogramData {
  binCenters: Float64Array
  counts: Float64Array
}

export interface SquareAnalysis extends AnalysisMeta {
  ok: true
  lowLevel: number
  highLevel: number
  amplitude: number
  midpoint: number
  mean: number
  rms: number
  acRms: number
  frequency: number
  period: number
  /** 正占空比 0 ~ 1（高电平占比） */
  positiveDuty: number
  negativeDuty: number
  /** 每周期的正占空比标准差（百分点） */
  dutyStdPct: number
  riseCount: number
  fallCount: number
  /** 周期间隔抖动（标准差 / 均值，%） */
  periodJitterPct: number
  /** 理想方波重建 R²，无法重建时为 NaN */
  reconstructionR2: number
  frequencySource: 'edges' | 'fft'
  timeSeries: SquareTimeSeries
  histogram: HistogramData
}

export interface StableTimeSeries {
  time: Float64Array
  values: Float64Array
  meanLine: Float64Array
}

export interface StableDistribution extends HistogramData {
  gaussian: Float64Array
}

export interface StableAnalysis extends AnalysisMeta {
  ok: true
  mean: number
  median: number
  std: number
  min: number
  max: number
  p2p: number
  rms: number
  p05: number
  p95: number
  /** 均值 95% 置信区间半宽 */
  ci95: number
  /** 相对稳定性 σ / |μ| × 100%，均值接近 0 时为 null */
  stabilityPct: number | null
  /** 线性漂移速率（单位 / 秒） */
  driftPerSecond: number
  /** 分析窗口内累计漂移 */
  totalDrift: number
  driftR2: number
  timeSeries: StableTimeSeries
  distribution: StableDistribution
}

const MIN_ANALYSIS_POINTS = 8
/** 参与波形分析的最大点数（取缓冲区最近的一段） */
export const MAX_ANALYSIS_POINTS = 65536
const MAX_TIME_POINTS = 2000
const MAX_SPECTRUM_POINTS = 4096
const MIN_SPECTRUM_POINTS = 16

interface PreparedWindow {
  data: Float64Array
  meta: AnalysisMeta
}

interface SineFit {
  offset: number
  sinAmp: number
  cosAmp: number
  amplitude: number
  phase: number
  r2: number
  residualRms: number
}

interface SpectrumComputation {
  frequencies: Float64Array
  amplitudes: Float64Array
  frequencyResolution: number
  fftSize: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function meanOf(data: Float64Array): number {
  let sum = 0
  for (let i = 0; i < data.length; i++) sum += data[i]
  return data.length > 0 ? sum / data.length : 0
}

function rmsOf(data: Float64Array): number {
  let sum = 0
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
  return data.length > 0 ? Math.sqrt(sum / data.length) : 0
}

function stdOf(data: Float64Array, mean: number): number {
  if (data.length < 2) return 0
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    const d = data[i] - mean
    sum += d * d
  }
  return Math.sqrt(sum / (data.length - 1))
}

function percentileOfSorted(sorted: Float64Array, ratio: number): number {
  if (sorted.length === 0) return NaN
  if (sorted.length === 1) return sorted[0]
  const position = clamp(ratio, 0, 1) * (sorted.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  const t = position - lower
  return sorted[lower] * (1 - t) + sorted[upper] * t
}

/**
 * 取最近的一段数据，校验有效性并填补非有限值。
 */
function prepareWindow(values: Float64Array, sampleRate: number): PreparedWindow | AnalysisError {
  if (!isFinite(sampleRate) || sampleRate <= 0) {
    return { ok: false, error: '采样率未知，无法进行时域 / 频域分析' }
  }
  if (!values || values.length < MIN_ANALYSIS_POINTS) {
    return { ok: false, error: `数据点不足（至少需要 ${MIN_ANALYSIS_POINTS} 个点）` }
  }

  const totalPoints = values.length
  const windowStart = Math.max(0, totalPoints - MAX_ANALYSIS_POINTS)
  const length = totalPoints - windowStart
  const data = new Float64Array(length)

  let finiteCount = 0
  for (let i = 0; i < length; i++) {
    const value = values[windowStart + i]
    data[i] = value
    if (isFinite(value)) finiteCount++
  }

  if (finiteCount < MIN_ANALYSIS_POINTS) {
    return { ok: false, error: '有效数据点不足，无法分析' }
  }
  if (finiteCount < length * 0.5) {
    return { ok: false, error: '无效数据点超过 50%，无法分析' }
  }

  // 用上一个有效值填补 NaN / Infinity，保持时间轴均匀
  let firstFinite = -1
  for (let i = 0; i < length; i++) {
    if (isFinite(data[i])) {
      firstFinite = i
      break
    }
  }
  if (firstFinite < 0) {
    return { ok: false, error: '没有有效数据点' }
  }
  for (let i = 0; i < firstFinite; i++) data[i] = data[firstFinite]
  let last = data[firstFinite]
  for (let i = firstFinite + 1; i < length; i++) {
    if (isFinite(data[i])) last = data[i]
    else data[i] = last
  }

  return {
    data,
    meta: {
      sampleRate,
      totalPoints,
      windowPoints: length,
      windowStart,
      duration: length / sampleRate
    }
  }
}

function isAnalysisError(value: PreparedWindow | AnalysisError): value is AnalysisError {
  return 'ok' in value && value.ok === false
}

/** 原地基 2 FFT */
function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    while (j & bit) {
      j ^= bit
      bit >>= 1
    }
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len
    const wLenRe = Math.cos(angle)
    const wLenIm = Math.sin(angle)
    for (let i = 0; i < n; i += len) {
      let wRe = 1
      let wIm = 0
      const half = len >> 1
      for (let j = 0; j < half; j++) {
        const evenRe = re[i + j]
        const evenIm = im[i + j]
        const oddRe = re[i + j + half]
        const oddIm = im[i + j + half]
        const vRe = oddRe * wRe - oddIm * wIm
        const vIm = oddRe * wIm + oddIm * wRe
        re[i + j] = evenRe + vRe
        im[i + j] = evenIm + vIm
        re[i + j + half] = evenRe - vRe
        im[i + j + half] = evenIm - vIm
        const nextWRe = wRe * wLenRe - wIm * wLenIm
        wIm = wRe * wLenIm + wIm * wLenRe
        wRe = nextWRe
      }
    }
  }
}

/**
 * 计算单边幅频谱（Hann 窗 + 幅值修正），使用最近的 2 的幂次长度数据。
 */
function computeSpectrum(data: Float64Array, sampleRate: number): SpectrumComputation | null {
  let fftSize = 1
  while (fftSize * 2 <= data.length) fftSize *= 2
  if (fftSize < MIN_SPECTRUM_POINTS) return null

  const offset = data.length - fftSize
  let mean = 0
  for (let i = 0; i < fftSize; i++) mean += data[offset + i]
  mean /= fftSize

  const re = new Float64Array(fftSize)
  const im = new Float64Array(fftSize)
  let windowSum = 0
  for (let i = 0; i < fftSize; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / fftSize)
    windowSum += w
    re[i] = (data[offset + i] - mean) * w
  }

  fftInPlace(re, im)

  const bins = fftSize >> 1
  const frequencies = new Float64Array(bins + 1)
  const amplitudes = new Float64Array(bins + 1)
  const df = sampleRate / fftSize
  for (let k = 0; k <= bins; k++) {
    frequencies[k] = k * df
    const scale = k === 0 || k === bins ? 1 / windowSum : 2 / windowSum
    amplitudes[k] = Math.hypot(re[k], im[k]) * scale
  }

  return { frequencies, amplitudes, frequencyResolution: df, fftSize }
}

function refinePeakFrequency(spectrum: SpectrumComputation, index: number): number {
  const { amplitudes, frequencyResolution, frequencies } = spectrum
  if (index <= 0 || index >= amplitudes.length - 1) return frequencies[index] ?? 0
  const y0 = amplitudes[index - 1]
  const y1 = amplitudes[index]
  const y2 = amplitudes[index + 1]
  const denominator = y0 - 2 * y1 + y2
  let delta = denominator !== 0 ? (0.5 * (y0 - y2)) / denominator : 0
  delta = clamp(delta, -0.5, 0.5)
  return (index + delta) * frequencyResolution
}

function findFundamental(spectrum: SpectrumComputation): { frequency: number; amplitude: number } | null {
  const { amplitudes } = spectrum
  const last = amplitudes.length - 2
  let peakIndex = -1
  let peakAmplitude = 0
  for (let k = 2; k <= last; k++) {
    if (amplitudes[k] > peakAmplitude) {
      peakAmplitude = amplitudes[k]
      peakIndex = k
    }
  }
  if (peakIndex < 0 || !isFinite(peakAmplitude) || peakAmplitude <= 0) return null
  return {
    frequency: refinePeakFrequency(spectrum, peakIndex),
    amplitude: peakAmplitude
  }
}

/**
 * 估算一段数据的基频（用于选区快速读数）
 *
 * 取最近 maxPoints 个点，做 Hann 窗 FFT 并查找峰值；
 * 若没有明显周期分量（峰值过低 / 不足 2 个周期），返回 null。
 */
export function estimateDominantFrequency(
  values: ArrayLike<number>,
  sampleRate: number,
  maxPoints: number = 8192
): number | null {
  if (!(sampleRate > 0) || !isFinite(sampleRate) || values.length < 16) return null

  const available = Math.min(values.length, maxPoints)
  let length = 1
  while (length * 2 <= available) length *= 2
  if (length < 16) return null

  const start = values.length - length
  const data = new Float64Array(length)
  let finiteCount = 0
  let firstFinite = -1
  for (let i = 0; i < length; i++) {
    const value = values[start + i]
    data[i] = value
    if (isFinite(value)) {
      finiteCount++
      if (firstFinite < 0) firstFinite = i
    }
  }
  if (firstFinite < 0 || finiteCount < length * 0.5) return null

  for (let i = 0; i < firstFinite; i++) data[i] = data[firstFinite]
  let last = data[firstFinite]
  for (let i = firstFinite + 1; i < length; i++) {
    if (isFinite(data[i])) last = data[i]
    else data[i] = last
  }

  const spectrum = computeSpectrum(data, sampleRate)
  if (!spectrum) return null
  const fundamental = findFundamental(spectrum)
  if (!fundamental) return null

  const mean = meanOf(data)
  const acRms = stdOf(data, mean)
  if (!(acRms > 1e-12)) return null

  // 至少需要约 2 个周期，且峰值相对交流有效值足够显著
  if (fundamental.frequency * (length / sampleRate) < 2) return null
  if (fundamental.amplitude < acRms * 0.15) return null

  return fundamental.frequency
}

function amplitudeNear(spectrum: SpectrumComputation, frequency: number): number {
  const { frequencies, amplitudes, frequencyResolution } = spectrum
  const center = Math.round(frequency / frequencyResolution)
  if (center < 1 || center >= amplitudes.length) return 0
  const radius = 2
  let max = 0
  for (let k = Math.max(1, center - radius); k <= Math.min(amplitudes.length - 1, center + radius); k++) {
    if (frequencies[k] > 0 && amplitudes[k] > max) max = amplitudes[k]
  }
  return max
}

function downsampleSpectrum(
  frequencies: Float64Array,
  amplitudes: Float64Array,
  maxPoints: number
): { frequencies: Float64Array; amplitudes: Float64Array } {
  const count = frequencies.length
  if (count <= maxPoints) {
    return { frequencies, amplitudes }
  }

  const step = Math.ceil(count / maxPoints)
  const buckets = Math.ceil(count / step)
  const outFreq = new Float64Array(buckets)
  const outAmp = new Float64Array(buckets)

  for (let b = 0; b < buckets; b++) {
    const start = b * step
    const end = Math.min(count, start + step)
    let bestIndex = start
    let best = -Infinity
    for (let i = start; i < end; i++) {
      if (amplitudes[i] > best) {
        best = amplitudes[i]
        bestIndex = i
      }
    }
    outFreq[b] = frequencies[bestIndex]
    outAmp[b] = amplitudes[bestIndex]
  }

  return { frequencies: outFreq, amplitudes: outAmp }
}

/**
 * 在给定频率下做最小二乘正弦拟合：x(t) ≈ offset + a·sin(ωt) + b·cos(ωt)
 */
function fitSineAtFrequency(data: Float64Array, sampleRate: number, frequency: number): SineFit | null {
  if (!(frequency > 0) || !isFinite(frequency)) return null
  const n = data.length
  if (n < 4) return null

  const omega = (2 * Math.PI * frequency) / sampleRate
  const sinStep = Math.sin(omega)
  const cosStep = Math.cos(omega)

  let s = 0
  let c = 1
  let sumS = 0
  let sumC = 0
  let sumSS = 0
  let sumCC = 0
  let sumSC = 0
  let sumX = 0
  let sumXS = 0
  let sumXC = 0

  for (let i = 0; i < n; i++) {
    const x = data[i]
    sumS += s
    sumC += c
    sumSS += s * s
    sumCC += c * c
    sumSC += s * c
    sumX += x
    sumXS += x * s
    sumXC += x * c
    const nextS = s * cosStep + c * sinStep
    c = c * cosStep - s * sinStep
    s = nextS
  }

  const a11 = n
  const a12 = sumS
  const a13 = sumC
  const a22 = sumSS
  const a23 = sumSC
  const a33 = sumCC

  const det =
    a11 * (a22 * a33 - a23 * a23) -
    a12 * (a12 * a33 - a23 * a13) +
    a13 * (a12 * a23 - a22 * a13)

  if (Math.abs(det) < 1e-12) return null

  const detOffset =
    sumX * (a22 * a33 - a23 * a23) -
    a12 * (sumXS * a33 - a23 * sumXC) +
    a13 * (sumXS * a23 - a22 * sumXC)

  const detSin =
    a11 * (sumXS * a33 - a23 * sumXC) -
    sumX * (a12 * a33 - a23 * a13) +
    a13 * (a12 * sumXC - sumXS * a13)

  const detCos =
    a11 * (a22 * sumXC - sumXS * a23) -
    a12 * (a12 * sumXC - sumXS * a13) +
    sumX * (a12 * a23 - a22 * a13)

  const offset = detOffset / det
  const sinAmp = detSin / det
  const cosAmp = detCos / det

  if (!isFinite(offset) || !isFinite(sinAmp) || !isFinite(cosAmp)) return null

  // 计算 R²
  const mean = meanOf(data)
  let sse = 0
  let sst = 0
  s = 0
  c = 1
  for (let i = 0; i < n; i++) {
    const x = data[i]
    const predicted = offset + sinAmp * s + cosAmp * c
    const residual = x - predicted
    const deviation = x - mean
    sse += residual * residual
    sst += deviation * deviation
    const nextS = s * cosStep + c * sinStep
    c = c * cosStep - s * sinStep
    s = nextS
  }

  const amplitude = Math.hypot(sinAmp, cosAmp)
  const phase = Math.atan2(cosAmp, sinAmp)
  const r2 = sst > 1e-18 ? 1 - sse / sst : sse <= 1e-18 ? 1 : 0
  const residualRms = Math.sqrt(sse / n)

  return { offset, sinAmp, cosAmp, amplitude, phase, r2, residualRms }
}

/**
 * 在 FFT 估计值附近搜索使拟合 R² 最大的频率，提高频率估计精度。
 */
function refineSineFit(
  data: Float64Array,
  sampleRate: number,
  initialFrequency: number,
  frequencyResolution: number
): { frequency: number; fit: SineFit } | null {
  const nyquist = sampleRate / 2
  let center = initialFrequency
  let span = Math.max(frequencyResolution * 2, initialFrequency * 0.01)

  let bestFrequency = center
  let bestFit = fitSineAtFrequency(data, sampleRate, center)
  if (!bestFit) return null

  for (let stage = 0; stage < 2; stage++) {
    const steps = stage === 0 ? 24 : 16
    const from = Math.max(frequencyResolution * 0.5, center - span)
    const to = Math.min(nyquist * 0.999, center + span)
    if (!(to > from)) break

    let stageBestFrequency = center
    let stageBestFit = fitSineAtFrequency(data, sampleRate, center)
    if (stageBestFit && stageBestFit.r2 > bestFit.r2) {
      bestFrequency = center
      bestFit = stageBestFit
    }

    for (let i = 0; i <= steps; i++) {
      const frequency = from + ((to - from) * i) / steps
      const fit = fitSineAtFrequency(data, sampleRate, frequency)
      if (fit && fit.r2 > (stageBestFit?.r2 ?? -Infinity)) {
        stageBestFit = fit
        stageBestFrequency = frequency
      }
      if (fit && fit.r2 > bestFit.r2) {
        bestFrequency = frequency
        bestFit = fit
      }
    }

    center = stageBestFrequency
    span /= stage === 0 ? 8 : 10
  }

  // 黄金分割最后精修，使频率误差远小于网格步长
  let low = Math.max(frequencyResolution * 0.5, center - span * 2)
  let high = Math.min(nyquist * 0.999, center + span * 2)
  const goldenRatio = (Math.sqrt(5) - 1) / 2
  let x1 = high - goldenRatio * (high - low)
  let x2 = low + goldenRatio * (high - low)
  let fit1 = fitSineAtFrequency(data, sampleRate, x1)
  let fit2 = fitSineAtFrequency(data, sampleRate, x2)

  for (let iteration = 0; iteration < 24 && high - low > frequencyResolution * 1e-4; iteration++) {
    const r1 = fit1?.r2 ?? -Infinity
    const r2 = fit2?.r2 ?? -Infinity
    if (r1 < r2) {
      low = x1
      x1 = x2
      fit1 = fit2
      x2 = low + goldenRatio * (high - low)
      fit2 = fitSineAtFrequency(data, sampleRate, x2)
    } else {
      high = x2
      x2 = x1
      fit2 = fit1
      x1 = high - goldenRatio * (high - low)
      fit1 = fitSineAtFrequency(data, sampleRate, x1)
    }
    if (fit1 && fit1.r2 > bestFit.r2) {
      bestFit = fit1
      bestFrequency = x1
    }
    if (fit2 && fit2.r2 > bestFit.r2) {
      bestFit = fit2
      bestFrequency = x2
    }
  }

  return { frequency: bestFrequency, fit: bestFit }
}

function buildSineTimeSeries(
  data: Float64Array,
  sampleRate: number,
  frequency: number,
  fit: SineFit
): SineTimeSeries {
  const periodSamples = frequency > 0 ? sampleRate / frequency : data.length
  const desired = Math.min(data.length, Math.max(128, Math.round(periodSamples * 3)))
  const stride = Math.max(1, Math.ceil(desired / MAX_TIME_POINTS))
  const count = Math.max(1, Math.ceil(desired / stride))
  const start = data.length - desired

  const time = new Float64Array(count)
  const original = new Float64Array(count)
  const fitted = new Float64Array(count)
  const omega = (2 * Math.PI * frequency) / sampleRate

  for (let i = 0; i < count; i++) {
    const index = Math.min(data.length - 1, start + i * stride)
    time[i] = (index - start) / sampleRate
    original[i] = data[index]
    fitted[i] = fit.offset + fit.amplitude * Math.sin(omega * index + fit.phase)
  }

  return { time, original, fitted }
}

/**
 * 正弦波分析
 */
export function analyzeSine(values: Float64Array, sampleRate: number): SineAnalysis | AnalysisError {
  const prepared = prepareWindow(values, sampleRate)
  if (isAnalysisError(prepared)) return prepared
  const { data, meta } = prepared

  const spectrumComputation = computeSpectrum(data, sampleRate)
  if (!spectrumComputation) {
    return { ok: false, error: '数据点太少，无法计算频谱' }
  }

  const fundamental = findFundamental(spectrumComputation)
  if (!fundamental) {
    return { ok: false, error: '未检测到明显的周期性分量，无法计算正弦参数' }
  }

  const refined = refineSineFit(
    data,
    sampleRate,
    fundamental.frequency,
    spectrumComputation.frequencyResolution
  )
  if (!refined) {
    return { ok: false, error: '正弦拟合失败' }
  }

  const { frequency, fit } = refined
  if (!(fit.amplitude > 0) || !isFinite(fit.amplitude)) {
    return { ok: false, error: '基波幅值过小，无法计算正弦参数' }
  }

  const dc = meanOf(data)
  const totalRms = rmsOf(data)
  const acRms = stdOf(data, dc)
  const amplitudeRms = fit.amplitude / Math.SQRT2

  let maxDeviation = 0
  for (let i = 0; i < data.length; i++) {
    maxDeviation = Math.max(maxDeviation, Math.abs(data[i] - dc))
  }
  const crestFactor = acRms > 1e-12 ? maxDeviation / acRms : NaN

  // 谐波与 THD
  const harmonics: HarmonicInfo[] = []
  let harmonicPower = 0
  const nyquist = sampleRate / 2
  for (let order = 2; order <= 10; order++) {
    const harmonicFrequency = frequency * order
    if (harmonicFrequency >= nyquist) break
    const amplitude = amplitudeNear(spectrumComputation, harmonicFrequency)
    harmonicPower += amplitude * amplitude
    harmonics.push({
      order,
      frequency: harmonicFrequency,
      amplitude,
      relativePct: (amplitude / fit.amplitude) * 100
    })
  }
  const thdPct = (Math.sqrt(harmonicPower) / fit.amplitude) * 100

  // SINAD：基波功率与拟合残差（噪声 + 畸变）功率之比
  const signalPower = (fit.amplitude * fit.amplitude) / 2
  const noisePower = Math.max(fit.residualRms * fit.residualRms, 1e-30)
  const sinadDb = signalPower > 0 ? 10 * Math.log10(signalPower / noisePower) : NaN

  // 主要谱峰
  const { amplitudes, frequencies, frequencyResolution } = spectrumComputation
  const peaks: SpectrumPeak[] = []
  for (let k = 3; k < amplitudes.length - 1; k++) {
    if (amplitudes[k] >= amplitudes[k - 1] && amplitudes[k] > amplitudes[k + 1]) {
      if (amplitudes[k] >= fit.amplitude * 0.01) {
        peaks.push({
          frequency: refinePeakFrequency(spectrumComputation, k),
          amplitude: amplitudes[k],
          relativeDb: 20 * Math.log10(amplitudes[k] / fit.amplitude)
        })
      }
    }
  }
  peaks.sort((a, b) => b.amplitude - a.amplitude)
  const topPeaks = peaks.slice(0, 8)

  // 基波幅值以时域最小二乘拟合结果为准，避免 Hann 窗扇贝损失带来的偏差
  const fundamentalPeak = topPeaks.find(
    peak => Math.abs(peak.frequency - frequency) <= frequencyResolution * 2
  )
  if (fundamentalPeak) {
    fundamentalPeak.frequency = frequency
    fundamentalPeak.amplitude = fit.amplitude
    fundamentalPeak.relativeDb = 0
  }

  const plotSpectrum = downsampleSpectrum(
    frequencies.subarray(1),
    amplitudes.subarray(1),
    MAX_SPECTRUM_POINTS
  )

  const spectrum: SpectrumData = {
    frequencies: frequencies.subarray(1),
    amplitudes: amplitudes.subarray(1),
    plotFrequencies: plotSpectrum.frequencies,
    plotAmplitudes: plotSpectrum.amplitudes,
    frequencyResolution,
    fftSize: spectrumComputation.fftSize
  }

  const timeSeries = buildSineTimeSeries(data, sampleRate, frequency, fit)

  return {
    ok: true,
    ...meta,
    dc,
    acRms,
    totalRms,
    amplitude: fit.amplitude,
    amplitudeRms,
    frequency,
    period: 1 / frequency,
    phase: Math.atan2(Math.sin(fit.phase), Math.cos(fit.phase)),
    fitR2: fit.r2,
    residualRms: fit.residualRms,
    thdPct,
    sinadDb,
    crestFactor,
    spectrum,
    harmonics,
    topPeaks,
    timeSeries
  }
}

interface EdgeDetection {
  rises: number[]
  falls: number[]
  highSamples: number
}

function detectSquareEdges(
  data: Float64Array,
  sampleRate: number,
  threshold: number,
  hysteresis: number
): EdgeDetection {
  const rises: number[] = []
  const falls: number[] = []
  let state = data[0] >= threshold
  let highSamples = state ? 1 : 0

  for (let i = 1; i < data.length; i++) {
    const previous = data[i - 1]
    const current = data[i]
    const delta = current - previous

    if (!state && current >= threshold + hysteresis) {
      const fraction = Math.abs(delta) > 1e-18 ? (threshold - previous) / delta : 1
      rises.push((i - 1 + clamp(fraction, 0, 1)) / sampleRate)
      state = true
    } else if (state && current <= threshold - hysteresis) {
      const fraction = Math.abs(delta) > 1e-18 ? (threshold - previous) / delta : 1
      falls.push((i - 1 + clamp(fraction, 0, 1)) / sampleRate)
      state = false
    }

    if (state) highSamples++
  }

  return { rises, falls, highSamples }
}

function estimateTwoLevels(data: Float64Array): { low: number; high: number } | null {
  const stride = Math.max(1, Math.ceil(data.length / 20000))
  const sample: number[] = []
  for (let i = 0; i < data.length; i += stride) sample.push(data[i])
  if (sample.length < 4) return null

  sample.sort((a, b) => a - b)
  const sorted = Float64Array.from(sample)
  let centerLow = percentileOfSorted(sorted, 0.1)
  let centerHigh = percentileOfSorted(sorted, 0.9)

  if (!isFinite(centerLow) || !isFinite(centerHigh)) return null
  if (centerHigh < centerLow) {
    const swap = centerLow
    centerLow = centerHigh
    centerHigh = swap
  }
  // 极端占空比时 10% / 90% 分位数可能落在同一电平，用最小 / 最大值兜底
  if (Math.abs(centerHigh - centerLow) < 1e-12) {
    centerLow = sorted[0]
    centerHigh = sorted[sorted.length - 1]
  }
  if (Math.abs(centerHigh - centerLow) < 1e-12) return null

  for (let iteration = 0; iteration < 30; iteration++) {
    let sumLow = 0
    let sumHigh = 0
    let countLow = 0
    let countHigh = 0
    const split = (centerLow + centerHigh) / 2

    for (let i = 0; i < sample.length; i++) {
      const value = sample[i]
      if (value <= split) {
        sumLow += value
        countLow++
      } else {
        sumHigh += value
        countHigh++
      }
    }

    if (countLow === 0 || countHigh === 0) break
    const nextLow = sumLow / countLow
    const nextHigh = sumHigh / countHigh
    const change = Math.abs(nextLow - centerLow) + Math.abs(nextHigh - centerHigh)
    centerLow = nextLow
    centerHigh = nextHigh
    if (change < 1e-12 * Math.max(1, Math.abs(centerHigh - centerLow))) break
  }

  const low = Math.min(centerLow, centerHigh)
  const high = Math.max(centerLow, centerHigh)
  if (!(high - low > 0)) return null
  return { low, high }
}

function buildSquareTimeSeries(
  data: Float64Array,
  sampleRate: number,
  frequency: number,
  duty: number,
  lowLevel: number,
  highLevel: number,
  phaseStart: number | null
): SquareTimeSeries {
  const periodSamples = frequency > 0 ? sampleRate / frequency : data.length
  const desired = Math.min(data.length, Math.max(128, Math.round(periodSamples * 4)))
  const stride = Math.max(1, Math.ceil(desired / MAX_TIME_POINTS))
  const count = Math.max(1, Math.ceil(desired / stride))
  const start = data.length - desired
  const period = frequency > 0 ? 1 / frequency : 0

  const time = new Float64Array(count)
  const original = new Float64Array(count)
  const startPhase = phaseStart ?? 0
  const canReconstruct = phaseStart != null && period > 0
  const reconstructed = canReconstruct ? new Float64Array(count) : new Float64Array(0)

  for (let i = 0; i < count; i++) {
    const index = Math.min(data.length - 1, start + i * stride)
    time[i] = (index - start) / sampleRate
    original[i] = data[index]
    if (canReconstruct) {
      const tAbs = index / sampleRate
      let phase = ((tAbs - startPhase) / period) % 1
      if (phase < 0) phase += 1
      reconstructed[i] = phase < duty ? highLevel : lowLevel
    }
  }

  return { time, original, reconstructed }
}

function computeHistogram(data: Float64Array, binCount: number): HistogramData {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < data.length; i++) {
    if (data[i] < min) min = data[i]
    if (data[i] > max) max = data[i]
  }
  if (!isFinite(min) || !isFinite(max)) {
    return { binCenters: new Float64Array(0), counts: new Float64Array(0) }
  }
  if (max === min) {
    return { binCenters: Float64Array.from([min]), counts: Float64Array.from([data.length]) }
  }

  const width = (max - min) / binCount
  const counts = new Float64Array(binCount)
  for (let i = 0; i < data.length; i++) {
    let bin = Math.floor((data[i] - min) / width)
    if (bin < 0) bin = 0
    if (bin >= binCount) bin = binCount - 1
    counts[bin]++
  }

  const binCenters = new Float64Array(binCount)
  for (let i = 0; i < binCount; i++) {
    binCenters[i] = min + (i + 0.5) * width
  }

  return { binCenters, counts }
}

/**
 * 方波分析
 */
export function analyzeSquare(values: Float64Array, sampleRate: number): SquareAnalysis | AnalysisError {
  const prepared = prepareWindow(values, sampleRate)
  if (isAnalysisError(prepared)) return prepared
  const { data, meta } = prepared

  const levels = estimateTwoLevels(data)
  if (!levels) {
    return { ok: false, error: '无法分离高 / 低电平，无法计算方波参数' }
  }
  const { low, high } = levels
  const amplitude = high - low
  if (!(amplitude > 0) || !isFinite(amplitude)) {
    return { ok: false, error: '信号幅度过小，无法计算方波参数' }
  }

  const midpoint = (high + low) / 2
  const hysteresis = amplitude * 0.12
  const edges = detectSquareEdges(data, sampleRate, midpoint, hysteresis)

  // 由相邻上升沿与中间的下降沿计算周期 / 占空比
  const periods: number[] = []
  const duties: number[] = []
  let fallPointer = 0
  for (let i = 0; i + 1 < edges.rises.length; i++) {
    const rise = edges.rises[i]
    const nextRise = edges.rises[i + 1]
    while (fallPointer < edges.falls.length && edges.falls[fallPointer] <= rise) fallPointer++
    if (fallPointer < edges.falls.length && edges.falls[fallPointer] < nextRise) {
      const period = nextRise - rise
      const highTime = edges.falls[fallPointer] - rise
      if (period > 0 && highTime > 0) {
        periods.push(period)
        duties.push(clamp(highTime / period, 0, 1))
      }
    }
  }

  let frequency = 0
  let positiveDuty = 0
  let frequencySource: 'edges' | 'fft' = 'edges'
  let dutyStdPct = 0
  let periodJitterPct = 0

  if (periods.length > 0) {
    const sortedPeriods = Float64Array.from(periods).sort()
    const medianPeriod = percentileOfSorted(sortedPeriods, 0.5)
    frequency = 1 / medianPeriod
    const meanPeriod = periods.reduce((sum, value) => sum + value, 0) / periods.length
    const periodStd = Math.sqrt(
      periods.reduce((sum, value) => sum + (value - meanPeriod) ** 2, 0) / periods.length
    )
    periodJitterPct = meanPeriod > 0 ? (periodStd / meanPeriod) * 100 : 0

    const meanDuty = duties.reduce((sum, value) => sum + value, 0) / duties.length
    positiveDuty = meanDuty
    if (duties.length > 1) {
      const dutyStd = Math.sqrt(
        duties.reduce((sum, value) => sum + (value - meanDuty) ** 2, 0) / duties.length
      )
      dutyStdPct = dutyStd * 100
    }
  } else {
    // 边沿不足：退化为频谱估频 + 样本占比估占空比
    const spectrum = computeSpectrum(data, sampleRate)
    const fundamental = spectrum ? findFundamental(spectrum) : null
    if (fundamental && fundamental.amplitude > 0) {
      frequency = fundamental.frequency
      frequencySource = 'fft'
    } else {
      return { ok: false, error: '无法检测到方波边沿或周期分量' }
    }
    positiveDuty = edges.highSamples / data.length
  }

  if (!(frequency > 0) || !isFinite(frequency)) {
    return { ok: false, error: '频率估计失败' }
  }

  positiveDuty = clamp(positiveDuty, 0, 1)
  const negativeDuty = 1 - positiveDuty
  const period = 1 / frequency
  const mean = meanOf(data)
  const rms = rmsOf(data)
  const acRms = stdOf(data, mean)

  // 理想方波重建 R²
  let reconstructionR2 = NaN
  if (edges.rises.length > 0) {
    const phaseStart = edges.rises[0]
    let sse = 0
    let sst = 0
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate
      let phase = ((t - phaseStart) / period) % 1
      if (phase < 0) phase += 1
      const predicted = phase < positiveDuty ? high : low
      const residual = data[i] - predicted
      const deviation = data[i] - mean
      sse += residual * residual
      sst += deviation * deviation
    }
    reconstructionR2 = sst > 1e-18 ? 1 - sse / sst : 0
  }

  const timeSeries = buildSquareTimeSeries(
    data,
    sampleRate,
    frequency,
    positiveDuty,
    low,
    high,
    edges.rises.length > 0 ? edges.rises[0] : null
  )
  const histogram = computeHistogram(data, 40)

  return {
    ok: true,
    ...meta,
    lowLevel: low,
    highLevel: high,
    amplitude,
    midpoint,
    mean,
    rms,
    acRms,
    frequency,
    period,
    positiveDuty,
    negativeDuty,
    dutyStdPct,
    riseCount: edges.rises.length,
    fallCount: edges.falls.length,
    periodJitterPct,
    reconstructionR2,
    frequencySource,
    timeSeries,
    histogram
  }
}

function buildStableTimeSeries(data: Float64Array, sampleRate: number, mean: number): StableTimeSeries {
  const stride = Math.max(1, Math.ceil(data.length / 1500))
  const count = Math.max(1, Math.ceil(data.length / stride))
  const time = new Float64Array(count)
  const values = new Float64Array(count)
  const meanLine = new Float64Array(count)

  for (let i = 0; i < count; i++) {
    const index = Math.min(data.length - 1, i * stride)
    time[i] = index / sampleRate
    values[i] = data[index]
    meanLine[i] = mean
  }

  return { time, values, meanLine }
}

function buildDistribution(data: Float64Array, mean: number, std: number): StableDistribution {
  const histogram = computeHistogram(data, 48)
  const counts = histogram.counts
  const gaussian = new Float64Array(counts.length)
  if (counts.length < 2 || !(std > 0) || !isFinite(std)) {
    return { ...histogram, gaussian }
  }

  const binWidth = histogram.binCenters[1] - histogram.binCenters[0]
  const scale = data.length * binWidth
  const denominator = std * Math.sqrt(2 * Math.PI)
  for (let i = 0; i < counts.length; i++) {
    const z = (histogram.binCenters[i] - mean) / std
    gaussian[i] = (scale * Math.exp(-0.5 * z * z)) / denominator
  }

  return { ...histogram, gaussian }
}

/**
 * 稳定值分析
 */
export function analyzeStable(values: Float64Array, sampleRate: number): StableAnalysis | AnalysisError {
  const prepared = prepareWindow(values, sampleRate)
  if (isAnalysisError(prepared)) return prepared
  const { data, meta } = prepared

  const mean = meanOf(data)
  const std = stdOf(data, mean)
  const rms = rmsOf(data)

  const stride = Math.max(1, Math.ceil(data.length / 20000))
  const sample: number[] = []
  for (let i = 0; i < data.length; i += stride) sample.push(data[i])
  sample.sort((a, b) => a - b)
  const sorted = Float64Array.from(sample)

  const median = percentileOfSorted(sorted, 0.5)
  const p05 = percentileOfSorted(sorted, 0.05)
  const p95 = percentileOfSorted(sorted, 0.95)
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < data.length; i++) {
    if (data[i] < min) min = data[i]
    if (data[i] > max) max = data[i]
  }

  const p2p = max - min
  const ci95 = 1.96 * (std / Math.sqrt(data.length))
  const stabilityPct = Math.abs(mean) > 1e-12 ? (std / Math.abs(mean)) * 100 : null

  // 线性漂移
  const n = data.length
  let sumX = 0
  let sumY = 0
  let sumXX = 0
  let sumXY = 0
  for (let i = 0; i < n; i++) {
    const x = i / sampleRate
    sumX += x
    sumY += data[i]
    sumXX += x * x
    sumXY += x * data[i]
  }
  const denominator = n * sumXX - sumX * sumX
  const driftPerSecond = Math.abs(denominator) > 1e-18 ? (n * sumXY - sumX * sumY) / denominator : 0
  const intercept = (sumY - driftPerSecond * sumX) / n
  let sse = 0
  let sst = 0
  for (let i = 0; i < n; i++) {
    const x = i / sampleRate
    const residual = data[i] - (intercept + driftPerSecond * x)
    const deviation = data[i] - mean
    sse += residual * residual
    sst += deviation * deviation
  }
  const driftR2 = sst > 1e-18 ? 1 - sse / sst : sse <= 1e-18 ? 1 : 0
  const totalDrift = driftPerSecond * meta.duration

  const timeSeries = buildStableTimeSeries(data, sampleRate, mean)
  const distribution = buildDistribution(data, mean, std)

  return {
    ok: true,
    ...meta,
    mean,
    median,
    std,
    min,
    max,
    p2p,
    rms,
    p05,
    p95,
    ci95,
    stabilityPct,
    driftPerSecond,
    totalDrift,
    driftR2,
    timeSeries,
    distribution
  }
}
