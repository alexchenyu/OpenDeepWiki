#!/bin/bash
# 只清空生成的文档，保留仓库配置和用户数据
# 使用方法：./scripts/clear-documents-only.sh

set -e

DB_PATH="${DB_PATH:-./data/KoalaWiki.db}"

echo "======================================"
echo "清空所有生成的文档"
echo "======================================"
echo ""
echo "此操作将："
echo "   ✅ 保留：用户账号、仓库配置、权限设置"
echo "   🗑️  删除：所有生成的文档内容"
echo "   🔄 系统将自动重新生成文档（使用新 Prompt）"
echo ""
read -p "确认继续？(yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ 操作已取消"
    exit 0
fi

if [ ! -f "$DB_PATH" ]; then
    echo "❌ 错误：数据库文件不存在: $DB_PATH"
    exit 1
fi

echo ""
echo "1️⃣ 备份数据库..."
BACKUP_FILE="${DB_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
cp "$DB_PATH" "$BACKUP_FILE"
echo "✅ 已备份到: $BACKUP_FILE"

echo ""
echo "2️⃣ 清空文档表..."

# 使用 Python 执行 SQL（因为没有 sqlite3 命令）
python3 << 'PYTHON_EOF'
import sqlite3
import os

db_path = os.getenv('DB_PATH', './data/KoalaWiki.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 清空文档相关的表
tables_to_clear = [
    'DocumentFileItems',
    'DocumentFileItemSources',
    'DocumentCatalogs',
    'DocumentOverviews',
    'DocumentCommitRecords',
    'MiniMaps',
]

for table in tables_to_clear:
    try:
        cursor.execute(f'SELECT COUNT(*) FROM {table}')
        count = cursor.fetchone()[0]
        if count > 0:
            cursor.execute(f'DELETE FROM {table}')
            print(f'✅ {table}: 已删除 {count} 条记录')
        else:
            print(f'   {table}: 无记录')
    except Exception as e:
        print(f'⚠️  {table}: {e}')

conn.commit()
conn.close()
print('\n✅ 文档清空完成')
PYTHON_EOF

echo ""
echo "3️⃣ 重启服务以触发重新生成..."
docker-compose restart koalawiki

echo ""
echo "======================================"
echo "✅ 完成！"
echo "======================================"
echo ""
echo "📝 系统将自动重新生成所有文档"
echo "📊 查看进度："
echo "   docker-compose logs -f koalawiki"
echo ""
echo "⏱️  预计耗时：根据仓库大小，可能需要几分钟到几小时"
