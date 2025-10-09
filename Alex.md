## Token 配置说明

为了避免超过模型的上下文窗口限制，需要合理配置以下环境变量：

### 配置项说明

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `READ_MAX_TOKENS` | 30000 | AI读取文件的总token限制，累加所有读取的文件内容 |
| `CATALOGUE_MAX_TOKENS` | 15000 | 目录结构的最大token数量，超过会被截断 |
| `CHARS_PER_TOKEN` | 2.0 | 字符转token的估算比例，用于粗略估算 |

### 字符转Token比例参考

- **中文为主**: 1.5 - 2.0
- **英文为主**: 3.0 - 4.0
- **代码为主**: 2.5 - 3.5
- **混合内容**: 2.0 - 2.5（推荐保守值）

### Token 预算分配（以 GLM-4.6-FP8 为例，context window = 202752 tokens）

- System prompts: ~2k tokens
- Catalogue: max 15k tokens (配置项 `CATALOGUE_MAX_TOKENS`)
- File reads: max 30k tokens (配置项 `READ_MAX_TOKENS`)
- Output: 16k tokens
- Other (tool definitions, messages): ~10k tokens
- **Total**: ~73k tokens ✅ (远低于 202k)

### 调整建议

如果遇到 `ValueError: This model's maximum context length is XXX tokens` 错误：

1. **降低 `READ_MAX_TOKENS`**: 减少AI读取文件的总量（例如 20000）
2. **降低 `CATALOGUE_MAX_TOKENS`**: 减少目录结构大小（例如 10000）
3. **调整 `CHARS_PER_TOKEN`**: 使用更保守的估算（例如 1.5）

---

```bash
sudo rm -rf OpenDeepWiki
git clone https://github.com/AIDotNet/OpenDeepWiki.git

每次改完代码，我都这样重新从头开始运行：

# 方法1：使用自动化脚本（推荐，前台运行可看日志）
./deploy-fix.sh

# 方法2：手动执行（完整版，前台运行）
make down-mem0                     # 停止所有服务
docker stop opendeepwiki-koalawiki-1 aspire-dashboard mem0 opendeepwiki-postgres-1 neo4j 2>/dev/null || true
docker rm opendeepwiki-koalawiki-1 aspire-dashboard mem0 opendeepwiki-postgres-1 neo4j 2>/dev/null || true
docker rmi opendeepwiki_koalawiki opendeepwiki-koalawiki 2>/dev/null || true  # 删除旧的 koalawiki 镜像（关键！）
sudo rm -rf data/ postgres_db/ neo4j_data/  # 清理数据库（可选）
cd web-site && npm run build && cd ..       # 构建前端
docker-compose -f docker-compose-mem0.yml build --no-cache koalawiki  # 强制重新构建
rm -f mem0.log
make dev-mem0 2>&1 | tee mem0.log  # 前台运行并保存日志（等同于 docker-compose up）


# 只改了业务代码：
make build-backend          # 重新构建后端
make down-mem0             # 停止服务
make up-mem0               # 启动服务（或用 dev-mem0 查看日志）

# 改了数据库 Schema（需要重新迁移）
make down-mem0
sudo rm -rf postgres_db/    # 只删除 PostgreSQL 数据
sudo rm -rf neo4j_data/     # 只删除 Neo4j 数据（如果改了 graph schema）
make build-backend
make up-mem0

# 完全重置：
make down-mem0
sudo rm -rf postgres_db/ neo4j_data/ data/
make build-backend
make up-mem0
```