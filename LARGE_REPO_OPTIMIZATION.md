# 超大仓库处理优化总结

针对超大仓库（如 openbmc，约 10 万文件）的全面优化配置。

## 优化时间：2025-10-09

---

## 1. 超时配置优化

### 1.1 文档处理超时
**文件：** `src/KoalaWiki/KoalaWarehouse/DocumentPending/DocumentPendingService.cs:270`

```csharp
// 之前：30分钟
token = new CancellationTokenSource(TimeSpan.FromMinutes(30));

// 优化后：2小时
token = new CancellationTokenSource(TimeSpan.FromHours(2));
```

**原因：** 超大仓库的依赖分析（`AnalyzeFunctionDependencyTree`, `AnalyzeFileDependencyTree`）单个函数可能耗时 10+ 分钟，多次调用会超过 30 分钟限制。

---

### 1.2 Pipeline 步骤超时
**文件：**
- `src/KoalaWiki/KoalaWarehouse/Pipeline/IDocumentProcessingStep.cs:55`
- `src/KoalaWiki/KoalaWarehouse/Pipeline/StepExecutionStrategy.cs:83`
- `src/KoalaWiki/KoalaWarehouse/Pipeline/StepExecutionModel.cs:98`

```csharp
// 之前：30分钟
StepTimeout = TimeSpan.FromMinutes(30)

// 优化后：2小时
StepTimeout = TimeSpan.FromHours(2)
```

**影响范围：**
- CatalogueGenerationStep（目录生成）
- ReadmeGenerationStep（README 生成）
- 所有 Pipeline 步骤

---

### 1.3 数据库连接超时
**文件：** `docker-compose-mem0.yml:30`

```yaml
# 之前：
Timeout=180;Command Timeout=180

# 优化后：
Timeout=300;Command Timeout=300
```

**提升：** 180秒 → 300秒（5分钟）

---

### 1.4 后台服务启动延迟和重试
**文件：**
- `src/KoalaWiki/BackendService/MiniMapBackgroundService.cs:16-22`
- `src/KoalaWiki/Mem0/Mem0Rag.cs:66-78`

```csharp
// 之前：
await Task.Delay(5000, stoppingToken);
const int maxRetries = 30;
const int delaySeconds = 5;
// 总等待时间：2.5分钟

// 优化后：
await Task.Delay(15000, stoppingToken);
const int maxRetries = 60;
const int delaySeconds = 10;
// 总等待时间：10分钟
```

**原因：** 数据库容器健康检查通过后，PostgreSQL 可能还在初始化索引和向量扩展，需要更长等待时间。

---

## 2. 数据库性能优化

### 2.1 PostgreSQL 配置
**文件：** `docker-compose-mem0.yml:101-134`

```yaml
postgres:
  shm_size: "1gb"  # 512mb → 1gb
  deploy:
    resources:
      limits:
        memory: 8G  # 新增
      reservations:
        memory: 2G  # 新增
  command: >
    postgres
    -c max_connections=200
    -c shared_buffers=512MB          # 256MB → 512MB
    -c effective_cache_size=2GB      # 1GB → 2GB
    -c maintenance_work_mem=256MB    # 128MB → 256MB
    -c wal_buffers=32MB              # 16MB → 32MB
    -c work_mem=16MB                 # 8MB → 16MB
    -c min_wal_size=2GB              # 1GB → 2GB
    -c max_wal_size=8GB              # 4GB → 8GB
```

**性能提升：**
- ✅ 2倍共享缓冲区 - 减少磁盘 I/O
- ✅ 2倍 WAL 缓冲区 - 提高写入性能
- ✅ 2倍工作内存 - 加速排序和连接操作
- ✅ 2倍 WAL 大小 - 减少检查点频率

---

### 2.2 Neo4j 配置
**文件：** `docker-compose-mem0.yml:138-170`

```yaml
neo4j:
  deploy:
    resources:
      limits:
        memory: 8G  # 新增
      reservations:
        memory: 2G  # 新增
  environment:
    - NEO4J_server_memory_heap_initial__size=1G  # 新增
    - NEO4J_server_memory_heap_max__size=4G      # 新增
    - NEO4J_server_memory_pagecache_size=2G      # 新增
```

**性能提升：**
- ✅ 4GB JVM 堆内存 - 处理大规模知识图谱
- ✅ 2GB 页缓存 - 加速图遍历查询

---

## 3. 资源限制优化总结

| 服务 | 内存限制 | 预留内存 | 说明 |
|------|---------|---------|------|
| **koalawiki** | 32GB | 4GB | 主应用，需要处理大量 AI 调用 |
| **mem0** | 16GB | 2GB | 向量数据库 RAG 服务 |
| **postgres** | 8GB ⬆️ | 2GB ⬆️ | 新增资源限制 |
| **neo4j** | 8GB ⬆️ | 2GB ⬆️ | 新增资源限制 |
| **总计** | **64GB** | **10GB** | |

**最低硬件要求（建议）：**
- CPU: 16+ 核心
- 内存: 64GB+
- 磁盘: 500GB+ SSD（NVMe 更佳）
- 网络: 10Gbps+（如果使用远程 AI API）

---

## 4. 重试策略总结

### 4.1 AI 模型调用重试
**文件：** `src/KoalaWiki/KoalaHttpClientHander.cs:78`

- **重试次数：** 3次
- **重试策略：** 指数退避（0ms, 3s, 6s）
- **4xx 错误：** 不重试（客户端错误）
- **5xx 错误：** 自动重试（服务器错误）

### 4.2 文档生成重试
**文件：** `src/KoalaWiki/KoalaWarehouse/DocumentPending/DocumentPendingService.cs:261`

- **重试次数：** 3次
- **超时后：** 指数退避延迟（1s, 2s, 4s）
- **网络错误：** 延迟 3s, 6s, 9s

### 4.3 目录结构生成重试
**文件：** `src/KoalaWiki/KoalaWarehouse/GenerateThinkCatalogue/GenerateThinkCatalogueService.cs:184`

- **流式重试：** 3次
- **空内容重试：** 最多3次，延迟 1.5s, 3s, 4.5s
- **超时重试：** 延迟 2s, 4s, 6s

---

## 5. 环境变量配置建议

**文件：** `docker-compose-mem0.yml:18-48`

```yaml
# 超大仓库关键配置
- READ_MAX_TOKENS=1000000           # 最大读取token数（Grok-4: 200万）
- CATALOGUE_MAX_TOKENS=500000       # 目录结构最大token限制
- CHARS_PER_TOKEN=2.5               # 字符/token 比例
- MAX_FILE_READ_COUNT=3             # AI 一次最多读取文件数
- ENABLE_CODE_COMPRESSION=true      # 启用代码压缩
- CATALOGUE_FORMAT=compact          # 紧凑目录格式

# 依赖分析配置
- ENABLE_CODED_DEPENDENCY_ANALYSIS=true  # 启用依赖分析（耗时但效果好）

# 增量更新配置
- ENABLE_INCREMENTAL_UPDATE=true    # 启用增量更新
- UPDATE_INTERVAL=5                 # 5天更新一次

# 任务并发配置
- TASK_MAX_SIZE_PER_USER=5          # 每用户最多5个并发任务
```

---

## 6. 性能监控建议

### 6.1 使用 Aspire Dashboard
访问：`http://localhost:18888`

监控指标：
- ✅ HTTP 请求耗时和状态码
- ✅ 数据库查询耗时
- ✅ 内存使用情况
- ✅ AI 模型调用延迟

### 6.2 日志监控
```bash
# 实时查看日志
tail -f mem0.log

# 搜索超时错误
grep -i "timeout\|cancel" mem0.log

# 搜索数据库连接错误
grep -i "failed to connect\|connection" mem0.log

# 统计 AI 函数调用耗时
grep "Function git-Analyze.*completed" mem0.log | grep "Duration:"
```

### 6.3 数据库性能监控
```bash
# PostgreSQL 连接数
docker exec -it opendeepwiki-postgres-1 \
  psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# PostgreSQL 慢查询
docker exec -it opendeepwiki-postgres-1 \
  psql -U postgres -c "SELECT query, calls, total_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# Neo4j 内存使用
docker exec -it neo4j \
  cypher-shell -u neo4j -p mem0graph "CALL dbms.queryJmx('java.lang:type=Memory') YIELD attributes"
```

---

## 7. 常见问题排查

### 7.1 "操作被取消 (超时或手动取消)"
**原因：** 文档处理超过 2 小时限制（已优化）
**解决：** 已将超时增加到 2 小时

### 7.2 "Failed to connect to 172.20.0.3:5432"
**原因：** 后台服务启动时数据库未就绪（已优化）
**解决：** 已增加启动延迟和重试次数

### 7.3 内存不足 (OOM)
**检查：**
```bash
docker stats
```
**解决：**
- 减少 `TASK_MAX_SIZE_PER_USER`
- 减少 `MAX_FILE_READ_COUNT`
- 增加物理内存或交换空间

### 7.4 AI 调用超时
**检查：**
```bash
# 测试 AI 端点连接
curl -i http://us-agent.supermicro.com:4500/v1/models
```
**解决：**
- 检查网络延迟
- 考虑使用本地部署的模型
- 减少 token 限制

---

## 8. 部署步骤

### 8.1 首次部署
```bash
# 1. 停止旧服务
make down-mem0

# 2. 清理旧数据（可选，谨慎操作！）
# rm -rf postgres_db neo4j_data

# 3. 使用优化后的配置部署
./deploy-fix.sh -d  # 后台运行
```

### 8.2 查看日志
```bash
# 实时查看
tail -f mem0.log

# 或者使用 docker-compose
docker-compose -f docker-compose-mem0.yml logs -f
```

### 8.3 健康检查
```bash
# 检查所有服务状态
docker-compose -f docker-compose-mem0.yml ps

# 检查数据库连接
docker exec -it opendeepwiki-koalawiki-1 \
  curl http://localhost:8080/health

# 检查 Neo4j
docker exec -it neo4j \
  cypher-shell -u neo4j -p mem0graph "RETURN 1"
```

---

## 9. 未来优化方向

### 9.1 代码层面
- [ ] 实现依赖分析结果缓存（避免重复分析）
- [ ] 支持分布式任务队列（Redis/RabbitMQ）
- [ ] 实现流式处理大文件（避免全量加载到内存）
- [ ] 添加依赖分析深度限制（避免无限递归）

### 9.2 架构层面
- [ ] 独立依赖分析服务（微服务化）
- [ ] 使用消息队列解耦长任务
- [ ] 实现多租户资源隔离
- [ ] 添加自动伸缩支持（Kubernetes）

### 9.3 性能层面
- [ ] 使用 Redis 缓存 AI 响应
- [ ] 批量处理文档生成请求
- [ ] 预热常用代码分析结果
- [ ] 使用 CDN 加速前端资源

---

## 10. 变更记录

| 日期 | 变更内容 | 影响范围 |
|------|---------|---------|
| 2025-10-09 | 增加文档处理超时到 2 小时 | DocumentPendingService |
| 2025-10-09 | 增加 Pipeline 步骤超时到 2 小时 | 所有 Pipeline 步骤 |
| 2025-10-09 | 增加数据库连接超时到 5 分钟 | PostgreSQL 连接 |
| 2025-10-09 | 优化后台服务启动等待策略 | MiniMapBackgroundService, Mem0Rag |
| 2025-10-09 | 增加 PostgreSQL 资源限制和配置 | docker-compose-mem0.yml |
| 2025-10-09 | 增加 Neo4j 资源限制和内存配置 | docker-compose-mem0.yml |

---

## 相关文档

- [CLAUDE.md](CLAUDE.md) - 项目架构说明
- [PERFORMANCE_TUNING.md](PERFORMANCE_TUNING.md) - 性能调优指南
- [deploy-fix.sh](deploy-fix.sh) - 部署脚本
- [Makefile](Makefile) - 构建命令

---

**作者：** Claude Code
**最后更新：** 2025-10-09
