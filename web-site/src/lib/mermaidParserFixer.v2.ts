/**
 * Mermaid Parser Fixer v2.0 - 系统性方法
 *
 * 核心思想：不针对具体错误类型，使用通用的、渐进式的删除和简化策略
 *
 * 设计原则：
 * 1. 不要试图理解每种错误 - 无法穷举所有AI可能产生的错误
 * 2. 基于错误位置进行盲目删除 - 哪里错删哪里
 * 3. 渐进式降级 - 从温和到激进，从保留细节到只保留核心
 * 4. 保证最终一定有可渲染的内容 - 即使是最简单的图表
 */

interface FixResult {
  code: string
  fixed: boolean
  attempts: Array<{
    error: string
    fix: string
  }>
}

// 配置
const CONFIG = {
  MAX_CODE_LENGTH: 50000,
  MAX_LINES: 1000,
  MAX_LINE_LENGTH: 500,
  STAGE1_MAX_ATTEMPTS: 3,    // 阶段1：盲删除
  STAGE2_MAX_ATTEMPTS: 10,   // 阶段2：范围删除
  PARSE_TIMEOUT: 3000
}

/**
 * 阶段0：通用预处理（与错误无关的清理）
 */
function universalPreprocess(code: string): string {
  return code
    // 移除模板变量
    .replace(/\$\{[^}]*\}/g, 'var')
    // 移除长URL
    .replace(/https?:\/\/[^\s)"'\]]{50,}/gi, '')
    // 标准化引号（中文引号 -> 英文引号）
    .replace(/[""]|['']/g, '"')
    // 移除不可见字符
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // 标准化换行符
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // 标准化制表符
    .replace(/\t/g, '    ')
    // 移除行尾空格
    .replace(/[ \t]+$/gm, '')
    // 限制单行长度
    .split('\n')
    .map(line => line.length > CONFIG.MAX_LINE_LENGTH ? line.substring(0, CONFIG.MAX_LINE_LENGTH) : line)
    .join('\n')
    .trim()
}

/**
 * 验证和边界检查
 */
function validateInput(code: string): { valid: boolean; error?: string; cleaned?: string } {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Empty or invalid input' }
  }

  const lines = code.split('\n')

  // 检查总长度
  if (code.length > CONFIG.MAX_CODE_LENGTH) {
    return {
      valid: true,
      cleaned: code.substring(0, CONFIG.MAX_CODE_LENGTH),
      error: 'Code truncated (too long)'
    }
  }

  // 检查行数
  if (lines.length > CONFIG.MAX_LINES) {
    return {
      valid: true,
      cleaned: lines.slice(0, CONFIG.MAX_LINES).join('\n'),
      error: 'Lines truncated (too many)'
    }
  }

  // 检查是否全是注释
  const nonCommentLines = lines.filter(line => {
    const trimmed = line.trim()
    return trimmed.length > 0 && !trimmed.startsWith('%%')
  })

  if (nonCommentLines.length === 0) {
    return { valid: false, error: 'Only comments, no actual diagram' }
  }

  return { valid: true, cleaned: code }
}

/**
 * 阶段1：基于错误行号的盲删除
 * 策略：遇到错误就删除错误所在行，不管是什么错误
 */
function blindLineRemoval(code: string, errorLine: number, attemptNumber: number): string {
  const lines = code.split('\n')

  if (errorLine < 1 || errorLine > lines.length) {
    // 如果错误行号无效，删除最后一行（可能是EOF错误）
    lines.pop()
    return lines.join('\n')
  }

  // 删除错误行
  lines.splice(errorLine - 1, 1)

  return lines.join('\n')
}

/**
 * 阶段2：范围删除（删除错误行周围的内容）
 */
function rangeRemoval(code: string, errorLine: number, attemptNumber: number): string {
  const lines = code.split('\n')

  if (errorLine < 1 || errorLine > lines.length) {
    // 删除最后10行
    return lines.slice(0, -10).join('\n')
  }

  const strategy = attemptNumber % 4

  switch (strategy) {
    case 0:
      // 删除错误行 ±1行
      const start1 = Math.max(0, errorLine - 2)
      const end1 = Math.min(lines.length, errorLine + 1)
      lines.splice(start1, end1 - start1)
      return lines.join('\n')

    case 1:
      // 删除错误行到文档结尾
      return lines.slice(0, errorLine - 1).join('\n')

    case 2:
      // 删除文档开始到错误行
      return lines.slice(errorLine).join('\n')

    case 3:
      // 删除错误行 ±2行
      const start2 = Math.max(0, errorLine - 3)
      const end2 = Math.min(lines.length, errorLine + 2)
      lines.splice(start2, end2 - start2)
      return lines.join('\n')

    default:
      return code
  }
}

/**
 * 阶段3：提取核心结构（只保留基本连接）
 */
function extractCoreStructure(code: string): string {
  const lines = code.split('\n')
  const coreLines: string[] = []

  // 保留图表类型声明
  const firstLine = lines[0]?.trim() || ''
  if (firstLine.match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph)/)) {
    coreLines.push(firstLine)
  } else {
    coreLines.push('graph TD')
  }

  // 提取所有箭头连接（最基本的结构）
  for (const line of lines) {
    const trimmed = line.trim()

    // 匹配基本箭头模式：A --> B, A -> B, A ->> B
    if (/\w+\s*(->>?|-->)\s*\w+/.test(trimmed)) {
      // 简化：只保留节点名和箭头
      const simplified = trimmed.replace(/\w+\s*(->>?|-->)\s*\w+/g, (match) => {
        // 移除所有标签和样式
        return match.replace(/\|[^|]*\|/g, '').replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '')
      })

      if (simplified.trim().length > 0) {
        coreLines.push('    ' + simplified.split(/\s+/).slice(0, 3).join(' '))
      }
    }
  }

  // 如果没有找到任何箭头，创建一个最小的
  if (coreLines.length === 1) {
    coreLines.push('    A --> B')
  }

  return coreLines.join('\n')
}

/**
 * 阶段4：二分法删除
 */
function binaryDeletion(code: string, parseFn: (code: string) => Promise<boolean>): Promise<string> {
  const lines = code.split('\n')
  const firstLine = lines[0]
  const contentLines = lines.slice(1)

  if (contentLines.length <= 2) {
    // 太短了，直接返回最小图表
    return Promise.resolve(`${firstLine}\n    A --> B`)
  }

  const mid = Math.floor(contentLines.length / 2)
  const firstHalf = [firstLine, ...contentLines.slice(0, mid)].join('\n')
  const secondHalf = [firstLine, ...contentLines.slice(mid)].join('\n')

  // 测试上半部分
  return parseFn(firstHalf)
    .then(valid => {
      if (valid) return firstHalf
      // 上半部分不行，测试下半部分
      return parseFn(secondHalf).then(valid2 => {
        if (valid2) return secondHalf
        // 都不行，递归处理上半部分（通常问题在后面）
        if (contentLines.slice(0, mid).length > 2) {
          return binaryDeletion(firstHalf, parseFn)
        }
        return `${firstLine}\n    A --> B`
      })
    })
    .catch(() => {
      // 解析出错，返回最小图表
      return `${firstLine}\n    A --> B`
    })
}

/**
 * 阶段5：最小化简化
 */
function minimizeChart(code: string): string {
  const lines = code.split('\n')
  const firstLine = lines[0]?.trim() || ''

  // 检测图表类型
  if (firstLine.includes('sequenceDiagram')) {
    return 'sequenceDiagram\n    Alice->>Bob: Hello\n    Bob->>Alice: Hi'
  }

  if (firstLine.includes('classDiagram')) {
    return 'classDiagram\n    ClassA <|-- ClassB'
  }

  if (firstLine.includes('stateDiagram')) {
    return 'stateDiagram-v2\n    [*] --> State1\n    State1 --> [*]'
  }

  if (firstLine.includes('erDiagram')) {
    return 'erDiagram\n    CUSTOMER ||--o{ ORDER : places'
  }

  if (firstLine.includes('journey')) {
    return 'journey\n    title User Journey\n    section Visit\n      Go to site: 5: User'
  }

  if (firstLine.includes('gantt')) {
    return 'gantt\n    title Task\n    Task1 :a1, 2024-01-01, 1d'
  }

  if (firstLine.includes('pie')) {
    return 'pie\n    "A" : 50\n    "B" : 50'
  }

  // 默认流程图
  return 'graph TD\n    A[Start] --> B[End]'
}

/**
 * 主修复函数 - 系统性方法
 */
export async function fixMermaidCode(
  code: string,
  parseFn: (code: string) => Promise<boolean>,
  maxAttempts: number = 15
): Promise<FixResult> {
  const attempts: Array<{ error: string; fix: string }> = []

  // 阶段0：验证和预处理
  const validation = validateInput(code)
  if (!validation.valid) {
    return {
      code: minimizeChart(code),
      fixed: false,
      attempts: [{ error: validation.error || 'Invalid input', fix: 'Minimized to basic chart' }]
    }
  }

  let currentCode = universalPreprocess(validation.cleaned || code)

  // 先测试预处理后的代码
  try {
    const isValid = await Promise.race([
      parseFn(currentCode),
      new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error('Parse timeout')), CONFIG.PARSE_TIMEOUT)
      )
    ])

    if (isValid) {
      return {
        code: currentCode,
        fixed: code !== currentCode,
        attempts: code !== currentCode ? [{ error: 'None', fix: 'Universal preprocessing' }] : []
      }
    }
  } catch (error: any) {
    // 继续修复
  }

  // 阶段1：盲删除（基于错误行号）- 3次
  for (let i = 0; i < CONFIG.STAGE1_MAX_ATTEMPTS && attempts.length < maxAttempts; i++) {
    try {
      await parseFn(currentCode)
      // 成功了
      return {
        code: currentCode,
        fixed: true,
        attempts
      }
    } catch (error: any) {
      const errorLine = error.hash?.line || -1
      const previousCode = currentCode
      currentCode = blindLineRemoval(currentCode, errorLine, i)

      if (currentCode === previousCode || currentCode.trim().length < 10) {
        break // 避免无限循环或过度删除
      }

      attempts.push({
        error: error.message || 'Parse error',
        fix: `Blind removal: deleted line ${errorLine} (stage 1, attempt ${i + 1})`
      })
    }
  }

  // 阶段2：范围删除 - 10次
  for (let i = 0; i < CONFIG.STAGE2_MAX_ATTEMPTS && attempts.length < maxAttempts; i++) {
    try {
      await parseFn(currentCode)
      return {
        code: currentCode,
        fixed: true,
        attempts
      }
    } catch (error: any) {
      const errorLine = error.hash?.line || -1
      const previousCode = currentCode
      currentCode = rangeRemoval(currentCode, errorLine, i)

      if (currentCode === previousCode || currentCode.trim().length < 10) {
        break
      }

      attempts.push({
        error: error.message || 'Parse error',
        fix: `Range removal: deleted range around line ${errorLine} (stage 2, attempt ${i + 1})`
      })
    }
  }

  // 阶段3：提取核心结构
  try {
    currentCode = extractCoreStructure(currentCode)
    await parseFn(currentCode)
    attempts.push({
      error: 'Complex structure failed',
      fix: 'Extracted core structure (stage 3)'
    })
    return {
      code: currentCode,
      fixed: true,
      attempts
    }
  } catch (error: any) {
    attempts.push({
      error: error.message || 'Core structure extraction failed',
      fix: 'Proceeding to stage 4'
    })
  }

  // 阶段4：二分法
  try {
    currentCode = await binaryDeletion(currentCode, parseFn)
    await parseFn(currentCode)
    attempts.push({
      error: 'Full content failed',
      fix: 'Binary deletion (stage 4)'
    })
    return {
      code: currentCode,
      fixed: true,
      attempts
    }
  } catch (error: any) {
    attempts.push({
      error: error.message || 'Binary deletion failed',
      fix: 'Proceeding to stage 5'
    })
  }

  // 阶段5：最小化
  currentCode = minimizeChart(currentCode)
  attempts.push({
    error: 'All strategies failed',
    fix: 'Minimized to simplest valid chart (stage 5)'
  })

  return {
    code: currentCode,
    fixed: true,
    attempts
  }
}

/**
 * 预清理函数（导出供组件使用）
 */
export function preCleanMermaidCode(code: string): string {
  return universalPreprocess(code)
}
