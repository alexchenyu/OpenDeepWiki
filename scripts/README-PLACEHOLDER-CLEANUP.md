# 文档占位符和删除线清理方案

## 问题描述

生成的文档中出现以下问题：
1. **删除线问题**：文本被 `<del></del>` 标签包裹，导致前端显示删除线
2. **占位符问题**：文档包含 `（约700字）`、`（约500字）` 等字数占位符

## 根本原因

1. **AI 生成行为**：
   - AI 有时会生成字数占位符，如 `（约700字）`
   - AI 可能使用 `<del>` 或 `~~` 来标记"待删除"或"不确定"的内容
   - 这源于 AI 的训练数据中包含文档修订和编辑标记

2. **后端清理不完善**：
   - 原有的正则表达式过于复杂，匹配失败
   - 清理顺序不当，导致被标签包裹的占位符无法被识别

3. **前端渲染问题**：
   - 使用 `rehypeRaw` 插件会渲染原始 HTML 标签
   - 残留的 `<del>` 标签会显示为删除线

## 解决方案

### 1. 后端清理增强 ✅

**文件**: `src/KoalaWiki/KoalaWarehouse/DocumentQualityValidator.cs`

**改进内容**：
- 简化了占位符正则表达式，去除了复杂的前后缀匹配
- 扩展了占位符模式，覆盖更多变体：
  - 全角和半角括号
  - 带"约"和不带"约"的格式
  - 英文字数占位符
  - TODO 标记
- 优化了清理顺序：
  1. 先移除 `<del>` 和 `~~` 标签（保留内容）
  2. 再清理占位符（此时占位符已暴露）
  3. 最后清理空白字符

**测试结果**：所有测试用例通过 ✅
```bash
python3 scripts/test-placeholder-removal.py
# 所有格式的占位符都能正确清理
```

### 2. AI Prompt 更新 ✅

**文件**: `src/KoalaWiki/Prompts/Warehouse/GenerateDocs.md`

**改进内容**：
- 在 "ABSOLUTELY FORBIDDEN" 部分添加了详细的禁止规则
- 明确列出了所有禁止的字数占位符格式
- 添加了具体示例：
  - ❌ "（约700字）", "（约500字）", "（约600字）"
  - ❌ "（700字）", "（500字）"
  - ❌ "(about 700 words)", "(approx. 600 words)"
  - ❌ `<del>any content</del>`
  - ❌ `~~strikethrough text~~`
- 在质量验证清单和失败条件中添加了相应检查项

### 3. 前端防御 ✅

**文件**: `web-site/src/components/common/MarkdownRenderer/index.tsx`

**改进内容**：
- 添加了自定义 `del` 组件
- 如果有残留的 `<del>` 标签泄漏到前端：
  - 显示内容（不丢失信息）
  - 不应用删除线样式
  - 使用普通文本样式显示

## 使用指南

### 测试占位符清理

运行测试脚本验证正则表达式是否正确：

```bash
# Python 测试（推荐）
python3 scripts/test-placeholder-removal.py

# C# 测试（需要 dotnet-script）
dotnet script scripts/test-placeholder-removal.csx
```

### 清理已存在的文档

有两种方式清理数据库中已存在的文档：

#### 方式 1：使用提供的工具类

在项目中添加清理代码（`scripts/CleanExistingDocuments.cs` 已提供）：

```csharp
// 在 Startup 或 Program.cs 中调用
await CleanExistingDocuments.CleanAllAsync(serviceProvider, dryRun: true);  // 先模拟运行
await CleanExistingDocuments.CleanAllAsync(serviceProvider, dryRun: false); // 实际清理

// 或者创建一个 API 端点
app.MapPost("/admin/clean-placeholders", async (IServiceProvider sp) =>
    await CleanExistingDocuments.CleanAllAsync(sp));
```

#### 方式 2：手动清理

如果需要手动清理特定文档：

```csharp
using var dbContext = serviceProvider.GetRequiredService<IKoalaWikiContext>();

var document = await dbContext.DocumentFileItems.FindAsync(documentId);
if (document != null)
{
    document.Content = DocumentQualityValidator.RemovePlaceholders(document.Content);
    await dbContext.SaveChangesAsync();
}
```

### 重新生成文档

对于已生成但包含占位符的文档，建议：

1. **批量清理**：使用上述工具清理现有文档（快速方案）
2. **重新生成**：删除有问题的文档并重新生成（彻底方案）

## 防御层级

现在系统有三层防御：

```
┌─────────────────────────────────────┐
│ 第一层：AI Prompt 禁止              │
│ - 明确禁止字数占位符                │
│ - 明确禁止删除线标记                │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 第二层：后端清理                    │
│ - 移除所有删除线标记                │
│ - 清理所有占位符模式                │
│ - 验证文档质量                      │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 第三层：前端防御                    │
│ - 自定义 del 组件                   │
│ - 即使泄漏也不显示删除线            │
└─────────────────────────────────────┘
```

## 文件清单

### 修改的文件
- `src/KoalaWiki/KoalaWarehouse/DocumentQualityValidator.cs` - 核心清理逻辑
- `src/KoalaWiki/Prompts/Warehouse/GenerateDocs.md` - AI 生成提示词
- `web-site/src/components/common/MarkdownRenderer/index.tsx` - 前端渲染组件

### 新增的文件
- `scripts/test-placeholder-removal.py` - Python 测试脚本
- `scripts/test-placeholder-removal.csx` - C# 测试脚本
- `scripts/CleanExistingDocuments.cs` - 批量清理工具类
- `scripts/clean-existing-placeholders.csx` - 清理脚本
- `scripts/README-PLACEHOLDER-CLEANUP.md` - 本文档

## 监控和维护

### 如何监控问题

1. **查看日志**：
   ```bash
   # 查找占位符相关的日志
   grep "占位符" logs/koalawiki.log
   ```

2. **检查现有文档**：
   ```csharp
   var docsWithPlaceholders = await CleanExistingDocuments
       .GetDocumentsWithPlaceholdersAsync(serviceProvider);
   ```

3. **数据库查询**：
   ```sql
   SELECT Id, Title, LENGTH(Content)
   FROM DocumentFileItems
   WHERE Content LIKE '%（约%字%'
      OR Content LIKE '%<del>%'
      OR Content LIKE '%~~%';
   ```

### 如果问题仍然出现

1. **检查 AI 输出**：
   - 查看生成日志，确认 AI 是否仍在生成占位符
   - 如果是，可能需要进一步强化 Prompt

2. **测试正则表达式**：
   - 运行测试脚本
   - 添加新的测试用例
   - 更新正则表达式模式

3. **调试清理逻辑**：
   - 启用 Debug 日志查看匹配细节
   - 确认清理顺序正确
   - 验证数据库保存成功

## 性能影响

- **清理逻辑**：每个文档增加约 50-100ms 处理时间（可接受）
- **正则匹配**：优化后的模式匹配效率高
- **数据库查询**：批量清理时注意内存使用，建议分批处理大量文档

## 未来改进

1. **自动化监控**：添加定时任务检查新生成文档的质量
2. **更智能的提示词**：根据不同模型优化 Prompt
3. **可配置的清理规则**：允许用户自定义占位符模式
4. **前端预览警告**：在前端显示质量警告，提示用户重新生成

## 相关 Issue 和 Commit

- Commit: `c57fa28` - fix: prevent AI from generating placeholder text in documentation
- Branch: `delete-unnecessary-links`

## 技术支持

如有问题，请查看：
1. 项目文档：`/CLAUDE.md`
2. 日志文件：`logs/koalawiki.log`
3. GitHub Issues：[OpenDeepWiki Issues](https://github.com/AIDotNet/OpenDeepWiki/issues)
