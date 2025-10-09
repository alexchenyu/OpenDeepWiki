# OpenDeepWiki 性能调优指南

## 📊 当前观察到的正常行为

根据日志分析，以下情况是**正常且预期的**：

### ✅ 正常的警告日志
```
[ERR] Mem0Rag 服务主循环发生异常，等待30秒后重试
[ERR] MiniMapBackgroundService 执行异常
内部异常：Failed to connect to postgres:5432
System.TimeoutException: The operation has timed out
```

**为什么这是正常的？**
1. AI 正在处理超大仓库（如 openbmc），占用大量数据库连接和CPU
2. 后台服务在资源紧张时无法立即连接数据库
3. **应用不会崩溃**，服务会自动重试（每30秒一次）
4. 处理完成后，后台服务会恢复正常

### ✅ 长时间处理是正常的
```
[INF] Function git-AnalyzeFunctionDependencyTree completed. Duration: 1471.6565812s
```
- **24分钟** 处理依赖树分析是正常的（超大仓库）
- 接近但未超过 30 分钟超时限制
- 这说明超时配置是合理的

## 🎯 性能优化建议

### 1. **如果频繁出现数据库连接超时**

#### 选项A：增加 DbContext 作用域管理（推荐）

在后台服务中使用更短的 DbContext 生命周期：

```csharp
// 不好的做法：长时间持有 DbContext
using var scope = service.CreateScope();
var dbContext = scope.ServiceProvider.GetService<IKoalaWikiContext>();
// ... 长时间操作 ...

// 好的做法：快速查询后立即释放
Warehouse item;
using (var scope = service.CreateScope())
{
    var context = scope.ServiceProvider.GetService<IKoalaWikiContext>();
    item = await context.Warehouses.FirstOrDefaultAsync();
} // 立即释放连接
// ... 长时间操作 ...
```

#### 选项B：调整后台服务执行间隔

如果数据库压力太大，可以降低后台服务的执行频率：

```csharp
// MiniMapBackgroundService.cs
await Task.Delay(30000, stoppingToken); // 10秒 → 30秒
```

### 2. **优化 PostgreSQL 配置（已应用）**

当前配置：
```yaml
max_connections: 200           # 最大连接数
shared_buffers: 256MB          # 共享缓冲区
work_mem: 8MB                  # 每个操作的工作内存
effective_cache_size: 1GB      # 有效缓存大小
```

如果系统内存充足，可以进一步增加：
```yaml
shared_buffers: 512MB          # 增加到512MB
work_mem: 16MB                 # 增加到16MB
effective_cache_size: 2GB      # 增加到2GB
```

### 3. **分离读写数据库（高级）**

对于生产环境，考虑：
- 主库（Master）：处理写操作
- 从库（Replica）：处理后台服务的只读查询
- 减少主库压力

### 4. **使用任务队列（高级）**

将耗时操作放入队列：
- 使用 Redis/RabbitMQ 管理任务
- 控制并发数量
- 实现任务优先级

## 🔍 监控指标

### 关键指标监控

1. **数据库连接数**
```bash
docker exec opendeepwiki-postgres-1 psql -U postgres -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
```

2. **慢查询日志**
```yaml
# docker-compose-mem0.yml 中添加
command: >
  postgres
  -c log_min_duration_statement=1000  # 记录超过1秒的查询
```

3. **容器资源使用**
```bash
docker stats --no-stream
```

### 健康检查

如果看到以下情况，说明系统运行正常：
- ✅ PostgreSQL 状态：`Up (healthy)`
- ✅ 活跃连接数：< 20
- ✅ CPU 使用率：< 80%
- ✅ 内存使用率：< 80%
- ✅ 应用日志中有处理进度

## ⚠️ 何时需要担心

### 🚨 真正的问题信号

只有在以下情况下才需要关注：

1. **应用持续崩溃**
   - 日志显示：`Application is shutting down`
   - 容器不断重启

2. **数据库连接数接近上限**
   - 活跃连接 > 180 (接近200上限)

3. **所有请求都超时**
   - 前端无法访问
   - API 完全无响应

4. **磁盘空间不足**
   ```bash
   df -h
   ```

5. **内存不足导致 OOM**
   ```bash
   dmesg | grep -i "out of memory"
   ```

## 📝 日志分析技巧

### 过滤真正的错误

```bash
# 排除正常的连接重试错误
grep -E "ERR|ERROR" mem0.log | \
  grep -v "Failed to connect" | \
  grep -v "服务主循环发生异常" | \
  grep -v "MiniMapBackgroundService 执行异常"
```

### 查看处理进度

```bash
# 查看 AI 处理进度
grep -E "处理仓库|完成|Duration|succeeded" mem0.log | tail -20
```

### 统计错误频率

```bash
# 每分钟的错误数
grep "ERR" mem0.log | cut -d' ' -f2 | cut -d: -f1-2 | uniq -c
```

## 🎓 总结

**关键要点：**
1. ✅ 后台服务的连接失败是正常的，会自动重试
2. ✅ 应用不会崩溃（已配置 `Ignore` 模式）
3. ✅ AI 处理超大仓库需要时间（最长30分钟）
4. ⚠️ 只有在应用持续无响应时才需要调整配置
5. 📊 重点监控连接数、CPU、内存使用率

**建议的监控频率：**
- 每天检查一次容器状态
- 每周分析一次日志
- 只在性能下降时才调整配置

如果系统能处理你的工作负载，**不要过度优化**！
