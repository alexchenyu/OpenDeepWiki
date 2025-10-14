# MCP服务器端GetTree工具优化建议

## 问题分析
当前的 `openbmcopenbmc-GetTree` 工具返回完整的文件树（999,362字符），
容易超过大多数MCP客户端的context window限制。

## 解决方案1: 为GetTree添加参数控制

### 建议的新参数结构：
```json
{
  "name": "openbmcopenbmc-GetTree",
  "description": "Returns the file tree of the repository, with options to control output size",
  "inputSchema": {
    "type": "object",
    "properties": {
      "maxDepth": {
        "type": "integer",
        "description": "Maximum directory depth to traverse (default: unlimited)",
        "default": null
      },
      "maxItems": {
        "type": "integer", 
        "description": "Maximum number of items to return (default: unlimited)",
        "default": null
      },
      "rootPath": {
        "type": "string",
        "description": "Root path to start traversal from (default: repository root)",
        "default": "/"
      },
      "includeFiles": {
        "type": "boolean",
        "description": "Whether to include files in output (default: true)",
        "default": true
      },
      "includeDirs": {
        "type": "boolean", 
        "description": "Whether to include directories in output (default: true)",
        "default": true
      },
      "filePattern": {
        "type": "string",
        "description": "File name pattern to match (regex or glob, optional)",
        "default": null
      },
      "outputFormat": {
        "type": "string",
        "enum": ["full", "summary", "paths"],
        "description": "Output format: full tree, summary stats, or just paths",
        "default": "full"
      }
    },
    "required": []
  }
}
```

### 使用示例：

1. **获取摘要信息**（适合客户端概览）：
```json
{
  "name": "openbmcopenbmc-GetTree",
  "arguments": {
    "outputFormat": "summary",
    "maxDepth": 2
  }
}
```
返回：
```json
{
  "statistics": {
    "totalDirectories": 1250,
    "totalFiles": 21658,
    "maxDepth": 8,
    "topLevelDirs": ["bitbake", "meta-openembedded", "meta-phosphor", ...]
  }
}
```

2. **获取特定目录内容**：
```json
{
  "name": "openbmcopenbmc-GetTree", 
  "arguments": {
    "rootPath": "meta-phosphor",
    "maxDepth": 2,
    "maxItems": 100
  }
}
```

3. **搜索特定文件类型**：
```json
{
  "name": "openbmcopenbmc-GetTree",
  "arguments": {
    "filePattern": "*.bb",
    "maxItems": 50,
    "outputFormat": "paths"
  }
}
```

## 解决方案2: 创建新的专门工具

### 建议添加以下新工具：

1. **`openbmcopenbmc-GetTreeSummary`** - 获取文件树摘要
2. **`openbmcopenbmc-ListDirectory`** - 列出指定目录内容  
3. **`openbmcopenbmc-SearchFiles`** - 按模式搜索文件
4. **`openbmcopenbmc-GetProjectStats`** - 获取项目统计信息

### 工具定义示例：

```json
{
  "name": "openbmcopenbmc-GetTreeSummary",
  "description": "Get a concise summary of the repository structure",
  "inputSchema": {
    "type": "object", 
    "properties": {
      "includeStats": {"type": "boolean", "default": true},
      "includeTopDirs": {"type": "boolean", "default": true},
      "maxTopDirs": {"type": "integer", "default": 20}
    }
  }
}
```

```json
{
  "name": "openbmcopenbmc-ListDirectory",
  "description": "List contents of a specific directory",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": {"type": "string", "description": "Directory path"},
      "maxDepth": {"type": "integer", "default": 1},
      "maxItems": {"type": "integer", "default": 100}
    },
    "required": ["path"]
  }
}
```

## 解决方案3: 响应分页

### 为大型响应添加分页支持：
```json
{
  "name": "openbmcopenbmc-GetTree",
  "arguments": {
    "page": 1,
    "pageSize": 1000,
    "totalPages": 25
  }
}
```

## 实施建议

### 优先级1 (立即实施)：
- 为现有GetTree工具添加 `maxItems` 和 `outputFormat` 参数
- 默认限制输出到5000个条目或50KB

### 优先级2 (短期)：
- 添加 `maxDepth` 和 `rootPath` 参数
- 创建 `GetTreeSummary` 工具

### 优先级3 (长期)：
- 添加文件搜索和过滤功能
- 实施响应分页机制

## 兼容性
- 保持现有API向后兼容
- 新参数都设为可选，有合理默认值
- 在文档中说明推荐的参数组合
