import { ref } from 'vue'
import { SYNC_BYTES } from '@/types'
import type { ProtocolType } from '@/types'

export function useProtocolParser() {
  const channelCount = ref(0)
  const frameCount = ref(0)
  const currentProtocol = ref<ProtocolType>('justfloat')

  // JustFloat 内部状态
  const INITIAL_JUSTFLOAT_CAPACITY = 8192
  const MAX_JUSTFLOAT_RESIDUAL = 4 * 1024 * 1024
  let justfloatBuffer = new Uint8Array(INITIAL_JUSTFLOAT_CAPACITY)
  let justfloatLength = 0
  let expectedChannelCount = 0 // 记录预期的通道数，用于检测异常

  // FireWater 内部状态
  let firewaterBuffer = ''
  let textDecoder = new TextDecoder()

  let onFrameCallback: ((values: number[]) => void) | null = null
  let onFramesBatchCallback: ((frames: number[][]) => void) | null = null

  // 动态批量机制：根据缓冲区使用量智能调整批量大小
  let TARGET_BATCH_INTERVAL_MS = 16  // 默认 16ms（约 60fps）
  let lastBatchTime = 0
  let IDLE_FLUSH_DELAY = 16  // 空闲刷新延迟
  let framesBatch: number[][] = []
  let idleFlushTimer: ReturnType<typeof setTimeout> | null = null

  // 缓冲区使用率（由外部设置）
  let bufferUsageRatio = 0

  // 动态调整批量策略（根据缓冲区使用量）
  const adjustBatchStrategy = () => {
    if (bufferUsageRatio > 0.8) {
      // 缓冲区使用超过80%，大幅降低刷新频率
      TARGET_BATCH_INTERVAL_MS = 100  // 10fps
      IDLE_FLUSH_DELAY = 100
    } else if (bufferUsageRatio > 0.5) {
      // 缓冲区使用超过50%，降低刷新频率
      TARGET_BATCH_INTERVAL_MS = 50  // 20fps
      IDLE_FLUSH_DELAY = 50
    } else if (bufferUsageRatio > 0.3) {
      // 缓冲区使用超过30%，适度降低刷新频率
      TARGET_BATCH_INTERVAL_MS = 33  // 30fps
      IDLE_FLUSH_DELAY = 33
    } else {
      // 缓冲区使用较少，保持高刷新率
      TARGET_BATCH_INTERVAL_MS = 16  // 60fps
      IDLE_FLUSH_DELAY = 16
    }
  }

  // 设置缓冲区使用率（供外部调用）
  const setBufferUsage = (usage: number) => {
    bufferUsageRatio = Math.max(0, Math.min(1, usage)) // 限制在 0-1 范围
    adjustBatchStrategy()
  }

  // ==================== 批量帧处理 ====================

  const flushBatch = () => {
    if (idleFlushTimer) {
      clearTimeout(idleFlushTimer)
      idleFlushTimer = null
    }
    if (framesBatch.length === 0) return

    const batch = framesBatch
    framesBatch = []
    lastBatchTime = performance.now()  // 更新最后发送时间

    if (onFramesBatchCallback) {
      onFramesBatchCallback(batch)
    } else if (onFrameCallback) {
      // 降级：逐帧回调
      for (const values of batch) {
        onFrameCallback(values)
      }
    }
  }

  const scheduleIdleFlush = () => {
    if (idleFlushTimer) {
      clearTimeout(idleFlushTimer)
    }
    idleFlushTimer = setTimeout(flushBatch, IDLE_FLUSH_DELAY)
  }

  const addFrameToBatch = (values: number[]) => {
    framesBatch.push(values)
    frameCount.value++

    // 只在通道数增加时更新（避免因误解析导致通道数突然减少）
    if (values.length > channelCount.value) {
      channelCount.value = values.length
    } else if (channelCount.value === 0) {
      channelCount.value = values.length
    }

    // 基于时间的批量刷新：根据动态调整的间隔发送
    const now = performance.now()
    if (now - lastBatchTime >= TARGET_BATCH_INTERVAL_MS) {
      flushBatch()
      lastBatchTime = now
    } else {
      scheduleIdleFlush()
    }
  }

  // ==================== JustFloat 协议解析 ====================

  // 检查是否在有效位置（避免在数据中间误判同步字）
  // payload 长度应该是 4 的倍数，且应该合理（至少要有一些数据）
  const isValidPayload = (payloadStart: number, payloadEnd: number): boolean => {
    const payloadLength = payloadEnd - payloadStart

    // payload 必须是 4 的倍数（float32）
    if (payloadLength % 4 !== 0) return false

    // payload 不能为空
    if (payloadLength === 0) return false

    // 至少要有一个完整的浮点数
    if (payloadLength < 4) return false

    // payload 长度应该合理（不超过 64 个通道，即 256 字节）
    // 这可以根据实际需求调整，但不应过大以避免误判
    if (payloadLength > 256) return false

    return true
  }

  const ensureJustfloatCapacity = (required: number) => {
    if (required <= justfloatBuffer.length) return
    let capacity = justfloatBuffer.length
    while (capacity < required) capacity *= 2
    const next = new Uint8Array(capacity)
    next.set(justfloatBuffer.subarray(0, justfloatLength))
    justfloatBuffer = next
  }

  // 直接在缓冲区上读取 little-endian float32，避免逐字节复制
  const parseFloats = (payloadStart: number, payloadEnd: number): number[] => {
    const count = (payloadEnd - payloadStart) >> 2
    const view = new DataView(
      justfloatBuffer.buffer,
      justfloatBuffer.byteOffset + payloadStart,
      count * 4
    )
    const floats = new Array<number>(count)
    for (let i = 0; i < count; i++) {
      floats[i] = view.getFloat32(i * 4, true)
    }
    return floats
  }

  // 在当前缓冲区中查找同步字，返回同步字起始位置
  const findSyncBytes = (startIndex: number, endIndex: number): number => {
    for (let i = startIndex + 3; i < endIndex; i++) {
      if (justfloatBuffer[i] === SYNC_BYTES[3] &&
          justfloatBuffer[i - 1] === SYNC_BYTES[2] &&
          justfloatBuffer[i - 2] === SYNC_BYTES[1] &&
          justfloatBuffer[i - 3] === SYNC_BYTES[0]) {
        return i - 3
      }
    }
    return -1
  }

  const processJustFloat = (data: Uint8Array) => {
    if (data.length === 0) return

    // 追加到连续缓冲区；大数据块也能完整解析，不会在解析前被截断
    ensureJustfloatCapacity(justfloatLength + data.length)
    justfloatBuffer.set(data, justfloatLength)
    justfloatLength += data.length

    let previousSync = -1
    let lastCompleteSync = -1
    let searchStart = 0

    while (searchStart < justfloatLength - 3) {
      const sync = findSyncBytes(searchStart, justfloatLength)
      if (sync < 0) break

      if (previousSync >= 0) {
        const payloadStart = previousSync + 4
        const payloadEnd = sync

        if (isValidPayload(payloadStart, payloadEnd)) {
          const values = parseFloats(payloadStart, payloadEnd)
          if (values.length > 0 && (expectedChannelCount === 0 || values.length === expectedChannelCount)) {
            if (expectedChannelCount === 0) {
              expectedChannelCount = values.length
            }
            addFrameToBatch(values)
            lastCompleteSync = sync
          }
        }
      }

      previousSync = sync
      searchStart = sync + 4
    }

    // 只保留最后一个完整帧的同步字及之后的数据
    if (lastCompleteSync >= 0) {
      const remaining = justfloatLength - lastCompleteSync
      if (remaining > 0) {
        justfloatBuffer.copyWithin(0, lastCompleteSync, justfloatLength)
      }
      justfloatLength = remaining
    }

    // 仅在残留大量无法解析的数据时限制内存（已完成解析的数据不受影响）
    if (justfloatLength > MAX_JUSTFLOAT_RESIDUAL) {
      const keep = 4096
      const drop = justfloatLength - keep
      const alignedDrop = Math.floor(drop / 4) * 4
      justfloatBuffer.copyWithin(0, alignedDrop, justfloatLength)
      justfloatLength -= alignedDrop
    }
  }

  // ==================== FireWater 协议解析 ====================
  // 格式: "<any>:ch0,ch1,ch2,...,chN\n" 或 "ch0,ch1,...,chN\n"

  const processFireWater = (data: Uint8Array) => {
    // 将新数据追加到缓冲区，先处理所有完整行，再限制未完成行的长度
    const text = firewaterBuffer + textDecoder.decode(data, { stream: true })
    const lines = text.split(/\r\n|\n\r|\r|\n/)
    firewaterBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const values = parseFireWaterLine(trimmed)
      if (values && values.length > 0) {
        addFrameToBatch(values)
      }
    }

    // 仅限制未完成行的长度，避免异常数据导致内存增长
    if (firewaterBuffer.length > 100000) {
      firewaterBuffer = firewaterBuffer.slice(-50000)
    }
  }

  // 解析 FireWater 行格式
  const parseFireWaterLine = (line: string): number[] | null => {
    // 跳过 image 前缀
    if (line.toLowerCase().startsWith('image')) {
      return null
    }

    let dataStr = line

    // 如果有冒号，取冒号后面的部分
    const colonIndex = line.indexOf(':')
    if (colonIndex !== -1) {
      dataStr = line.substring(colonIndex + 1)
    }

    // 按逗号分割并解析数字
    const parts = dataStr.split(',')
    const values: number[] = []

    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed === '') continue

      const num = parseFloat(trimmed)
      if (isFinite(num)) {
        values.push(num)
      } else {
        // 如果解析失败，整行数据无效
        return null
      }
    }

    return values.length > 0 ? values : null
  }

  // ==================== 公共接口 ====================

  const processData = (data: Uint8Array) => {
    if (currentProtocol.value === 'justfloat') {
      processJustFloat(data)
    } else {
      processFireWater(data)
    }
  }

  const onFrame = (callback: (values: number[]) => void) => {
    onFrameCallback = callback
  }

  const onFramesBatch = (callback: (frames: number[][]) => void) => {
    onFramesBatchCallback = callback
  }

  const setProtocol = (protocol: ProtocolType) => {
    if (currentProtocol.value !== protocol) {
      currentProtocol.value = protocol
      reset()
    }
  }

  const reset = () => {
    // 清理批量缓存
    if (idleFlushTimer) {
      clearTimeout(idleFlushTimer)
      idleFlushTimer = null
    }
    framesBatch = []
    // JustFloat 状态
    justfloatLength = 0
    if (justfloatBuffer.length > 1024 * 1024) {
      justfloatBuffer = new Uint8Array(INITIAL_JUSTFLOAT_CAPACITY)
    }
    expectedChannelCount = 0 // 重置通道数记录
    // FireWater 状态
    firewaterBuffer = ''
    textDecoder = new TextDecoder() // 重新创建以清除内部状态
  }

  const fullReset = () => {
    reset()
    channelCount.value = 0
    frameCount.value = 0
  }

  const setChannelCount = (count: number) => {
    channelCount.value = count
  }

  return {
    channelCount,
    frameCount,
    currentProtocol,
    processData,
    onFrame,
    onFramesBatch,
    setProtocol,
    reset,
    fullReset,
    setChannelCount,
    setBufferUsage
  }
}
