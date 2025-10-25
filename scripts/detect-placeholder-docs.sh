#!/bin/bash

# 检测数据库中包含占位符的文档
# 使用方法：./detect-placeholder-docs.sh

set -e

DB_CONNECTION_STRING="${DB_CONNECTION_STRING:-}"
DB_PATH="${DB_PATH:-/home/alex_chen/OpenDeepWiki/data/KoalaWiki.db}"

echo "======================================"
echo "检测数据库中包含占位符的文档"
if [[ -n "$DB_CONNECTION_STRING" ]]; then
    echo "连接字符串: ${DB_CONNECTION_STRING}"
else
    echo "数据库路径: $DB_PATH"
fi
echo "======================================"
echo ""

# 如果提供了连接字符串，优先使用连接字符串
if [[ -n "$DB_CONNECTION_STRING" ]]; then
    if [[ "$DB_CONNECTION_STRING" == *"Data Source"* ]]; then
        # SQLite 连接字符串，提取文件路径
        DB_PATH=$(echo "$DB_CONNECTION_STRING" | sed -E 's/.*Data Source=([^;]+).*/\1/')
    elif [[ "$DB_CONNECTION_STRING" == *"Host="* ]]; then
        USE_POSTGRES=true
    fi
fi

if [[ "${USE_POSTGRES:-false}" == true ]]; then
    if ! command -v psql >/dev/null 2>&1; then
        echo "错误：检测到使用 PostgreSQL，但未找到 psql 命令。请安装 psql 或在容器内执行该脚本。"
        exit 1
    fi

    declare -A PG_PARAMS
    IFS=';' read -ra CONN_PARTS <<< "$DB_CONNECTION_STRING"
    for part in "${CONN_PARTS[@]}"; do
        [[ -z "$part" ]] && continue
        key=$(echo "${part%%=*}" | tr '[:upper:]' '[:lower:]' | xargs)
        value=$(echo "${part#*=}" | xargs)
        case "$key" in
            host) PG_PARAMS[host]="$value" ;;
            port) PG_PARAMS[port]="$value" ;;
            database|dbname) PG_PARAMS[dbname]="$value" ;;
            username|user) PG_PARAMS[user]="$value" ;;
            password|pwd) PG_PARAMS[password]="$value" ;;
        esac
    done

    PGHOST="${PG_PARAMS[host]:-localhost}"
    PGPORT="${PG_PARAMS[port]:-5432}"
    PGDATABASE="${PG_PARAMS[dbname]:-postgres}"
    PGUSER="${PG_PARAMS[user]:-$USER}"
    PGPASSWORD="${PG_PARAMS[password]:-}"

    export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD

    echo "🔍 通过 PostgreSQL 连接扫描占位符..."
    echo ""

    SQL=$(cat <<'EOF'
SELECT
    d.Id,
    d.WarehouseId,
    d.Title,
    LEFT(d.Content, 100) AS ContentPreview,
    d.CreateTime
FROM "DocumentPending" d
WHERE
    d.Content LIKE '%（扩展至%字%）%'
    OR d.Content LIKE '%（约%字%）%'
    OR d.Content LIKE '%（%约%字%）%'
    OR d.Content LIKE '%（%字%）%'
    OR d.Content LIKE '%(约%字%)%'
    OR d.Content LIKE '%(%约%字%)%'
    OR d.Content LIKE '%(%字%)%'
    OR d.Content LIKE '%(extend to%words%)%'
    OR d.Content LIKE '%<del%（%约%字%）%'
    OR d.Content LIKE '%<del%(约%字%)%'
    OR d.Content LIKE '%<del%（%字%）%'
    OR d.Content LIKE '%~~%（%约%字%）%'
    OR d.Content LIKE '%~~%(约%字%)%'
    OR d.Content LIKE '%~~%（%字%）%'
    OR d.Content LIKE '%[TODO%]%'
    OR d.Content LIKE '%[扩展%]%'
    OR d.Content LIKE '%包括故障排除...）%'
    OR d.Content LIKE '%包括 QEMU 测试...）%'
    OR d.Content LIKE '%包括%...）%'
ORDER BY d.CreateTime DESC;
EOF
)

    RESULT=$(psql -v "ON_ERROR_STOP=1" -t -A -F '|' -c "$SQL")

    if [[ -z "$RESULT" ]]; then
        echo "✅ 未发现包含占位符的文档！"
        exit 0
    fi

    echo "❌ 发现包含占位符的文档："
    echo ""
    echo "Id | WarehouseId | Title | ContentPreview | CreateTime"
    echo "$RESULT" | sed 's/|/ | /g'
    echo ""

    COUNT=$(echo "$RESULT" | wc -l | tr -d ' ')
    echo "======================================"
    echo "总计: $COUNT 个文档包含占位符"
    echo "======================================"
    echo ""

    echo "📝 处理建议："
    echo "1. 方案A：在数据库中删除这些文档记录，重新生成"
    echo "   DELETE FROM \"DocumentPending\" WHERE Content LIKE '%（扩展至%字%）%';"
    echo ""
    echo "2. 方案B：清理占位符文本（保留其他内容）"
    echo "   运行: scripts/clean-placeholder-docs.py（当前仅支持 SQLite，可根据需要扩展为 PostgreSQL）"
    echo ""
    echo "3. 方案C：标记为需要重新生成"
    echo "   UPDATE \"DocumentPending\" SET \"Status\"='Pending' WHERE Content LIKE '%（扩展至%字%）%';"
    echo ""

    exit 1
fi

# 检查数据库是否存在
if [ ! -f "$DB_PATH" ]; then
    echo "错误：数据库文件不存在: $DB_PATH"
    echo "提示：如使用 PostgreSQL，请设置 DB_CONNECTION_STRING 环境变量，或在 docker-compose 中配置。"
    exit 1
fi

# 占位符模式（使用 SQL LIKE 和 REGEXP）
PATTERNS=(
    "（扩展至%字%）"
    "（约%字%）"
    "（%约%字%）"
    "（%字%）"
    "(约%字%)"
    "(%约%字%)"
    "(%字%)"
    "<del%（%约%字%）%"
    "<del%(约%字%)%"
    "<del%（%字%）%"
    "~~%（%约%字%）%"
    "~~%(约%字%)%"
    "~~%（%字%）%"
    "(extend to%words%)"
    "[TODO%]"
    "[扩展%]"
    "包括故障排除...）"
    "包括 QEMU 测试...）"
    "包括%...）"
)

echo "🔍 扫描包含占位符的文档..."
echo ""

# 创建临时 SQL 文件
TEMP_SQL=$(mktemp)

cat > "$TEMP_SQL" << 'EOF'
.headers on
.mode column

-- 查找包含占位符的文档
SELECT
    Id,
    WarehouseId,
    Title,
    SUBSTR(Content, 1, 100) AS ContentPreview,
    CreateTime
FROM DocumentPending
WHERE
    Content LIKE '%（扩展至%字%）%'
    OR Content LIKE '%（约%字%）%'
    OR Content LIKE '%（%约%字%）%'
    OR Content LIKE '%（%字%）%'
    OR Content LIKE '%(约%字%)%'
    OR Content LIKE '%(%约%字%)%'
    OR Content LIKE '%(%字%)%'
    OR Content LIKE '%(extend to%words%)%'
    OR Content LIKE '%<del%（%约%字%）%'
    OR Content LIKE '%<del%(约%字%)%'
    OR Content LIKE '%<del%（%字%）%'
    OR Content LIKE '%~~%（%约%字%）%'
    OR Content LIKE '%~~%(约%字%)%'
    OR Content LIKE '%~~%（%字%）%'
    OR Content LIKE '%[TODO%]%'
    OR Content LIKE '%[扩展%]%'
    OR Content LIKE '%包括故障排除...）%'
    OR Content LIKE '%包括 QEMU 测试...）%'
    OR Content LIKE '%包括%...）%'
ORDER BY CreateTime DESC;
EOF

# 执行查询
RESULT=$(sqlite3 "$DB_PATH" < "$TEMP_SQL")

# 清理临时文件
rm -f "$TEMP_SQL"

# 检查结果
if [ -z "$RESULT" ] || [ "$RESULT" = "Id|WarehouseId|Title|ContentPreview|CreateTime" ]; then
    echo "✅ 未发现包含占位符的文档！"
    exit 0
fi

echo "❌ 发现包含占位符的文档："
echo ""
echo "$RESULT"
echo ""

# 统计数量
COUNT=$(echo "$RESULT" | tail -n +2 | wc -l)
echo "======================================"
echo "总计: $COUNT 个文档包含占位符"
echo "======================================"
echo ""

# 提供处理建议
echo "📝 处理建议："
echo "1. 方案A：删除这些文档，重新生成（推荐）"
echo "   DELETE FROM DocumentPending WHERE Content LIKE '%（扩展至%字%）%';"
echo ""
echo "2. 方案B：清理占位符文本（保留其他内容）"
echo "   运行: ./clean-placeholder-docs.sh"
echo ""
echo "3. 方案C：标记为需要重新生成"
echo "   UPDATE DocumentPending SET Status='Pending' WHERE Content LIKE '%（扩展至%字%）%';"
echo ""

exit 1
