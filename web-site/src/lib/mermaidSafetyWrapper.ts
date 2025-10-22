/**
 * Mermaid 安全包装器
 *
 * 提供额外的安全层，防止单个图表失败影响整个页面
 */

// 全局错误追踪
interface ErrorStats {
  totalAttempts: number
  failures: number
  lastFailure?: Date
  consecutiveFailures: number
}

const errorStats: Map<string, ErrorStats> = new Map()

// 并发控制
let activeRenders = 0
const MAX_CONCURRENT_RENDERS = 3
const renderQueue: Array<() => void> = []

// 断路器模式
const CIRCUIT_BREAKER_THRESHOLD = 5 // 连续失败5次后触发断路器
const CIRCUIT_BREAKER_RESET_TIME = 60000 // 1分钟后重置

/**
 * 检查是否应该跳过渲染（断路器）
 */
function shouldSkipRender(chartHash: string): boolean {
  const stats = errorStats.get(chartHash)
  if (!stats) return false

  // 如果连续失败超过阈值
  if (stats.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    // 检查是否到了重置时间
    if (stats.lastFailure) {
      const timeSinceFailure = Date.now() - stats.lastFailure.getTime()
      if (timeSinceFailure < CIRCUIT_BREAKER_RESET_TIME) {
        console.warn(`Circuit breaker open for chart ${chartHash}, skipping render`)
        return true
      } else {
        // 重置断路器
        stats.consecutiveFailures = 0
      }
    }
  }

  return false
}

/**
 * 记录渲染尝试
 */
function recordAttempt(chartHash: string, success: boolean) {
  let stats = errorStats.get(chartHash)
  if (!stats) {
    stats = {
      totalAttempts: 0,
      failures: 0,
      consecutiveFailures: 0
    }
    errorStats.set(chartHash, stats)
  }

  stats.totalAttempts++

  if (success) {
    stats.consecutiveFailures = 0
  } else {
    stats.failures++
    stats.consecutiveFailures++
    stats.lastFailure = new Date()
  }

  // 清理旧数据（只保留最近100个图表的统计）
  if (errorStats.size > 100) {
    const oldestKey = Array.from(errorStats.keys())[0]
    errorStats.delete(oldestKey)
  }
}

/**
 * 并发控制：等待渲染槽位
 */
function waitForRenderSlot(): Promise<void> {
  return new Promise(resolve => {
    if (activeRenders < MAX_CONCURRENT_RENDERS) {
      activeRenders++
      resolve()
    } else {
      renderQueue.push(() => {
        activeRenders++
        resolve()
      })
    }
  })
}

/**
 * 释放渲染槽位
 */
function releaseRenderSlot() {
  activeRenders--
  if (renderQueue.length > 0) {
    const next = renderQueue.shift()
    if (next) next()
  }
}

/**
 * 安全包装的渲染函数
 */
export async function safeRenderMermaid<T>(
  chartHash: string,
  renderFn: () => Promise<T>,
  options: {
    timeout?: number
    onError?: (error: Error) => void
    fallback?: () => T
  } = {}
): Promise<{ success: boolean; result?: T; error?: Error }> {
  const { timeout = 10000, onError, fallback } = options

  // 检查断路器
  if (shouldSkipRender(chartHash)) {
    const error = new Error('Circuit breaker open, too many consecutive failures')
    onError?.(error)
    return {
      success: false,
      error,
      result: fallback?.()
    }
  }

  // 等待渲染槽位
  await waitForRenderSlot()

  try {
    // 使用AbortController实现超时
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      // 创建竞态Promise
      const result = await Promise.race([
        renderFn(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error(`Render timeout after ${timeout}ms`))
          })
        })
      ])

      clearTimeout(timeoutId)
      recordAttempt(chartHash, true)

      return {
        success: true,
        result
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))

    // 记录失败
    recordAttempt(chartHash, false)

    // 调用错误处理器
    onError?.(err)

    console.error(`Mermaid render failed for ${chartHash}:`, err.message)

    return {
      success: false,
      error: err,
      result: fallback?.()
    }
  } finally {
    // 释放渲染槽位
    releaseRenderSlot()
  }
}

/**
 * 获取错误统计
 */
export function getErrorStats() {
  const stats = Array.from(errorStats.entries()).map(([hash, stat]) => ({
    hash,
    ...stat
  }))

  return {
    total: stats.length,
    stats: stats.sort((a, b) => b.failures - a.failures).slice(0, 10), // 返回失败最多的10个
    activeRenders,
    queueLength: renderQueue.length
  }
}

/**
 * 重置错误统计
 */
export function resetErrorStats(chartHash?: string) {
  if (chartHash) {
    errorStats.delete(chartHash)
  } else {
    errorStats.clear()
  }
}

/**
 * 批量渲染保护
 */
export async function safeBatchRender<T>(
  items: Array<{ hash: string; render: () => Promise<T> }>,
  options: {
    batchSize?: number
    delayBetweenBatches?: number
    onProgress?: (current: number, total: number) => void
  } = {}
): Promise<Array<{ hash: string; success: boolean; result?: T; error?: Error }>> {
  const { batchSize = 5, delayBetweenBatches = 100, onProgress } = options
  const results: Array<{ hash: string; success: boolean; result?: T; error?: Error }> = []

  // 分批处理
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)

    // 并发处理当前批次
    const batchResults = await Promise.all(
      batch.map(item =>
        safeRenderMermaid(item.hash, item.render).then(result => ({
          hash: item.hash,
          ...result
        }))
      )
    )

    results.push(...batchResults)

    // 进度回调
    onProgress?.(i + batch.length, items.length)

    // 批次间延迟
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches))
    }
  }

  return results
}

/**
 * 内存保护：限制缓存大小
 */
export function createSafeCache<K, V>(maxSize: number = 50) {
  const cache = new Map<K, V>()
  const accessOrder: K[] = []

  return {
    get(key: K): V | undefined {
      const value = cache.get(key)
      if (value !== undefined) {
        // 更新访问顺序
        const index = accessOrder.indexOf(key)
        if (index > -1) {
          accessOrder.splice(index, 1)
          accessOrder.push(key)
        }
      }
      return value
    },

    set(key: K, value: V): void {
      // 检查是否已存在
      if (cache.has(key)) {
        cache.set(key, value)
        return
      }

      // 检查是否需要淘汰
      if (cache.size >= maxSize) {
        const oldestKey = accessOrder.shift()
        if (oldestKey !== undefined) {
          cache.delete(oldestKey)
        }
      }

      cache.set(key, value)
      accessOrder.push(key)
    },

    has(key: K): boolean {
      return cache.has(key)
    },

    delete(key: K): boolean {
      const index = accessOrder.indexOf(key)
      if (index > -1) {
        accessOrder.splice(index, 1)
      }
      return cache.delete(key)
    },

    clear(): void {
      cache.clear()
      accessOrder.length = 0
    },

    get size(): number {
      return cache.size
    }
  }
}
