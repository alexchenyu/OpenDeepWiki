#!/usr/bin/env dotnet-script
#r "nuget: Microsoft.EntityFrameworkCore.Sqlite, 9.0.0"
#r "nuget: Serilog, 4.0.0"

/*
 * 批量清理数据库中已存在文档的占位符和删除线标记
 * 用法: dotnet script scripts/clean-existing-placeholders.csx [--dry-run]
 *
 * 参数:
 *   --dry-run    仅显示将要清理的文档，不实际修改数据库
 */

using System;
using System.Linq;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;

var dryRun = Args.Contains("--dry-run");

Console.WriteLine("=== 清理已存在文档的占位符 ===");
Console.WriteLine($"模式: {(dryRun ? "模拟运行（不修改数据库）" : "实际清理")}");
Console.WriteLine();

// 占位符模式
var placeholderPatterns = new[]
{
    // 全角括号 - 中文字数占位符
    @"（\s*扩展至\s*[\d,]+\s*字[^）]*\）",
    @"（\s*约\s*[\d,]+\s*字[^）]*\）",
    @"（[^（）]*约\s*[\d,]+\s*字[^（）]*\）",
    @"（\s*[\d,]+\s*字[^）]*\）",

    // 半角括号 - 中文字数占位符
    @"\(\s*扩展至\s*[\d,]+\s*字[^)]*\)",
    @"\(\s*约\s*[\d,]+\s*字[^)]*\)",
    @"\([^()]*约\s*[\d,]+\s*字[^()]*\)",
    @"\(\s*[\d,]+\s*字[^)]*\)",

    // 英文字数占位符
    @"\(\s*extend\s+to\s+[\d,]+\s+words[^)]*\)",
    @"\(\s*about\s+[\d,]+\s+words[^)]*\)",
    @"\(\s*approx\.?\s+[\d,]+\s+words[^)]*\)",
    @"\(\s*~[\d,]+\s+words[^)]*\)",

    // TODO 和扩展标记
    @"\[TODO[^\]]*\]",
    @"\[扩展[^\]]*\]",
    @"\[expand\s+this\s+section\]",

    // 省略号 + 字数提示
    @"\.\.\.[^.]{0,30}字[^.]{0,30}\.\.\.",
    @"\.{3,}\s*\d+\s*字\s*\.{3,}",

    // 通用占位符文本
    @"further\s+details\s+to\s+be\s+added",
    @"more\s+content\s+here",
    @"to\s+be\s+completed",
    @"placeholder\s+text",

    // 特定格式的不完整句子
    @"包括故障排除\.\.\.\）",
    @"包括\s+QEMU\s+测试\.\.\.\）",
    @"包括[^。，！？\n]{0,20}\.\.\.[）)]",
};

string CleanContent(string content)
{
    if (string.IsNullOrWhiteSpace(content))
        return content;

    var result = content;

    // 第一步：移除 <del> 标签
    result = Regex.Replace(result, @"<del[^>]*>(.*?)</del>", "$1", RegexOptions.IgnoreCase | RegexOptions.Singleline);

    // 第二步：移除 ~~ 删除线
    result = Regex.Replace(result, @"~~(.+?)~~", "$1", RegexOptions.Multiline);

    // 第三步：清理占位符
    foreach (var pattern in placeholderPatterns)
    {
        var regex = new Regex(pattern, RegexOptions.IgnoreCase | RegexOptions.Multiline);
        result = regex.Replace(result, "");
    }

    // 第四步：清理空标签和空白
    result = Regex.Replace(result, @"<del>\s*</del>", "", RegexOptions.IgnoreCase | RegexOptions.Multiline);
    result = Regex.Replace(result, @"~~\s*~~", "", RegexOptions.Multiline);
    result = Regex.Replace(result, @"\n{3,}", "\n\n");
    result = Regex.Replace(result, @" {2,}", " ", RegexOptions.Multiline);
    result = Regex.Replace(result, @"^\s+", "", RegexOptions.Multiline);
    result = Regex.Replace(result, @"\s+$", "", RegexOptions.Multiline);

    return result.Trim();
}

bool HasPlaceholdersOrDeletions(string content)
{
    if (string.IsNullOrWhiteSpace(content))
        return false;

    // 检查是否包含 <del> 或 ~~
    if (content.Contains("<del>") || content.Contains("~~"))
        return true;

    // 检查是否包含占位符
    foreach (var pattern in placeholderPatterns)
    {
        var regex = new Regex(pattern, RegexOptions.IgnoreCase | RegexOptions.Multiline);
        if (regex.IsMatch(content))
            return true;
    }

    return false;
}

try
{
    // 连接数据库（需要根据实际配置修改）
    var connectionString = Environment.GetEnvironmentVariable("DB_CONNECTION_STRING")
        ?? "Data Source=/data/koalawiki.db";

    Console.WriteLine($"数据库连接: {connectionString}");
    Console.WriteLine();

    // 注意：这里需要根据实际的 Entity Framework 模型来实现
    // 这是一个示例代码，需要根据实际情况调整

    Console.WriteLine("⚠️  注意：此脚本需要在实际项目中运行，并根据项目的 DbContext 进行调整");
    Console.WriteLine();
    Console.WriteLine("建议使用以下 C# 代码在实际项目中运行：");
    Console.WriteLine(@"
// 在项目中运行的代码示例
using var dbContext = serviceProvider.GetRequiredService<IKoalaWikiContext>();

var documentsToClean = await dbContext.DocumentFileItems
    .Where(d => d.Content != null && d.Content.Length > 0)
    .ToListAsync();

int cleanedCount = 0;
int totalCount = documentsToClean.Count;

foreach (var doc in documentsToClean)
{
    var cleaned = DocumentQualityValidator.RemovePlaceholders(doc.Content);

    if (cleaned != doc.Content)
    {
        doc.Content = cleaned;
        cleanedCount++;
        Console.WriteLine($""清理文档: {doc.Title} (ID: {doc.Id})"");
    }
}

if (cleanedCount > 0)
{
    await dbContext.SaveChangesAsync();
    Console.WriteLine($""\n✓ 成功清理 {cleanedCount}/{totalCount} 个文档"");
}
else
{
    Console.WriteLine(""\n✓ 没有需要清理的文档"");
}
    ");

}
catch (Exception ex)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine($"错误: {ex.Message}");
    Console.ResetColor();
    Environment.Exit(1);
}

Console.WriteLine("\n=== 完成 ===");
