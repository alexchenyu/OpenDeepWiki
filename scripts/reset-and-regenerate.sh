#!/bin/bash
# 清空数据库，触发完整重新生成
# 使用方法：./scripts/reset-and-regenerate.sh

set -e

echo "======================================"
echo "完整重新生成所有文档"
echo "======================================"
echo ""
echo "⚠️  警告：此操作将："
echo "   1. 停止所有服务"
echo "   2. 删除现有数据库"
echo "   3. 重新启动服务"
echo "   4. 系统将自动重新分析和生成所有文档"
echo ""
read -p "确认继续？(yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ 操作已取消"
    exit 0
fi

echo ""
echo "1️⃣ 停止服务..."
docker-compose down

echo ""
echo "2️⃣ 备份现有数据库..."
if [ -f data/KoalaWiki.db ]; then
    BACKUP_FILE="data/KoalaWiki.db.backup.$(date +%Y%m%d_%H%M%S)"
    cp data/KoalaWiki.db "$BACKUP_FILE"
    echo "✅ 数据库已备份到: $BACKUP_FILE"
fi

echo ""
echo "3️⃣ 删除数据库和缓存..."
rm -f data/KoalaWiki.db
rm -f data/KoalaWiki.db-shm
rm -f data/KoalaWiki.db-wal
echo "✅ 数据库已删除"

echo ""
echo "4️⃣ 重新启动服务..."
docker-compose up -d koalawiki

echo ""
echo "======================================"
echo "✅ 服务已重启"
echo "======================================"
echo ""
echo "📝 接下来："
echo "1. 访问 http://localhost:8080"
echo "2. 重新添加仓库或等待自动扫描"
echo "3. 系统将使用新的 Prompt 生成文档（不再包含占位符）"
echo ""
echo "📊 查看日志："
echo "   docker-compose logs -f koalawiki"
