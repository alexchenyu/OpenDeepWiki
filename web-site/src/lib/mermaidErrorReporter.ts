/**
 * Mermaid 错误报告和监控系统
 *
 * 收集、分析和报告 Mermaid 渲染错误
 */

interface ErrorReport {
  id: string
  timestamp: Date
  chartHash: string
  errorType: string
  errorMessage: string
  originalCode: string
  fixedCode?: string
  fixAttempts: Array<{ error: string; fix: string }>
  stage: 'parse' | 'render' | 'fix' | 'cache'
  wasFixed: boolean
  renderTime?: number
}

interface MermaidDebugTools {
  reporter: MermaidErrorReporter
  getStats: () => ReturnType<MermaidErrorReporter['getStatistics']>
  getErrors: () => ErrorReport[]
  export: () => void
  health: () => number
}

declare global {
  interface Window {
    __mermaidDebug?: MermaidDebugTools
  }
}

class MermaidErrorReporter {
  private errors: ErrorReport[] = []
  private readonly maxErrors = 100
  private reportingEnabled = true

  /**
   * 记录错误
   */
  report(error: Omit<ErrorReport, 'id' | 'timestamp'>): void {
    if (!this.reportingEnabled) return

    const report: ErrorReport = {
      id: this.generateId(),
      timestamp: new Date(),
      ...error
    }

    this.errors.push(report)

    // 限制错误数量
    if (this.errors.length > this.maxErrors) {
      this.errors.shift()
    }

    // 在开发环境打印详细信息
    if (process.env.NODE_ENV === 'development') {
      console.group(`[Mermaid Error] ${error.errorType}`)
      console.log('Stage:', error.stage)
      console.log('Message:', error.errorMessage)
      console.log('Fixed:', error.wasFixed)
      if (error.fixAttempts.length > 0) {
        console.table(error.fixAttempts)
      }
      console.groupEnd()
    }

    // 严重错误（修复失败）时的特殊处理
    if (!error.wasFixed && this.isCriticalError(error)) {
      this.handleCriticalError(report)
    }
  }

  /**
   * 判断是否为严重错误
   */
  private isCriticalError(error: Omit<ErrorReport, 'id' | 'timestamp'>): boolean {
    // 经过所有修复阶段仍然失败
    return error.fixAttempts.length >= 5 && !error.wasFixed
  }

  /**
   * 处理严重错误
   */
  private handleCriticalError(report: ErrorReport): void {
    console.error('[Mermaid Critical Error]', {
      id: report.id,
      message: report.errorMessage,
      attempts: report.fixAttempts.length
    })

    // 可以在这里集成错误追踪服务（如 Sentry）
    // if (window.Sentry) {
    //   window.Sentry.captureException(new Error(report.errorMessage), {
    //     extra: {
    //       chartHash: report.chartHash,
    //       fixAttempts: report.fixAttempts,
    //       originalCode: report.originalCode.substring(0, 200)
    //     }
    //   })
    // }
  }

  /**
   * 获取错误统计
   */
  getStatistics() {
    const total = this.errors.length

    const byStage = this.errors.reduce((acc, err) => {
      acc[err.stage] = (acc[err.stage] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const byErrorType = this.errors.reduce((acc, err) => {
      acc[err.errorType] = (acc[err.errorType] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const fixedCount = this.errors.filter(e => e.wasFixed).length
    const fixRate = total > 0 ? (fixedCount / total * 100).toFixed(2) : '0'

    const avgRenderTime = this.errors
      .filter(e => e.renderTime !== undefined)
      .reduce((sum, e) => sum + (e.renderTime || 0), 0) / total || 0

    // 找出最常见的错误
    const topErrors = Object.entries(byErrorType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count, percentage: ((count / total) * 100).toFixed(1) }))

    // 找出修复失败最多的错误
    const criticalErrors = this.errors
      .filter(e => !e.wasFixed)
      .slice(-10) // 最近10个
      .map(e => ({
        id: e.id,
        type: e.errorType,
        message: e.errorMessage.substring(0, 100),
        attempts: e.fixAttempts.length
      }))

    return {
      total,
      fixed: fixedCount,
      failed: total - fixedCount,
      fixRate: `${fixRate}%`,
      avgRenderTime: `${avgRenderTime.toFixed(2)}ms`,
      byStage,
      byErrorType,
      topErrors,
      criticalErrors
    }
  }

  /**
   * 获取最近的错误
   */
  getRecentErrors(count: number = 10): ErrorReport[] {
    return this.errors.slice(-count).reverse()
  }

  /**
   * 导出错误报告（用于分析）
   */
  exportErrors(): string {
    const stats = this.getStatistics()
    const report = {
      generatedAt: new Date().toISOString(),
      statistics: stats,
      errors: this.errors.map(e => ({
        ...e,
        originalCode: e.originalCode.substring(0, 200), // 只导出前200字符
        fixedCode: e.fixedCode?.substring(0, 200)
      }))
    }

    return JSON.stringify(report, null, 2)
  }

  /**
   * 清空错误
   */
  clear(): void {
    this.errors = []
  }

  /**
   * 启用/禁用报告
   */
  setEnabled(enabled: boolean): void {
    this.reportingEnabled = enabled
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 检查是否有相似的错误模式
   */
  findSimilarErrors(errorMessage: string, limit: number = 5): ErrorReport[] {
    // 简单的相似度匹配（可以用更复杂的算法）
    const keywords = errorMessage.toLowerCase().split(' ').filter(w => w.length > 3)

    return this.errors
      .filter(e => {
        const eMsg = e.errorMessage.toLowerCase()
        return keywords.some(keyword => eMsg.includes(keyword))
      })
      .slice(-limit)
  }

  /**
   * 获取健康度评分（0-100）
   */
  getHealthScore(): number {
    const stats = this.getStatistics()

    if (stats.total === 0) return 100

    // 基础分：修复率
    const fixScore = parseFloat(stats.fixRate)

    // 惩罚：严重错误数量
    const criticalPenalty = Math.min(stats.criticalErrors.length * 5, 30)

    // 惩罚：渲染时间过长
    const avgTime = parseFloat(stats.avgRenderTime)
    const timePenalty = avgTime > 1000 ? Math.min((avgTime - 1000) / 100, 20) : 0

    const score = Math.max(0, fixScore - criticalPenalty - timePenalty)

    return Math.round(score)
  }
}

// 单例实例
export const mermaidErrorReporter = new MermaidErrorReporter()

// 开发环境：暴露到window对象方便调试
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  window.__mermaidDebug = {
    reporter: mermaidErrorReporter,
    getStats: () => mermaidErrorReporter.getStatistics(),
    getErrors: () => mermaidErrorReporter.getRecentErrors(),
    export: () => {
      const data = mermaidErrorReporter.exportErrors()
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mermaid-errors-${new Date().toISOString()}.json`
      a.click()
      URL.revokeObjectURL(url)
    },
    health: () => mermaidErrorReporter.getHealthScore()
  }

  console.log('💡 Mermaid调试工具已加载，使用 window.__mermaidDebug 访问')
  console.log('   - __mermaidDebug.getStats(): 获取统计信息')
  console.log('   - __mermaidDebug.getErrors(): 查看最近错误')
  console.log('   - __mermaidDebug.export(): 导出错误报告')
  console.log('   - __mermaidDebug.health(): 查看健康度评分')
}

export default mermaidErrorReporter
