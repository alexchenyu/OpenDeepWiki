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
cd web-site
npm install
npm run build
cd ..
COMPOSE="docker compose"
sudo make down-mem0                   # 停止所有服务
$COMPOSE -f docker-compose-mem0.yml down --volumes --remove-orphans
$COMPOSE -f docker-compose-mem0.yml build --no-cache mem0 koalawiki
# sudo rm -rf data/ postgres_db/ neo4j_data/  # 清理数据库（可选）
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
---

## Mermaid 图表修复工具

### 问题描述
现有文档中可能包含Mermaid语法错误，导致图表渲染失败。常见错误包括：
- 样式语法错误（如 `fill:#f9f 1`）
- Subgraph格式错误（节点声明应分行）
- 箭头不完整（如 `A --> Err`）
- 节点ID包含空格或特殊字符
- State diagram的note语法错误

### 准备工作：获取管理员Token

修复工具需要管理员权限，首先需要获取Token：

#### 方法1：使用脚本获取（推荐）

```bash
# 交互式获取Token（会提示输入账号密码）
./get_token.sh

# 或直接提供账号密码
./get_token.sh mobilechina@gmail.com admin

# 查看数据库中的所有用户
./get_token.sh --list-users
```

脚本会：
- 显示你的Token
- 自动保存到 `.admin_token` 文件
- 提供使用说明

#### 方法2：通过API登录

```bash
# 登录获取Token
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"mobilechina@gmail.com","password":"admin"}' \
  http://localhost:8080/api/auth/LoginAsync | jq -r '.token'
```

#### 使用Token

获取Token后，有三种使用方式：

```bash
# 方式1：环境变量（推荐，一次设置多次使用）
export ADMIN_TOKEN="your_token_here"
./repair_mermaid.sh stats

# 方式2：自动读取 .admin_token 文件（get_token.sh会自动创建）
./repair_mermaid.sh stats

# 方式3：交互式输入（脚本会提示你输入）
./repair_mermaid.sh stats
# 然后粘贴Token
```

### 使用修复工具

#### 方式1：使用Shell脚本（推荐）

```bash
# 查看统计信息
./repair_mermaid.sh stats

# 预览修复（不实际修改）
./repair_mermaid.sh preview

# 执行修复（实际修改数据库）
./repair_mermaid.sh repair

# 修复指定仓库
REPO_ID="abc123def456"
./repair_mermaid.sh preview $REPO_ID  # 预览
./repair_mermaid.sh repair $REPO_ID   # 执行

# 修复单个文档
DOC_ID="doc123abc456"
./repair_mermaid.sh doc $DOC_ID preview  # 预览
./repair_mermaid.sh doc $DOC_ID          # 执行
```

#### 方式2：直接调用API

```bash
# 设置Token
TOKEN="your_admin_token_here"

# 1. 获取统计信息
curl -X GET \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/MermaidRepair/GetMermaidRepairStatsAsync"

# 2. 预览所有文档的修复
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/MermaidRepair/RepairAllMermaidDiagramsAsync?dryRun=true&limit=10"

# 3. 执行所有文档的修复
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/MermaidRepair/RepairAllMermaidDiagramsAsync?dryRun=false"

# 4. 修复指定仓库
REPO_ID="abc123def456"
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/MermaidRepair/RepairWarehouseMermaidDiagramsAsync?warehouseId=$REPO_ID&dryRun=false"

# 5. 修复单个文档
DOC_ID="doc123abc456"
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/MermaidRepair/RepairDocumentMermaidAsync?documentId=$DOC_ID&dryRun=false"
```

### 修复规则

修复工具会自动处理以下问题：

1. **样式语法修复**
   - `style A fill:#f9f 1` → `style A fill:#f9f`
   - 确保属性用逗号分隔
   - 移除无效的尾随字符

2. **Subgraph格式修复**
   - `subgraph "名称"A[Node]` → 分离为两行
   - 确保`end`关键字单独一行

3. **节点ID标准化**
   - `User-Auth` → `User_Auth`
   - 移除空格和特殊字符

4. **箭头修复**
   - `A --> Err` → `A --> Error`
   - 确保箭头连接完整

5. **变量语法移除**
   - `${var}` → `Variable`

6. **State diagram note修复**
   - `note right o Scale:` → `note right: "Scale"`

### 修复输出示例

```json
{
  "success": true,
  "dryRun": false,
  "summary": {
    "totalProcessed": 25,
    "modified": 18,
    "unchanged": 6,
    "errors": 1
  },
  "details": [
    {
      "documentId": "abc123",
      "documentTitle": "系统架构",
      "modified": true,
      "message": "Mermaid语法已修复"
    }
  ]
}
```

### 注意事项

1. **建议先预览**: 使用 `dryRun=true` 查看将要修改的内容
2. **需要管理员权限**: 批量修复需要admin角色
3. **数据库直接修改**: 修复操作会直接更新数据库
4. **备份建议**: 重要数据建议先备份数据库
5. **新文档自动修复**: 新生成的文档会自动应用修复规则

### 获取仓库ID

```bash
# 通过名称查询仓库ID
docker exec -it opendeepwiki-postgres-1 psql -U postgres -d KoalaWiki -c \
  "SELECT \"Id\", \"OrganizationName\", \"Name\", \"Branch\" FROM \"Warehouses\" WHERE \"Name\" = 'your-repo-name';"
```

### 故障排除

```bash
# 查看修复日志
docker logs opendeepwiki-koalawiki-1 | grep -i "mermaid\|repair"

# 如果修复失败，检查文档内容
docker exec -it opendeepwiki-postgres-1 psql -U postgres -d KoalaWiki -c \
  "SELECT \"Id\", \"Title\", LENGTH(\"Content\") as content_length FROM \"DocumentFileItems\" WHERE \"Content\" LIKE '%\`\`\`mermaid%' LIMIT 5;"
```

---

## 如何部分触发文档重新生成

### 场景说明

当需要重新生成特定文档（例如修复了文档内容错误、更新了生成逻辑）而不想重新分析整个仓库时，可以使用以下方法。

### 前置条件

- 已经完成后端代码修改（如果有）
- 后端服务已重新构建并重启
- 数据库连接正常

### 操作步骤

#### 1. 获取仓库ID

```bash
# 通过仓库名称查询仓库ID
docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  "SELECT \"Id\", \"Name\", \"OrganizationName\", \"Status\" FROM \"Warehouses\" WHERE \"Name\" = 'openbmc';"
```

**输出示例**：
```
Id                                   | Name    | OrganizationName | Status
-------------------------------------+---------+------------------+--------
515f8a98-e56f-4dd1-bb69-90b27e6b7d13 | openbmc | openbmc          | 2
```

保存 `Id` 值，后续步骤需要使用。

#### 2. 标记需要重新生成的文档为未完成

**方法A：重新生成引用特定DocumentFileItem的所有文档**

如果某个 DocumentFileItem 被删除或损坏，需要重新生成所有引用它的文档目录：

```bash
# 查找引用该文档的所有目录条目
WAREHOUSE_ID="515f8a98-e56f-4dd1-bb69-90b27e6b7d13"
DOCUMENT_ID="20490cb3-7c0e-4171-893d-f2c225a1a5ac"  # 被删除的文档ID

docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  "SELECT \"Id\", \"Name\", \"IsCompleted\" FROM \"DocumentCatalogs\"
   WHERE \"WarehouseId\" = '$WAREHOUSE_ID' AND \"DucumentId\" = '$DOCUMENT_ID';"

# 标记为未完成
docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  "UPDATE \"DocumentCatalogs\"
   SET \"IsCompleted\" = false
   WHERE \"WarehouseId\" = '$WAREHOUSE_ID' AND \"DucumentId\" = '$DOCUMENT_ID';"
```

**方法B：重新生成特定名称的文档**

```bash
WAREHOUSE_ID="515f8a98-e56f-4dd1-bb69-90b27e6b7d13"

# 标记特定文档为未完成（支持模糊匹配）
docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  "UPDATE \"DocumentCatalogs\"
   SET \"IsCompleted\" = false
   WHERE \"WarehouseId\" = '$WAREHOUSE_ID'
   AND (\"Name\" LIKE '%深入分析%' OR \"Name\" LIKE '%架构分析%' OR \"Name\" LIKE '%基本操作%');"
```

**方法C：重新生成所有文档**

```bash
WAREHOUSE_ID="515f8a98-e56f-4dd1-bb69-90b27e6b7d13"

# 标记该仓库的所有文档为未完成
docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  "UPDATE \"DocumentCatalogs\"
   SET \"IsCompleted\" = false
   WHERE \"WarehouseId\" = '$WAREHOUSE_ID';"
```

#### 3. 触发仓库重新处理

```bash
WAREHOUSE_ID="515f8a98-e56f-4dd1-bb69-90b27e6b7d13"

# 将仓库状态设置为 Pending (1)，触发后台任务处理
docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  "UPDATE \"Warehouses\"
   SET \"Status\" = 1
   WHERE \"Id\" = '$WAREHOUSE_ID';"
```

**仓库状态说明**：
- `0` = NotStarted（未开始）
- `1` = Pending（处理中）- **设置此状态触发重新生成**
- `2` = Completed（已完成）
- `3` = Failed（失败）

#### 4. 监控重新生成进度

**方法1：查看未完成文档数量**

```bash
WAREHOUSE_ID="515f8a98-e56f-4dd1-bb69-90b27e6b7d13"

# 持续监控未完成文档数量
watch -n 5 "docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  'SELECT COUNT(*) as incomplete_docs FROM \"DocumentCatalogs\"
   WHERE \"WarehouseId\" = '\''$WAREHOUSE_ID'\'' AND \"IsCompleted\" = false;'"
```

**方法2：查看仓库处理状态**

```bash
WAREHOUSE_ID="515f8a98-e56f-4dd1-bb69-90b27e6b7d13"

docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  "SELECT \"Name\", \"Status\" FROM \"Warehouses\" WHERE \"Id\" = '$WAREHOUSE_ID';"
```

- 当 `Status` 从 `1` (Pending) 变为 `2` (Completed) 时，表示处理完成

**方法3：实时查看后台日志**

```bash
# 实时监控文档生成日志
docker logs -f opendeepwiki_koalawiki_1

# 或过滤关键信息
docker logs -f opendeepwiki_koalawiki_1 | grep -i "document\|generating\|completed"
```

**方法4：查看已生成的文档**

```bash
# 查看最近生成的文档
docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  "SELECT \"Title\", \"CreatedAt\", length(\"Content\") as content_length
   FROM \"DocumentFileItems\"
   WHERE \"Title\" LIKE '%OpenBMC%' OR \"Title\" LIKE '%架构%' OR \"Title\" LIKE '%操作%'
   ORDER BY \"CreatedAt\" DESC
   LIMIT 10;"
```

#### 5. 验证生成结果

文档生成完成后，访问对应页面验证：

```bash
# 查看仓库的文档目录
curl -s "http://localhost:8080/api/DocumentCatalog/DocumentCatalogs?organizationName=openbmc&name=openbmc&branch=master" | jq '.items[] | {label: .label, completed: .completed}'
```

或直接在浏览器访问：
- http://localhost:8080/openbmc/openbmc/deep-dive?branch=master
- http://localhost:8080/openbmc/openbmc/getting-started_basic-operations?branch=master

### 常见场景

#### 场景1：修复后端代码后重新生成文档

```bash
# 1. 重新构建后端
cd /home/alex_chen/OpenDeepWiki
cd web-site && npm run build && cd ..
docker-compose -f docker-compose-mem0.yml build --no-cache koalawiki
docker-compose -f docker-compose-mem0.yml restart koalawiki

# 2. 标记文档为未完成
WAREHOUSE_ID="your-warehouse-id"
docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  "UPDATE \"DocumentCatalogs\" SET \"IsCompleted\" = false WHERE \"WarehouseId\" = '$WAREHOUSE_ID';"

# 3. 触发重新生成
docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  "UPDATE \"Warehouses\" SET \"Status\" = 1 WHERE \"Id\" = '$WAREHOUSE_ID';"

# 4. 监控进度
docker logs -f opendeepwiki_koalawiki_1
```

#### 场景2：删除了错误的文档后重新生成

```bash
# 1. 删除错误的文档
docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  "DELETE FROM \"DocumentFileItems\" WHERE \"Id\" IN ('doc-id-1', 'doc-id-2');"

# 2. 标记引用这些文档的目录为未完成
WAREHOUSE_ID="your-warehouse-id"
docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  "UPDATE \"DocumentCatalogs\"
   SET \"IsCompleted\" = false
   WHERE \"WarehouseId\" = '$WAREHOUSE_ID'
   AND \"DucumentId\" IN ('doc-id-1', 'doc-id-2');"

# 3. 触发重新生成
docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  "UPDATE \"Warehouses\" SET \"Status\" = 1 WHERE \"Id\" = '$WAREHOUSE_ID';"
```

#### 场景3：只重新生成特定页面

```bash
# 1. 查找目标文档的目录ID
WAREHOUSE_ID="your-warehouse-id"
docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  "SELECT \"Id\", \"Name\", \"Url\" FROM \"DocumentCatalogs\"
   WHERE \"WarehouseId\" = '$WAREHOUSE_ID' AND \"Name\" LIKE '%深入分析%';"

# 2. 标记为未完成
CATALOG_ID="catalog-id"
docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  "UPDATE \"DocumentCatalogs\" SET \"IsCompleted\" = false WHERE \"Id\" = '$CATALOG_ID';"

# 3. 触发重新生成
docker exec opendeepwiki_postgres_1 psql -U postgres -d KoalaWiki -c \
  "UPDATE \"Warehouses\" SET \"Status\" = 1 WHERE \"Id\" = '$WAREHOUSE_ID';"
```

### 注意事项

1. **不要删除数据库**：使用 `UPDATE` 而不是 `DELETE` 来保留文档结构
2. **先测试小范围**：建议先标记少量文档测试，确认无误后再批量操作
3. **监控资源使用**：文档生成会消耗大量AI token，注意成本控制
4. **预计时间**：根据文档数量，重新生成可能需要10-30分钟
5. **并发限制**：系统有并发限制（`TASK_MAX_SIZE_PER_USER`），避免同时触发多个仓库

### 完整示例脚本

```bash
#!/bin/bash
# regenerate_docs.sh - 重新生成指定仓库的文档

WAREHOUSE_ID="515f8a98-e56f-4dd1-bb69-90b27e6b7d13"
DB_CONTAINER="opendeepwiki_postgres_1"

echo "=== 开始重新生成文档 ==="

# 1. 标记所有文档为未完成
echo "1. 标记文档为未完成..."
docker exec $DB_CONTAINER psql -U postgres -d KoalaWiki -c \
  "UPDATE \"DocumentCatalogs\" SET \"IsCompleted\" = false WHERE \"WarehouseId\" = '$WAREHOUSE_ID';"

# 2. 触发重新生成
echo "2. 触发重新生成..."
docker exec $DB_CONTAINER psql -U postgres -d KoalaWiki -c \
  "UPDATE \"Warehouses\" SET \"Status\" = 1 WHERE \"Id\" = '$WAREHOUSE_ID';"

# 3. 监控进度
echo "3. 监控进度（按Ctrl+C停止）..."
while true; do
    STATUS=$(docker exec $DB_CONTAINER psql -U postgres -d KoalaWiki -t -c \
      "SELECT \"Status\" FROM \"Warehouses\" WHERE \"Id\" = '$WAREHOUSE_ID';")
    INCOMPLETE=$(docker exec $DB_CONTAINER psql -U postgres -d KoalaWiki -t -c \
      "SELECT COUNT(*) FROM \"DocumentCatalogs\" WHERE \"WarehouseId\" = '$WAREHOUSE_ID' AND \"IsCompleted\" = false;")

    echo "$(date +%H:%M:%S) - Status: $STATUS | 未完成: $INCOMPLETE"

    if [ "$STATUS" -eq 2 ]; then
        echo "=== 重新生成完成！ ==="
        break
    fi

    sleep 10
done
```

### 相关资源

- 仓库状态枚举：`KoalaWiki.Domains/Warehouse/WarehouseStatus.cs`
- 文档处理服务：`src/KoalaWiki/KoalaWarehouse/DocumentPending/DocumentPendingService.cs`
- 文档目录服务：`src/KoalaWiki/Services/DocumentCatalogService.cs`
