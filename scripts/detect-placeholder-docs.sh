#!/bin/bash

# 检测数据库中包含占位符的文档
# 使用方法：./detect-placeholder-docs.sh

set -e

DB_PATH="${DB_PATH:-/home/alex_chen/OpenDeepWiki/data/KoalaWiki.db}"

echo "======================================"
echo "检测数据库中包含占位符的文档"
echo "数据库路径: $DB_PATH"
echo "======================================"
echo ""

# 检查数据库是否存在
if [ ! -f "$DB_PATH" ]; then
    echo "错误：数据库文件不存在: $DB_PATH"
    exit 1
fi

# 占位符模式（使用 SQL LIKE 和 REGEXP）
PATTERNS=(
    "（扩展至%字%）"
    "（%字%）"
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
    OR Content LIKE '%（%字%）%'
    OR Content LIKE '%(extend to%words%)%'
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
