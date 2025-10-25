#!/usr/bin/env python3
"""
清理包含占位符的文档
"""

import sqlite3
import os
import re
import sys

# 数据库路径
DB_PATH = os.getenv('DB_PATH', '/home/alex_chen/OpenDeepWiki/data/KoalaWiki.db')
DB_CONNECTION_STRING = os.getenv('DB_CONNECTION_STRING', '')

if 'Host=' in DB_CONNECTION_STRING:
    print("❌ 当前脚本仅支持 SQLite。检测到 PostgreSQL 连接字符串，请在数据库中直接执行清理或扩展脚本以支持 PostgreSQL。")
    sys.exit(1)

# 占位符模式
PLACEHOLDER_PATTERNS = [
    r'(?:(?:<del>\s*)|(?:~~\s*))?（扩展至\s*[\d,]+\s*字[^）]*）(?:\s*</del>|~~)?',
    r'(?:(?:<del>\s*)|(?:~~\s*))?（约\s*[\d,]+\s*字[^）]*）(?:\s*</del>|~~)?',
    r'(?:(?:<del>\s*)|(?:~~\s*))?（[^（）]*约\s*[\d,]+\s*字[^（）]*）(?:\s*</del>|~~)?',
    r'(?:(?:<del>\s*)|(?:~~\s*))?（[\d,]+\s*字[^）]*）(?:\s*</del>|~~)?',
    r'(?:(?:<del>\s*)|(?:~~\s*))?\(约\s*[\d,]+\s*字[^)]*\)(?:\s*</del>|~~)?',
    r'(?:(?:<del>\s*)|(?:~~\s*))?\([^()]*约\s*[\d,]+\s*字[^()]*\)(?:\s*</del>|~~)?',
    r'(?:(?:<del>\s*)|(?:~~\s*))?\([\d,]+\s*字[^)]*\)(?:\s*</del>|~~)?',
    r'(?:(?:<del>\s*)|(?:~~\s*))?\(extend\s+to\s+[\d,]+\s+words[^)]*\)(?:\s*</del>|~~)?',
    r'\[TODO[^\]]*\]',
    r'\[扩展[^\]]*\]',
    r'包括故障排除\.\.\.）',
    r'包括\s+QEMU\s+测试\.\.\.）',
    r'包括[^)]*\.\.\.）',
]

def main():
    print("=" * 60)
    print("清理包含占位符的文档")
    print(f"数据库路径: {DB_PATH}")
    print("=" * 60)
    print()

    if not os.path.exists(DB_PATH):
        print(f"❌ 错误：数据库文件不存在: {DB_PATH}")
        return 1

    # 连接数据库
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 查询所有文档
    print("🔍 扫描文档...")
    cursor.execute("""
        SELECT
            dfi.Id,
            dc.WarehouseId,
            dfi.Title,
            dfi.Content,
            dfi.CreatedAt
        FROM DocumentFileItems dfi
        LEFT JOIN DocumentCatalogs dc ON dfi.DocumentCatalogId = dc.Id
        WHERE dfi.Content IS NOT NULL AND dfi.Content != ''
        ORDER BY dfi.CreatedAt DESC
    """)

    documents_with_placeholders = []

    for row in cursor.fetchall():
        doc_id, warehouse_id, title, content, create_time = row
        found_placeholders = []

        for pattern in PLACEHOLDER_PATTERNS:
            matches = re.findall(pattern, content, re.IGNORECASE)
            for match in matches:
                if match not in found_placeholders:
                    found_placeholders.append(match)

        if found_placeholders:
            documents_with_placeholders.append({
                'id': doc_id,
                'warehouse_id': warehouse_id,
                'title': title,
                'placeholders': found_placeholders
            })

    if not documents_with_placeholders:
        print("✅ 未发现包含占位符的文档！")
        conn.close()
        return 0

    print(f"❌ 发现 {len(documents_with_placeholders)} 个包含占位符的文档：")
    print()

    for doc in documents_with_placeholders:
        print(f"📄 ID: {doc['id']}")
        print(f"   仓库: {doc['warehouse_id']}")
        print(f"   标题: {doc['title']}")
        print(f"   占位符数量: {len(doc['placeholders'])}")
        print(f"   示例: {doc['placeholders'][0][:80]}...")
        print()

    print("=" * 60)
    print(f"总计: {len(documents_with_placeholders)} 个文档包含占位符")
    print("=" * 60)
    print()

    # 询问是否删除
    try:
        response = input("是否删除这些文档？(yes/no): ").strip().lower()
    except (KeyboardInterrupt, EOFError):
        print("\n❌ 操作已取消")
        conn.close()
        return 0

    if response not in ('yes', 'y'):
        print("❌ 操作已取消")
        conn.close()
        return 0

    # 执行删除
    print()
    print("🗑️  正在删除文档...")

    deleted_count = 0
    for doc in documents_with_placeholders:
        cursor.execute("DELETE FROM DocumentFileItems WHERE Id = ?", (doc['id'],))
        deleted_count += 1
        print(f"✅ 已删除: {doc['title']}")

    conn.commit()
    conn.close()

    print()
    print(f"✅ 成功删除 {deleted_count} 个文档")
    print()
    print("📝 下一步：")
    print("1. 确保后端服务已更新（包含新的 GenerateDocs.md prompt）")
    print("2. 重新启动后端服务")
    print("3. 系统将自动重新生成这些文档（不再包含占位符）")

    return 0

if __name__ == '__main__':
    sys.exit(main())
