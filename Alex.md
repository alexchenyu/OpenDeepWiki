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
COMPOSE="docker compose"
sudo make down-mem0                   # 停止所有服务
sudo $COMPOSE -f docker-compose-mem0.yml down --volumes --remove-orphans
sudo $COMPOSE -f docker-compose-mem0.yml build --no-cache mem0 koalawiki
sudo rm -rf data/ postgres_db/ neo4j_data/  # 清理数据库（可选）
rm mem0.log
make dev-mem0 2>&1 | tee mem0.log

# sudo make down-mem0 
# sudo docker compose -f docker-compose-mem0.yml down
# docker stop opendeepwiki-koalawiki-1 aspire-dashboard mem0 opendeepwiki-postgres-1 neo4j 2>/dev/null || true
# docker rm opendeepwiki-koalawiki-1 aspire-dashboard mem0 opendeepwiki-postgres-1 neo4j 2>/dev/null || true
# docker rmi opendeepwiki_koalawiki opendeepwiki-koalawiki opendeepwiki_mem0 2>/dev/null || true  # 删除旧的 koalawiki 镜像（关键！）
# # sudo rm -rf data/ postgres_db/ neo4j_data/  # 清理数据库（可选）
# cd web-site && npm run build && cd ..       # 构建前端
# docker compose -f docker-compose-mem0.yml build --no-cache koalawiki mem0 # 强制重新构建
# make dev-mem0 2>&1 | tee mem0.log  # 前台运行并保存日志（等同于 docker-compose up）


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
## OpenDeepWiki 多语言翻译操作指南

### 为 OpenBMC 生成英文文档（保留中文版本）

#### 1. 获取仓库ID
```bash
# 通过组织名和仓库名获取真实的仓库ID（GUID格式）
docker exec -it opendeepwiki-postgres-1 psql -U postgres -d KoalaWiki -c "SELECT \"Id\", \"Name\", \"OrganizationName\", \"Branch\" FROM \"Warehouses\" WHERE \"Name\" = 'openbmc';"
```

#### 2. 启动翻译任务
```bash
# 使用获取到的仓库ID启动翻译（替换为实际ID）
REPO_ID="2e77bf13-4e35-4e9a-b646-3bfbcf9a45b6"

curl -X POST "http://localhost:8080/api/translation/repository" \
  -H "Content-Type: application/json" \
  -d "{
    \"warehouseId\": \"$REPO_ID\",
    \"targetLanguage\": \"en-US\",
    \"sourceLanguage\": \"zh-CN\"
  }"
```

#### 3. 手动激活任务（如果停留在Pending状态）
```bash
# 检查文档数量
docker exec -it opendeepwiki-postgres-1 psql -U postgres -d KoalaWiki -c "
SELECT COUNT(*) as catalogs FROM \"DocumentCatalogs\" WHERE \"WarehouseId\" = '$REPO_ID';
SELECT COUNT(dfi.*) as files FROM \"DocumentFileItems\" dfi 
JOIN \"DocumentCatalogs\" dc ON dfi.\"DocumentCatalogId\" = dc.\"Id\" 
WHERE dc.\"WarehouseId\" = '$REPO_ID';"

# 手动激活翻译任务
docker exec -it opendeepwiki-postgres-1 psql -U postgres -d KoalaWiki -c "
UPDATE \"TranslationTasks\" 
SET \"Status\" = 1, \"StartedAt\" = NOW(), \"TotalCatalogs\" = 13, \"TotalFiles\" = 13
WHERE \"WarehouseId\" = '$REPO_ID' AND \"Status\" = 0;"
```

#### 4. 监控翻译进度
```bash
# 实时监控翻译状态
while true; do
  echo "=== $(date) ==="
  curl -s "http://localhost:8080/api/translation/repository/$REPO_ID/tasks?targetLanguage=en-US" | jq '.[0] | {status: .status, catalogsTranslated: .catalogsTranslated, filesTranslated: .filesTranslated, totalCatalogs: .totalCatalogs, totalFiles: .totalFiles, errorMessage: .errorMessage}'
  sleep 30
done
```

#### 5. 支持的语言列表
- `en-US` - English (US)  
- `zh-CN` - 简体中文
- `zh-TW` - 繁體中文
- `ja-JP` - 日本語
- `ko-KR` - 한국어
- `fr-FR` - Français
- `de-DE` - Deutsch
- `es-ES` - Español
- `ru-RU` - Русский

#### 6. 故障排除
```bash
# 清理失败的翻译任务
docker exec -it opendeepwiki-postgres-1 psql -U postgres -d KoalaWiki -c "
DELETE FROM \"TranslationTasks\" WHERE \"WarehouseId\" = '$REPO_ID' AND \"Status\" IN (3, 99);"

# 重启服务（如果任务处理器有问题）
docker restart opendeepwiki-koalawiki-1

# 查看翻译相关日志
docker logs opendeepwiki-koalawiki-1 | grep -i "翻译\|translation" | tail -20
```

#### 注意事项
- 翻译任务是异步后台处理，中文文档保持不变
- 整个过程预计需要15-30分钟（取决于文档数量和AI响应速度）
- 如果任务停留在Pending状态，需要手动激活（步骤3）
- 翻译完成后，可以通过前端界面切换语言查看英文版本

#### ✅ 国际化功能状态
**前端语言切换功能已完全修复**：
- ✅ 后端API正确支持语言参数（`languageCode`）
- ✅ 前端store已修复，会传递当前语言代码给API
- ✅ 语言切换时自动重新获取翻译后的文档目录
- ✅ 左侧目录树会根据选择的语言显示对应的翻译内容

**测试验证**：
```bash
# 中文目录: "OpenBMC 入门指南"
curl -s "http://localhost:8080/api/DocumentCatalog/DocumentCatalogs?organizationName=openbmc&name=openbmc&branch=master&languageCode=zh-CN" | jq '.items[0].label'

# 英文目录: "OpenBMC Getting Started Guide"  
curl -s "http://localhost:8080/api/DocumentCatalog/DocumentCatalogs?organizationName=openbmc&name=openbmc&branch=master&languageCode=en-US" | jq '.items[0].label'
```

#### 预期结果
翻译完成后，你将同时拥有：
- ✅ 完整的中文版OpenBMC文档
- ✅ 完整的英文版OpenBMC文档  
- ✅ 支持在前端界面切换语言查看
- ✅ 左侧目录树会根据语言设置显示对应的翻译内容