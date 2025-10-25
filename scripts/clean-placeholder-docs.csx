#!/usr/bin/env dotnet-script
#r "nuget: Microsoft.Data.Sqlite, 8.0.0"

using System;
using Microsoft.Data.Sqlite;
using System.Text.RegularExpressions;

// 数据库路径
var dbPath = Environment.GetEnvironmentVariable("DB_PATH")
    ?? "/home/alex_chen/OpenDeepWiki/data/KoalaWiki.db";
var connectionStringEnv = Environment.GetEnvironmentVariable("DB_CONNECTION_STRING") ?? string.Empty;

if (!string.IsNullOrEmpty(connectionStringEnv) &&
    connectionStringEnv.Contains("Host=", StringComparison.OrdinalIgnoreCase))
{
    Console.WriteLine("❌ 当前脚本仅支持 SQLite。检测到 PostgreSQL 连接字符串，请在数据库中直接执行清理或扩展脚本以支持 PostgreSQL。");
    return 1;
}

Console.WriteLine("======================================");
Console.WriteLine("清理包含占位符的文档");
Console.WriteLine($"数据库路径: {dbPath}");
Console.WriteLine("======================================");
Console.WriteLine();

if (!File.Exists(dbPath))
{
    Console.WriteLine($"❌ 错误：数据库文件不存在: {dbPath}");
    return 1;
}

// 占位符模式
var placeholderPatterns = new[]
{
    @"(?:(?:<del>\s*)|(?:~~\s*))?（扩展至\s*[\d,]+\s*字[^）]*）(?:\s*</del>|~~)?",
    @"(?:(?:<del>\s*)|(?:~~\s*))?（约\s*[\d,]+\s*字[^）]*）(?:\s*</del>|~~)?",
    @"(?:(?:<del>\s*)|(?:~~\s*))?（[^（）]*约\s*[\d,]+\s*字[^（）]*）(?:\s*</del>|~~)?",
    @"(?:(?:<del>\s*)|(?:~~\s*))?（[\d,]+\s*字[^）]*）(?:\s*</del>|~~)?",
    @"(?:(?:<del>\s*)|(?:~~\s*))?\(约\s*[\d,]+\s*字[^)]*\)(?:\s*</del>|~~)?",
    @"(?:(?:<del>\s*)|(?:~~\s*))?\([^()]*约\s*[\d,]+\s*字[^()]*\)(?:\s*</del>|~~)?",
    @"(?:(?:<del>\s*)|(?:~~\s*))?\([\d,]+\s*字[^)]*\)(?:\s*</del>|~~)?",
    @"(?:(?:<del>\s*)|(?:~~\s*))?\(extend\s+to\s+[\d,]+\s+words[^)]*\)(?:\s*</del>|~~)?",
    @"\[TODO[^\]]*\]",
    @"\[扩展[^\]]*\]",
    @"包括故障排除\.\.\.）",
    @"包括\s+QEMU\s+测试\.\.\.）",
    @"包括[^)]*\.\.\.）",
};

var sqliteConnectionString = $"Data Source={dbPath}";

using var connection = new SqliteConnection(sqliteConnectionString);
connection.Open();

// 查询所有文档
Console.WriteLine("🔍 扫描文档...");
var selectCmd = connection.CreateCommand();
selectCmd.CommandText = @"
    SELECT Id, WarehouseId, Title, Content, CreateTime
    FROM DocumentPending
    ORDER BY CreateTime DESC";

var documentsWithPlaceholders = new List<(long Id, string WarehouseId, string Title, List<string> Placeholders)>();

using (var reader = selectCmd.ExecuteReader())
{
    while (reader.Read())
    {
        var id = reader.GetInt64(0);
        var warehouseId = reader.GetString(1);
        var title = reader.GetString(2);
        var content = reader.GetString(3);

        var foundPlaceholders = new List<string>();

        foreach (var pattern in placeholderPatterns)
        {
            var regex = new Regex(pattern, RegexOptions.IgnoreCase);
            var matches = regex.Matches(content);

            foreach (Match match in matches)
            {
                if (!foundPlaceholders.Contains(match.Value))
                {
                    foundPlaceholders.Add(match.Value);
                }
            }
        }

        if (foundPlaceholders.Count > 0)
        {
            documentsWithPlaceholders.Add((id, warehouseId, title, foundPlaceholders));
        }
    }
}

if (documentsWithPlaceholders.Count == 0)
{
    Console.WriteLine("✅ 未发现包含占位符的文档！");
    return 0;
}

Console.WriteLine($"❌ 发现 {documentsWithPlaceholders.Count} 个包含占位符的文档：");
Console.WriteLine();

foreach (var (id, warehouseId, title, placeholders) in documentsWithPlaceholders)
{
    Console.WriteLine($"📄 ID: {id}");
    Console.WriteLine($"   仓库: {warehouseId}");
    Console.WriteLine($"   标题: {title}");
    Console.WriteLine($"   占位符数量: {placeholders.Count}");
    Console.WriteLine($"   示例: {placeholders[0]}");
    Console.WriteLine();
}

// 询问是否删除
Console.WriteLine("======================================");
Console.WriteLine($"总计: {documentsWithPlaceholders.Count} 个文档包含占位符");
Console.WriteLine("======================================");
Console.WriteLine();
Console.Write("是否删除这些文档？(yes/no): ");
var response = Console.ReadLine()?.Trim().ToLower();

if (response != "yes" && response != "y")
{
    Console.WriteLine("❌ 操作已取消");
    return 0;
}

// 执行删除
Console.WriteLine();
Console.WriteLine("🗑️  正在删除文档...");

var deleteCmd = connection.CreateCommand();
deleteCmd.CommandText = "DELETE FROM DocumentPending WHERE Id = @id";
deleteCmd.Parameters.Add("@id", SqliteType.Integer);

var deletedCount = 0;
foreach (var (id, _, title, _) in documentsWithPlaceholders)
{
    deleteCmd.Parameters["@id"].Value = id;
    deleteCmd.ExecuteNonQuery();
    deletedCount++;
    Console.WriteLine($"✅ 已删除: {title}");
}

Console.WriteLine();
Console.WriteLine($"✅ 成功删除 {deletedCount} 个文档");
Console.WriteLine();
Console.WriteLine("📝 下一步：");
Console.WriteLine("1. 确保后端服务已更新（包含新的 GenerateDocs.md prompt）");
Console.WriteLine("2. 重新启动后端服务");
Console.WriteLine("3. 系统将自动重新生成这些文档（不再包含占位符）");

return 0;
