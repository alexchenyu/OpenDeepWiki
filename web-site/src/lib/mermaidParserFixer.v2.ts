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
  PARSE_TIMEOUT: 3000,
  MAX_TOKEN_FIX_ATTEMPTS: 25,
  BLOCK_RADIUS: 2
}

// 常见的箭头模式（按长度排序，便于匹配）
const EDGE_ARROW_PATTERNS = [
  '<-->',
  '--|>',
  '*-->',
  'o--o',
  'x--x',
  '-.->',
  '-->',
  '==>',
  '---',
  '--x',
  '--o',
  '->>',
  '<--',
  'x--',
  'o--',
  '->'
]

const QUOTED_ARROW_PATTERNS = [
  ...EDGE_ARROW_PATTERNS,
  '--',
  '-.-',
  '..',
  '...'
]

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

type MermaidParseFn = (code: string) => Promise<boolean>

interface MermaidParseError extends Error {
  hash?: {
    token?: string
    text?: string
    line?: number
    loc?: {
      first_line?: number
      first_column?: number
      last_line?: number
      last_column?: number
    }
  }
}

interface ErrorLocation {
  firstLine: number
  firstColumn: number
  lastLine: number
  lastColumn: number
}

interface ErrorContext {
  line: number | null
  token: string
  text: string
  message: string
  loc?: ErrorLocation
}

/**
 * 将同一行中的多条语句拆分为多行，避免 [*] 或 note 与其他语句同行
 */
function separateInlineStatements(code: string): string {
  return code
    .split('\n')
    .map(line => {
      if (!line.includes('[*]') && !/note\s+(left|right|top|bottom|over)/i.test(line)) {
        return line
      }

      const indent = line.match(/^\s*/)?.[0] ?? ''
      let updated = line

      updated = updated.replace(
        /\s{2,}(\[\*\]\s*(?:-->|<--))/g,
        (_, statement: string) => `\n${indent}${statement.trim()}`
      )

      updated = updated.replace(
        /\s{2,}(note\s+(?:left|right|top|bottom|over)[^\n]*)/gi,
        (_, note: string) => `\n${indent}${note.trim()}`
      )

      return updated
    })
    .join('\n')
}

/**
 * flowchart/graph 模式下，将无效的 `: 标签` 链路转换成合法的 `|标签|`
 */
function normalizeEdgeLabels(code: string): string {
  const lines = code.split('\n')
  const firstMeaningfulLine = lines.find(line => {
    const trimmed = line.trim()
    return trimmed.length > 0 && !trimmed.startsWith('%%')
  })

  if (!firstMeaningfulLine) {
    return code
  }

  const header = firstMeaningfulLine.trim().toLowerCase()

  // 仅在 flowchart/graph 图类型下转换，避免影响 sequence/state diagram
  if (!header.startsWith('graph') && !header.startsWith('flowchart')) {
    return code
  }

  const arrows = [...EDGE_ARROW_PATTERNS].sort((a, b) => b.length - a.length)

  const normalizedLines = lines.map(line => {
    if (!line.includes(':')) {
      return line
    }

    if (/note\s+(left|right|top|bottom|over)\s*:/.test(line)) {
      return line
    }

    if (line.includes('|')) {
      // 已包含合法标签
      return line
    }

    for (const arrow of arrows) {
      const arrowIndex = line.indexOf(arrow)
      if (arrowIndex === -1) {
        continue
      }

      const colonIndex = line.indexOf(':', arrowIndex + arrow.length)
      if (colonIndex === -1) {
        continue
      }

      const label = line.slice(colonIndex + 1).trim()
      if (label.length === 0) {
        return line.slice(0, colonIndex).trimEnd()
      }

      const prefix = line.slice(0, arrowIndex)
      const targetFragment = line.slice(arrowIndex + arrow.length, colonIndex).trim()
      const sanitizedLabel = label.replace(/\|/g, '\\|')

      return `${prefix}${arrow}|${sanitizedLabel}|${targetFragment.length > 0 ? ` ${targetFragment}` : ''}`
    }

    return line
  })

  return normalizedLines.join('\n')
}

/**
 * 提取节点 ID，供 note 修复使用
 */
function extractNodeId(fragment: string): string | null {
  const cleaned = fragment.trim()
  if (!cleaned) {
    return null
  }

  if (cleaned.startsWith('[*]')) {
    return '[*]'
  }

  const bracketIndex = cleaned.indexOf('[')
  if (bracketIndex > 0) {
    return cleaned.slice(0, bracketIndex).trim()
  }

  const parenIndex = cleaned.indexOf('(')
  if (parenIndex > 0) {
    return cleaned.slice(0, parenIndex).trim()
  }

  const braceIndex = cleaned.indexOf('{')
  if (braceIndex > 0) {
    return cleaned.slice(0, braceIndex).trim()
  }

  const spaceIndex = cleaned.indexOf(' ')
  const candidate = (spaceIndex > 0 ? cleaned.slice(0, spaceIndex) : cleaned)
    .replace(/["']/g, '')

  if (!candidate) {
    return null
  }

  const match = candidate.match(/[-A-Za-z0-9_*]+/)
  return match ? match[0] : null
}

/**
 * 修复缺少目标节点的 note，优先绑定到最近一次使用的节点
 * 如果仍找不到，退化为注释，避免解析错误
 */
function fixDanglingNotes(code: string): string {
  const lines = code.split('\n')
  let lastNodeId: string | null = null

  const arrows = [...EDGE_ARROW_PATTERNS].sort((a, b) => b.length - a.length)

  const fixedLines = lines.map(line => {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      return line
    }

    const noteMatch = trimmed.match(/^note\s+(left|right|top|bottom|over)(?:\s+of\s+([^\s:]+))?\s*:\s*(.*)$/i)
    if (noteMatch) {
      const indent = line.match(/^\s*/)?.[0] ?? ''
      const position = noteMatch[1]
      const target = noteMatch[2]
      const content = noteMatch[3]

      if (target) {
        lastNodeId = extractNodeId(target) ?? lastNodeId
        return line
      }

      if (lastNodeId && lastNodeId !== '[*]') {
        return `${indent}note ${position} of ${lastNodeId}: ${content}`
      }

      // 无法定位节点时，转为注释避免解析失败
      return `${indent}%% ${trimmed}`
    }

    const nodeDefMatch = trimmed.match(/^([A-Za-z0-9_]+)\s*(?:\[|\(|\{)/)
    if (nodeDefMatch) {
      lastNodeId = nodeDefMatch[1]
      return line
    }

    const stateAliasMatch = trimmed.match(/^state\s+"[^"]+"\s+as\s+([A-Za-z0-9_]+)/i)
    if (stateAliasMatch) {
      lastNodeId = stateAliasMatch[1]
      return line
    }

    const subgraphMatch = trimmed.match(/^subgraph\s+([A-Za-z0-9_]+)/i)
    if (subgraphMatch) {
      lastNodeId = subgraphMatch[1]
      return line
    }

    for (const arrow of arrows) {
      const arrowIndex = trimmed.indexOf(arrow)
      if (arrowIndex === -1) {
        continue
      }

      const targetFragment = trimmed.slice(arrowIndex + arrow.length)
      const candidate = extractNodeId(targetFragment)

      if (candidate && candidate !== '[*]') {
        lastNodeId = candidate
        break
      }

      const sourceCandidate = extractNodeId(trimmed.slice(0, arrowIndex))
      if (sourceCandidate && sourceCandidate !== '[*]') {
        lastNodeId = sourceCandidate
        break
      }
    }

    return line
  })

  return fixedLines.join('\n')
}

/**
 * 将被错误加上引号的箭头符号还原
 */
function unquoteStandaloneArrows(code: string): string {
  const pattern = new RegExp(
    `(['"])\\s*(${QUOTED_ARROW_PATTERNS.map(escapeRegExp).join('|')})\\s*\\1`,
    'g'
  )
  return code.replace(pattern, (_match, _quote, arrow: string) => arrow)
}

/**
 * 阶段0：通用预处理（与错误无关的清理）
 */
function universalPreprocess(code: string): string {
  let cleaned = code
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

  cleaned = separateInlineStatements(cleaned)
  cleaned = normalizeEdgeLabels(cleaned)
  cleaned = fixDanglingNotes(cleaned)
  cleaned = unquoteStandaloneArrows(cleaned)

  return cleaned.trim()
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

interface ParseResult {
  success: boolean
  error?: MermaidParseError
}

function tryParseMermaid(code: string, parseFn: MermaidParseFn): Promise<ParseResult> {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      resolve({
        success: false,
        error: Object.assign(new Error(`Parse timeout after ${CONFIG.PARSE_TIMEOUT}ms`), { name: 'MermaidParseTimeout' }) as MermaidParseError
      })
    }, CONFIG.PARSE_TIMEOUT)

    parseFn(code)
      .then(() => {
        clearTimeout(timer)
        resolve({ success: true })
      })
      .catch(error => {
        clearTimeout(timer)
        resolve({ success: false, error: error as MermaidParseError })
      })
  })
}

function deriveErrorContext(error: unknown): ErrorContext {
  const err = error as MermaidParseError | undefined
  const message = err?.message ?? (typeof error === 'string' ? error : 'Unknown parse error')
  const hash = err?.hash
  const token = hash?.token ?? 'UNKNOWN'
  const text = hash?.text ?? ''

  let line = hash?.line ?? null
  const locRaw = hash?.loc
  let loc: ErrorLocation | undefined

  if (!line && locRaw?.first_line) {
    line = locRaw.first_line
  }

  if (!line) {
    const match = message.match(/line\s+(\d+)/i)
    if (match) {
      line = Number.parseInt(match[1], 10)
    }
  }

  if (locRaw) {
    loc = {
      firstLine: locRaw.first_line ?? line ?? 1,
      firstColumn: locRaw.first_column ?? 1,
      lastLine: locRaw.last_line ?? locRaw.first_line ?? line ?? 1,
      lastColumn: locRaw.last_column ?? (locRaw.first_column ?? 1) + (text.length > 0 ? text.length : 1)
    }
  } else if (line) {
    const length = text.length > 0 ? text.length : 1
    loc = {
      firstLine: line,
      firstColumn: 1,
      lastLine: line,
      lastColumn: 1 + length
    }
  }

  return {
    line,
    token,
    text,
    message,
    loc
  }
}

interface FixActionResult {
  code: string
  changed: boolean
  description: string
}

function clampLineIndex(line: number, totalLines: number): number {
  if (Number.isNaN(line)) return totalLines - 1
  return Math.min(Math.max(line - 1, 0), Math.max(totalLines - 1, 0))
}

function findFallbackLineIndex(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().length > 0) {
      return i
    }
  }
  return Math.max(lines.length - 1, 0)
}

function applyTokenDrivenFix(
  code: string,
  context: ErrorContext,
  failureStats: Map<number, number>
): FixActionResult {
  const lines = code.split('\n')
  if (lines.length === 0) {
    return { code, changed: false, description: 'No content to fix' }
  }

  const targetLineNumber = context.line && context.line >= 1 && context.line <= lines.length
    ? context.line
    : findFallbackLineIndex(lines) + 1
  const lineIndex = clampLineIndex(targetLineNumber, lines.length)
  const originalLine = lines[lineIndex] ?? ''
  const sanitizedLine = originalLine.replace(/%%.*/, '').trim()
  const failureCount = failureStats.get(targetLineNumber) ?? 0

  const actions: Array<() => FixActionResult> = []

  if (context.loc) {
    actions.push(() => removeContextRange(code, context))
  }

  const isNoteLine = /^note\s+/i.test(sanitizedLine) || /\snote\s/i.test(sanitizedLine)
  if (isNoteLine) {
    actions.push(() => commentOutLine(code, targetLineNumber, true))
  }

  if (failureCount >= 1 && !isNoteLine) {
    actions.push(() => commentOutLine(code, targetLineNumber, false))
  }

  if (failureCount >= 2) {
    actions.push(() => removeBlockAroundLine(code, targetLineNumber))
  }

  actions.push(() => removeEntireLine(code, targetLineNumber))
  actions.push(() => trimTrailingContent(code))

  for (const action of actions) {
    const result = action()
    if (result.changed) {
      failureStats.set(targetLineNumber, failureCount + 1)
      return result
    }
  }

  failureStats.set(targetLineNumber, failureCount + 1)
  return {
    code,
    changed: false,
    description: 'Unable to adjust diagram with available strategies'
  }
}

function removeContextRange(code: string, context: ErrorContext): FixActionResult {
  if (!context.loc) {
    return { code, changed: false, description: 'No location info provided' }
  }

  const lines = code.split('\n')
  const startLineIndex = clampLineIndex(context.loc.firstLine, lines.length)
  const endLineIndex = clampLineIndex(context.loc.lastLine, lines.length)

  if (startLineIndex > endLineIndex) {
    return { code, changed: false, description: 'Invalid location range' }
  }

  if (startLineIndex === endLineIndex) {
    const line = lines[startLineIndex] ?? ''
    const startColumn = Math.max(context.loc.firstColumn - 1, 0)
    const endColumn = Math.max(Math.max(context.loc.lastColumn - 1, startColumn + 1), startColumn + 1)

    const updatedLine = line.slice(0, startColumn) + line.slice(endColumn)

    if (updatedLine === line) {
      return { code, changed: false, description: 'Token removal had no effect' }
    }

    if (updatedLine.trim().length === 0) {
      lines.splice(startLineIndex, 1)
    } else {
      lines[startLineIndex] = updatedLine
    }
  } else {
    lines.splice(startLineIndex, endLineIndex - startLineIndex + 1)
  }

  const updatedCode = lines.join('\n')
  return {
    code: updatedCode,
    changed: updatedCode !== code,
    description: `Removed invalid token "${context.text || context.token}" near line ${context.loc.firstLine}`
  }
}

function commentOutLine(code: string, lineNumber: number, isNote: boolean): FixActionResult {
  const lines = code.split('\n')
  if (lines.length === 0) {
    return { code, changed: false, description: 'No lines to comment' }
  }

  const index = clampLineIndex(lineNumber, lines.length)
  const line = lines[index] ?? ''
  const trimmed = line.trim()

  if (trimmed.length === 0 || trimmed.startsWith('%%')) {
    return { code, changed: false, description: 'Line already commented or empty' }
  }

  const indentation = line.match(/^\s*/)?.[0] ?? ''
  lines[index] = `${indentation}%% ${trimmed}`

  const updatedCode = lines.join('\n')
  return {
    code: updatedCode,
    changed: updatedCode !== code,
    description: isNote
      ? `Commented invalid note at line ${lineNumber}`
      : `Commented problematic line ${lineNumber}`
  }
}

function removeBlockAroundLine(code: string, lineNumber: number): FixActionResult {
  const lines = code.split('\n')
  if (lines.length <= 1) {
    return { code, changed: false, description: 'Cannot remove block from minimal diagram' }
  }

  const index = clampLineIndex(lineNumber, lines.length)
  const startIndex = Math.max(index - CONFIG.BLOCK_RADIUS, 1) // 保留第一行（通常是图类型声明）
  const endIndex = Math.min(index + CONFIG.BLOCK_RADIUS, lines.length - 1)
  const removeCount = Math.max(endIndex - startIndex + 1, 0)

  if (removeCount <= 0) {
    return { code, changed: false, description: 'No block to remove' }
  }

  lines.splice(startIndex, removeCount)
  const updatedCode = lines.join('\n')

  return {
    code: updatedCode,
    changed: updatedCode !== code,
    description: `Removed block around line ${lineNumber} after repeated failures`
  }
}

function removeEntireLine(code: string, lineNumber: number): FixActionResult {
  const lines = code.split('\n')
  if (lines.length <= 1) {
    return { code, changed: false, description: 'Cannot remove final line' }
  }

  const index = clampLineIndex(lineNumber, lines.length)
  lines.splice(index, 1)

  const updatedCode = lines.join('\n')
  return {
    code: updatedCode,
    changed: updatedCode !== code,
    description: `Removed offending line ${lineNumber}`
  }
}

function trimTrailingContent(code: string): FixActionResult {
  const lines = code.split('\n')
  if (lines.length <= 1) {
    return { code, changed: false, description: 'No trailing content to trim' }
  }

  for (let i = lines.length - 1; i > 0; i--) {
    if (lines[i].trim().length === 0) {
      lines.splice(i, 1)
      const updatedAfterBlank = lines.join('\n')
      return {
        code: updatedAfterBlank,
        changed: updatedAfterBlank !== code,
        description: 'Removed trailing empty line'
      }
    }

    lines.splice(i, 1)
    const updatedCode = lines.join('\n')
    return {
      code: updatedCode,
      changed: updatedCode !== code,
      description: 'Trimmed trailing content after unresolved error'
    }
  }

  return { code, changed: false, description: 'No trailing content trimmed' }
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
  parseFn: MermaidParseFn,
  maxAttempts: number = CONFIG.MAX_TOKEN_FIX_ATTEMPTS
): Promise<FixResult> {
  const attempts: Array<{ error: string; fix: string }> = []

  // 验证输入，超长/超行数时提前裁剪
  const validation = validateInput(code)
  if (!validation.valid) {
    return {
      code: minimizeChart(code),
      fixed: false,
      attempts: [{ error: validation.error || 'Invalid input', fix: 'Minimized to basic chart' }]
    }
  }

  const baseCode = validation.cleaned ?? code
  if (validation.cleaned && validation.cleaned !== code) {
    attempts.push({
      error: validation.error || 'Input exceeded safety limits',
      fix: 'Trimmed diagram to safe length'
    })
  }

  let currentCode = universalPreprocess(baseCode)
  if (currentCode !== baseCode) {
    attempts.push({
      error: 'Preprocessing',
      fix: 'Applied universal preprocessing'
    })
  }

  let changesMade = currentCode !== code || baseCode !== code
  let parseResult = await tryParseMermaid(currentCode, parseFn)

  if (parseResult.success) {
    return {
      code: currentCode,
      fixed: changesMade,
      attempts
    }
  }

  const failureStats = new Map<number, number>()
  let iterations = 0

  while (!parseResult.success && parseResult.error && iterations < maxAttempts) {
    const context = deriveErrorContext(parseResult.error)
    const fixResult = applyTokenDrivenFix(currentCode, context, failureStats)

    if (!fixResult.changed) {
      break
    }

    changesMade = true
    attempts.push({
      error: context.message,
      fix: fixResult.description
    })

    currentCode = fixResult.code
    iterations += 1
    parseResult = await tryParseMermaid(currentCode, parseFn)

    if (parseResult.success) {
      return {
        code: currentCode,
        fixed: true,
        attempts
      }
    }
  }

  // 尝试提取核心结构
  const coreStructure = extractCoreStructure(currentCode)
  const coreResult = await tryParseMermaid(coreStructure, parseFn)
  if (coreResult.success) {
    attempts.push({
      error: parseResult.error?.message || 'Parse still failing after token cleanup',
      fix: 'Extracted core structure'
    })
    return {
      code: coreStructure,
      fixed: true,
      attempts
    }
  }

  // 最终兜底：极简图
  const minimized = minimizeChart(currentCode)
  attempts.push({
    error: parseResult.error?.message || 'All auto-fixes exhausted',
    fix: 'Minimized to simplest valid chart'
  })

  return {
    code: minimized,
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
