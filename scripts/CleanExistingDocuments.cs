/*
 * 批量清理数据库中已存在文档的占位符工具类
 *
 * 使用方法：
 * 1. 在 Startup 或 Program.cs 中调用：
 *    await CleanExistingDocuments.CleanAllAsync(serviceProvider);
 *
 * 2. 或者创建一个 API 端点：
 *    app.MapPost("/admin/clean-placeholders", async (IServiceProvider sp) =>
 *        await CleanExistingDocuments.CleanAllAsync(sp));
 */

using KoalaWiki.KoalaWarehouse;
using Microsoft.EntityFrameworkCore;
using Serilog;

namespace KoalaWiki.Scripts;

public static class CleanExistingDocuments
{
    /// <summary>
    /// 清理所有文档中的占位符和删除线标记
    /// </summary>
    /// <param name="serviceProvider">服务提供程序</param>
    /// <param name="dryRun">是否为模拟运行（不修改数据库）</param>
    /// <returns>清理的文档数量</returns>
    public static async Task<int> CleanAllAsync(IServiceProvider serviceProvider, bool dryRun = false)
    {
        Log.Information("开始清理文档占位符，模式: {Mode}", dryRun ? "模拟运行" : "实际清理");

        try
        {
            using var scope = serviceProvider.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<IKoalaWikiContext>();

            // 获取所有有内容的文档
            var documents = await dbContext.DocumentFileItems
                .Where(d => d.Content != null && d.Content.Length > 0)
                .ToListAsync();

            Log.Information("找到 {Count} 个文档，开始检查...", documents.Count);

            int cleanedCount = 0;
            int totalCount = documents.Count;
            var cleanedDocuments = new List<(string Id, string Title, int OriginalLength, int CleanedLength)>();

            foreach (var doc in documents)
            {
                var originalContent = doc.Content;
                var cleanedContent = DocumentQualityValidator.RemovePlaceholders(originalContent);

                if (cleanedContent != originalContent)
                {
                    if (!dryRun)
                    {
                        doc.Content = cleanedContent;
                    }

                    cleanedCount++;
                    cleanedDocuments.Add((
                        doc.Id,
                        doc.Title,
                        originalContent.Length,
                        cleanedContent.Length
                    ));

                    var removedChars = originalContent.Length - cleanedContent.Length;
                    Log.Information(
                        "清理文档: {Title} (ID: {Id}) - 移除 {Removed} 字符",
                        doc.Title,
                        doc.Id,
                        removedChars
                    );
                }
            }

            if (cleanedCount > 0 && !dryRun)
            {
                await dbContext.SaveChangesAsync();
                Log.Information("✓ 成功清理并保存 {Cleaned}/{Total} 个文档", cleanedCount, totalCount);
            }
            else if (cleanedCount > 0 && dryRun)
            {
                Log.Information("✓ [模拟] 将清理 {Cleaned}/{Total} 个文档（未实际修改）", cleanedCount, totalCount);
            }
            else
            {
                Log.Information("✓ 没有需要清理的文档");
            }

            // 输出详细报告
            if (cleanedDocuments.Count > 0)
            {
                Log.Information("\n=== 清理报告 ===");
                foreach (var (id, title, originalLength, cleanedLength) in cleanedDocuments)
                {
                    var percent = ((originalLength - cleanedLength) * 100.0 / originalLength).ToString("F2");
                    Log.Information(
                        "  - {Title}: {Original} → {Cleaned} 字符 (-{Percent}%)",
                        title,
                        originalLength,
                        cleanedLength,
                        percent
                    );
                }
            }

            return cleanedCount;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "清理文档时发生错误");
            throw;
        }
    }

    /// <summary>
    /// 检查文档是否包含占位符或删除线标记
    /// </summary>
    public static bool HasPlaceholders(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
            return false;

        // 快速检查常见标记
        if (content.Contains("<del>") || content.Contains("~~"))
            return true;

        // 快速检查字数占位符特征
        if (System.Text.RegularExpressions.Regex.IsMatch(content, @"[（(]\s*约?\s*\d+\s*字"))
            return true;

        // 完整验证
        var validationResult = DocumentQualityValidator.ValidateDocument(content);
        return !validationResult.IsValid;
    }

    /// <summary>
    /// 获取包含占位符的文档列表（用于诊断）
    /// </summary>
    public static async Task<List<(string Id, string Title, string[] Placeholders)>> GetDocumentsWithPlaceholdersAsync(
        IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<IKoalaWikiContext>();

        var documents = await dbContext.DocumentFileItems
            .Where(d => d.Content != null && d.Content.Length > 0)
            .ToListAsync();

        var result = new List<(string, string, string[])>();

        foreach (var doc in documents)
        {
            var validationResult = DocumentQualityValidator.ValidateDocument(doc.Content);
            if (!validationResult.IsValid && validationResult.PlaceholdersFound.Length > 0)
            {
                result.Add((doc.Id, doc.Title, validationResult.PlaceholdersFound));
            }
        }

        return result;
    }
}
