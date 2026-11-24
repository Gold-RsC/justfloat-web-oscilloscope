/**
 * 采样率跟踪器
 *
 * 串口 / 蓝牙 / WebSocket 的数据到达往往是突发式的：浏览器可能先缓存一段数据，
 * 再一次性交付一大批帧。若直接用“两批数据之间的帧数 / 墙钟时间”估算采样率，
 * 会因为批次边界落在突发前后而大幅波动，进而导致频谱 / 基频计算错误。
 *
 * 这里使用累计帧数 / 累计时间计算平均采样率：
 * - 在首批数据结束时（检测到数据间隔）或稳定 1s 后建立基线，避免把启动时的
 *   积压数据算入速率；
 * - 之后只用基线之后的总帧数 / 总时间，不受单个突发批次边界影响；
 * - 断流超过 5s 后重新建立基线。
 */
export interface SampleRateTrackerOptions {
  /** 连续数据下建立基线前需要稳定采集的时间（毫秒） */
  settleMs?: number
  /** 超过该数据间隔认为一个突发批次结束（毫秒） */
  burstGapMs?: number
  /** 建立基线后至少统计多久才输出速率（毫秒） */
  minMeasureMs?: number
  /** 超过该间隔视为断流，重新开始测量（毫秒） */
  resetGapMs?: number
}

export class SampleRateTracker {
  private readonly settleMs: number
  private readonly burstGapMs: number
  private readonly minMeasureMs: number
  private readonly resetGapMs: number

  private baselineTime: number | null = null
  private baselineFrames = 0
  private cumulativeFrames = 0
  private settleStartTime = 0
  private lastFrameTime = 0
  private currentRate = 0

  constructor(options: SampleRateTrackerOptions = {}) {
    this.settleMs = options.settleMs ?? 1000
    this.burstGapMs = options.burstGapMs ?? 100
    this.minMeasureMs = options.minMeasureMs ?? 2000
    this.resetGapMs = options.resetGapMs ?? 5000
  }

  /** 当前采样率（Hz），尚未完成一次统计时为 0 */
  get rate(): number {
    return this.currentRate
  }

  /**
   * 记录一批帧
   * @param frameCount 本批帧数
   * @param now 当前时间（毫秒，performance.now）
   * @returns 最新采样率；数据不足或正在建立基线时返回 null
   */
  record(frameCount: number, now: number): number | null {
    if (!(frameCount > 0) || !isFinite(now)) return null

    const gap = this.lastFrameTime > 0 ? now - this.lastFrameTime : 0

    // 长时间断流：重新开始测量，保留上一次已知速率用于显示
    if (gap > this.resetGapMs) {
      this.resetMeasurement()
    } else if (this.baselineTime == null && gap > this.burstGapMs && this.cumulativeFrames > 0) {
      // 首批数据（可能是一段积压的突发）结束，以结束时刻作为基线
      this.baselineTime = this.lastFrameTime
      this.baselineFrames = this.cumulativeFrames
    }

    this.cumulativeFrames += frameCount
    this.lastFrameTime = now

    if (this.baselineTime == null) {
      if (this.settleStartTime === 0) this.settleStartTime = now
      if (now - this.settleStartTime >= this.settleMs) {
        // 连续数据：稳定一段时间后建立基线，排除建立基线前的积压数据
        this.baselineTime = now
        this.baselineFrames = this.cumulativeFrames
      }
      return null
    }

    const elapsed = now - this.baselineTime
    if (elapsed < this.minMeasureMs) return null

    const frames = this.cumulativeFrames - this.baselineFrames
    if (frames <= 0) return null

    const rate = frames / (elapsed / 1000)
    if (!isFinite(rate) || rate <= 0) return null

    this.currentRate = rate
    return rate
  }

  /** 清空全部状态（新的采集会话） */
  reset(): void {
    this.baselineTime = null
    this.baselineFrames = 0
    this.cumulativeFrames = 0
    this.settleStartTime = 0
    this.lastFrameTime = 0
    this.currentRate = 0
  }

  /** 断流后重置测量，但保留上一次已知速率用于显示 */
  private resetMeasurement(): void {
    this.baselineTime = null
    this.baselineFrames = 0
    this.cumulativeFrames = 0
    this.settleStartTime = 0
    this.lastFrameTime = 0
  }
}
