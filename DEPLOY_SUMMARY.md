# OpenDeepWiki 超时问题完整修复总结

## 🎯 问题根源

1. **OpenAI SDK 240秒硬编码超时** - 无论 HttpClient 设置多少都会被覆盖
2. **多个后台服务数据库连接重试不足** - 10次×3秒=30秒，PostgreSQL 启动需要更长时间
3. **后台服务异常导致应用崩溃** - 默认 StopHost 行为
4. **PostgreSQL 连接池配置不足** - 默认配置无法应对高并发

## ✅ 完整修复清单

### 1. **核心 HttpClient 超时修复**
- **文件**: [src/KoalaWiki/KernelFactory.cs](src/KoalaWiki/KernelFactory.cs)
- **修改**: 设置 `HttpClient.Timeout = Timeout.InfiniteTimeSpan`
- **原因**: 让应用层的 `CancellationTokenSource` 控制真正的超时，而不是 SDK 的硬编码值

### 2. **所有服务层超时统一为 30 分钟**
- [src/KoalaWiki/KoalaWarehouse/DocumentPending/DocumentPendingService.cs:270](src/KoalaWiki/KoalaWarehouse/DocumentPending/DocumentPendingService.cs#L270) - 文档生成
- [src/KoalaWiki/KoalaWarehouse/GenerateThinkCatalogue/GenerateThinkCatalogueService.cs:191](src/KoalaWiki/KoalaWarehouse/GenerateThinkCatalogue/GenerateThinkCatalogueService.cs#L191) - 目录生成
- [src/KoalaWiki/KoalaWarehouse/Pipeline/IDocumentProcessingStep.cs:55](src/KoalaWiki/KoalaWarehouse/Pipeline/IDocumentProcessingStep.cs#L55) - Pipeline 步骤
- [src/KoalaWiki/KoalaWarehouse/Pipeline/StepExecutionStrategy.cs:83](src/KoalaWiki/KoalaWarehouse/Pipeline/StepExecutionStrategy.cs#L83)
- [src/KoalaWiki/KoalaWarehouse/Pipeline/StepExecutionModel.cs:98](src/KoalaWiki/KoalaWarehouse/Pipeline/StepExecutionModel.cs#L98)

### 3. **后台服务数据库等待增强**
- **Mem0Rag**: 30次 × 5秒 = 150秒
- **MiniMapBackgroundService**: 30次 × 5秒 = 150秒
- **StatisticsBackgroundService**: 已有完善的错误处理

### 4. **应用异常行为配置**
- **文件**: [src/KoalaWiki/Program.cs:14-17](src/KoalaWiki/Program.cs#L14-L17)
- **修改**: `BackgroundServiceExceptionBehavior = BackgroundServiceExceptionBehavior.Ignore`
- **添加**: `using Microsoft.Extensions.Hosting;`

### 5. **日志信息优化**
- **文件**: [src/KoalaWiki/Tools/FileTool.cs](src/KoalaWiki/Tools/FileTool.cs), [src/KoalaWiki/Tools/CodeAnalyzeTool.cs](src/KoalaWiki/Tools/CodeAnalyzeTool.cs)
- **修改**:
  - `Error reading file` → `[INFO] File not accessible`
  - `Error reading file` → `[INFO] Code analysis failed`
- **原因**: AI 查询不存在的文件是正常行为（探索性查询），不应标记为 Error，避免干扰真正的错误日志搜索

### 6. **PostgreSQL 优化配置**
- **文件**: [docker-compose-mem0.yml](docker-compose-mem0.yml)
- **连接字符串增强**:
  - `Timeout=180` (3分钟连接超时)
  - `Command Timeout=180` (3分钟命令超时)
  - `Maximum Pool Size=100` (连接池100)
  - `Keepalive=60` (心跳检测)
- **数据库配置**:
  - `max_connections=200`
  - `shared_buffers=256MB`
  - `shm_size=512mb`
  - healthcheck 优化: 10秒超时, 10次重试, 30秒启动时间

## 🚀 一键部署

```bash
./deploy-fix.sh
```

**脚本会自动执行：**
1. ✅ 停止所有服务
2. ✅ 清理旧的 koalawiki 镜像（关键！）
3. ✅ 构建前端
4. ✅ 强制重新构建后端 (`--no-cache`)
5. ✅ 前台启动并实时显示日志
6. ✅ 日志同时保存到 `mem0.log`

## 📊 预期效果

### ✅ 成功指标
- 应用启动后不再出现 `StopHost` 崩溃
- 后台服务失败只记录错误，应用继续运行
- AI 处理超大仓库（如 openbmc）时不会在 240 秒超时
- 数据库连接失败时会重试 150 秒
- PostgreSQL 支持 200 个并发连接

### ⚠️ 正常的警告日志
以下日志是正常的，不会导致应用崩溃：
```
[ERR] MiniMapBackgroundService 执行异常：Failed to connect to postgres
```
应用会继续运行，服务会自动重试。

## 🔧 故障排查

### 如果仍然出现 240 秒超时：
1. 确认使用了 `--no-cache` 重新构建
2. 确认删除了旧的 `opendeepwiki_koalawiki` 镜像
3. 检查镜像构建时间是否是最新的：
   ```bash
   docker images opendeepwiki_koalawiki
   ```

### 如果数据库连接一直失败：
1. 检查 PostgreSQL 容器状态：
   ```bash
   docker-compose -f docker-compose-mem0.yml ps postgres
   ```
2. 查看 PostgreSQL 日志：
   ```bash
   docker-compose -f docker-compose-mem0.yml logs postgres
   ```
3. 手动测试连接：
   ```bash
   docker-compose -f docker-compose-mem0.yml exec postgres pg_isready
   ```

## 📝 后续维护

### 改了业务代码（不改数据库）：
```bash
make build-backend
make down-mem0
make up-mem0
```

### 改了数据库 Schema：
```bash
make down-mem0
sudo rm -rf postgres_db/ neo4j_data/
make build-backend
make up-mem0
```

### 完全重置：
```bash
./deploy-fix.sh
```

## 🎓 技术细节

### 为什么设置无限超时？
- OpenAI SDK 使用 `System.ClientModel` 有内部超时机制（默认240秒）
- 设置 `HttpClient.Timeout = Timeout.InfiniteTimeSpan` 禁用 HttpClient 层的超时
- 使用应用层的 `CancellationTokenSource` 控制超时（30分钟）
- 这样可以为不同操作灵活设置不同的超时时间

### 超时配置层次：
```
应用层 CancellationTokenSource (30分钟)
    ↓
HttpClient.Timeout (无限)
    ↓
OpenAI SDK (由上层 CancellationToken 控制)
    ↓
TCP/Socket 层 (由 Npgsql 配置: 180秒)
```

## 📞 支持

如果问题仍然存在，请检查：
1. 日志文件 `mem0.log`
2. Docker 容器状态
3. 系统资源（CPU、内存、磁盘）

祝部署顺利！🎉
