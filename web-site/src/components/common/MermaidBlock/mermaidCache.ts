interface CachedItem {
  svg: string
  timestamp: number
  accessCount: number
  isValid: boolean // 标记是否为有效渲染
}

class MermaidCache {
  private cache = new Map<string, CachedItem>()
  private readonly maxSize = 50
  private readonly maxAge = 30 * 60 * 1000 // 30分钟
  private readonly minSvgLength = 50 // 最小有效SVG长度

  private generateHash(content: string): string {
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash &= hash
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * 验证SVG是否有效
   */
  private isValidSvg(svg: string): boolean {
    if (!svg || svg.length < this.minSvgLength) return false
    // 检查是否包含基本的SVG标签
    if (!svg.includes('<svg') || !svg.includes('</svg>')) return false
    // 检查是否有实际内容（不只是空白）
    if (svg.replace(/<[^>]*>/g, '').trim().length === 0) return false
    return true
  }

  get(chart: string): string | null {
    const key = this.generateHash(chart.trim())
    const cached = this.cache.get(key)

    if (!cached) {
      return null
    }

    // 检查是否过期
    if (Date.now() - cached.timestamp > this.maxAge) {
      this.cache.delete(key)
      return null
    }

    // 检查是否有效
    if (!cached.isValid) {
      console.warn('Cached SVG marked as invalid, removing')
      this.cache.delete(key)
      return null
    }

    // 更新访问计数和时间戳（LRU）
    this.cache.delete(key)
    this.cache.set(key, {
      ...cached,
      timestamp: Date.now(),
      accessCount: cached.accessCount + 1
    })

    return cached.svg
  }

  set(chart: string, svg: string): void {
    const key = this.generateHash(chart.trim())

    // 验证SVG
    const isValid = this.isValidSvg(svg)
    if (!isValid) {
      console.warn('Attempting to cache invalid SVG, skipping')
      return
    }

    // LRU淘汰：如果缓存满了，删除访问次数最少的
    if (this.cache.size >= this.maxSize) {
      let minAccessKey: string | null = null
      let minAccessCount = Infinity

      for (const [k, v] of this.cache.entries()) {
        if (v.accessCount < minAccessCount) {
          minAccessCount = v.accessCount
          minAccessKey = k
        }
      }

      if (minAccessKey) {
        this.cache.delete(minAccessKey)
      }
    }

    this.cache.set(key, {
      svg,
      timestamp: Date.now(),
      accessCount: 0,
      isValid: true
    })
  }

  /**
   * 标记某个缓存项为无效（但不删除，用于调试）
   */
  markInvalid(chart: string): void {
    const key = this.generateHash(chart.trim())
    const cached = this.cache.get(key)
    if (cached) {
      cached.isValid = false
    }
  }

  cleanup(): void {
    const now = Date.now()
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.maxAge) {
        this.cache.delete(key)
      }
    }
  }

  clear(): void {
    this.cache.clear()
  }

  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize
    }
  }
}

export const mermaidCache = new MermaidCache()

setInterval(() => {
  mermaidCache.cleanup()
}, 5 * 60 * 1000)

export default MermaidCache
