using System.Net.Http.Headers;
using KoalaWiki.Core.Extensions;
using KoalaWiki.Domains.Warehouse;
using KoalaWiki.Infrastructure;
using KoalaWiki.Prompts;
using Mem0.NET;
using Microsoft.EntityFrameworkCore;

namespace KoalaWiki.Mem0;

public class Mem0Rag(IServiceProvider service, ILogger<Mem0Rag> logger) : BackgroundService
{
    // Token限制：为系统提示和输出预留空间
    private const int SystemPromptReservedTokens = 2000;
    private const int OutputReservedTokens = 4000;
    private const double CharsPerToken = 3.5; // 平均每个token约3.5个字符
    
    /// <summary>
    /// 估算文本的token数量
    /// </summary>
    private static int EstimateTokens(string text)
    {
        if (string.IsNullOrEmpty(text))
            return 0;
        return (int)(text.Length / CharsPerToken);
    }
    
    /// <summary>
    /// 检查内容是否超过模型token限制
    /// </summary>
    private bool IsContentTooLong(string content, out int estimatedTokens)
    {
        estimatedTokens = EstimateTokens(content);
        var maxTokens = DocumentsHelper.GetMaxTokens(OpenAIOptions.ChatModel);
        
        if (maxTokens == null)
        {
            // 如果没有配置最大token，使用保守值
            maxTokens = 32000;
        }
        
        var allowedTokens = maxTokens.Value - SystemPromptReservedTokens - OutputReservedTokens;
        return estimatedTokens > allowedTokens;
    }
    
    /// <summary>
    /// 截断内容到允许的token数量
    /// </summary>
    private string TruncateContent(string content, int maxTokens)
    {
        var allowedChars = (int)(maxTokens * CharsPerToken);
        if (content.Length <= allowedChars)
            return content;
            
        return content.Substring(0, allowedChars) + "\n... (内容已截断)";
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(100, stoppingToken);

        if (OpenAIOptions.EnableMem0 == false)
        {
            logger.LogWarning("Mem0功能未启用,");
            return;
        }


        while (!stoppingToken.IsCancellationRequested)
        {
            // 读取现有的仓库
            await using var scope = service.CreateAsyncScope();
            var dbContext = scope.ServiceProvider.GetService<IKoalaWikiContext>();

            var warehouse = await dbContext!.Warehouses
                .Where(x => x.Status == WarehouseStatus.Completed && x.IsEmbedded == false)
                .FirstOrDefaultAsync(stoppingToken);

            if (warehouse == null)
            {
                logger.LogInformation("暂时无需处理文档，等待30s");
                // 如果没有仓库，等待一段时间
                await Task.Delay(1000 * 30, stoppingToken);
                continue;
            }

            var documents = await dbContext.Documents
                .Where(x => x.WarehouseId == warehouse.Id)
                .FirstOrDefaultAsync(stoppingToken);

            var files = DocumentsHelper.GetCatalogueFiles(documents.GitPath);

            var client = new Mem0Client(OpenAIOptions.Mem0ApiKey, OpenAIOptions.Mem0Endpoint, null, null,
                new HttpClient()
                {
                    Timeout = TimeSpan.FromMinutes(600),
                    DefaultRequestHeaders =
                    {
                        UserAgent = { new ProductInfoHeaderValue("KoalaWiki", "1.0") }
                    }
                });

            var catalogs = await dbContext.DocumentCatalogs
                .Where(x => x.DucumentId == documents.Id && x.IsCompleted == true && x.IsDeleted == false)
                .ToListAsync(stoppingToken);

            var parallelOptions = new ParallelOptions
            {
                CancellationToken = stoppingToken,
                MaxDegreeOfParallelism = 3 // 可根据需要调整并发数
            };

            await Parallel.ForEachAsync(catalogs, parallelOptions, async (catalog, ct) =>
            {
                await using var innerScope = service.CreateAsyncScope();
                var innerDbContext = innerScope.ServiceProvider.GetService<IKoalaWikiContext>();

                int retryCount = 0;
                const int maxRetries = 3;
                while (retryCount < maxRetries)
                {
                    try
                    {
                        var content = await innerDbContext!.DocumentFileItems
                            .Where(x => x.DocumentCatalogId == catalog.Id)
                            .FirstOrDefaultAsync(cancellationToken: ct);

                        if (content == null || string.IsNullOrWhiteSpace(content.Content))
                        {
                            logger.LogWarning("目录 {Catalog} 内容为空，跳过", catalog);
                            return;
                        }

                        // 检查内容长度
                        if (IsContentTooLong(content.Content, out var estimatedTokens))
                        {
                            var maxTokens = DocumentsHelper.GetMaxTokens(OpenAIOptions.ChatModel) ?? 32000;
                            var allowedTokens = maxTokens - SystemPromptReservedTokens - OutputReservedTokens;
                            
                            logger.LogWarning(
                                "目录 {Catalog} 内容过长 (约 {EstimatedTokens} tokens，限制 {MaxTokens} tokens)，将截断内容",
                                catalog.Name, estimatedTokens, allowedTokens);
                            
                            content.Content = TruncateContent(content.Content, allowedTokens);
                        }

                        // 获取依赖文件
                        var dependentFiles = await innerDbContext.DocumentFileItemSources
                            .Where(x => x.DocumentFileItemId == content.Id)
                            .Select(x => new
                            {
                                x.DocumentFileItemId,
                                x.Address,
                                x.Name,
                                x.Id,
                                x.CreatedAt
                            })
                            .ToListAsync(cancellationToken: ct);

                        // 处理目录内容
                        await client.AddAsync([
                                new Message
                                {
                                    Role = "system",
                                    Content = await PromptContext.Mem0(nameof(PromptConstant.Mem0.DocsSystem),
                                        new KernelArguments(), OpenAIOptions.ChatModel)
                                },
                                new Message
                                {
                                    Role = "user",
                                    Content = $"""
                                               # {catalog.Name}
                                               <file name="{catalog.Url}">
                                               {content.Content}
                                               </file>
                                               """
                                }
                            ], userId: warehouse.Id, metadata: new Dictionary<string, object>()
                            {
                                { "id", catalog.Id },
                                { "name", catalog.Name },
                                { "url", catalog.Url },
                                { "documentId", documents.Id },
                                { "type", "docs" },
                                { "reference", dependentFiles }
                            },
                            memoryType: "procedural_memory", cancellationToken: ct);
                        break; // 成功则跳出重试循环
                    }
                    catch (Exception ex)
                    {
                        retryCount++;
                        if (retryCount >= maxRetries)
                        {
                            logger.LogError(ex, "处理目录 {Catalog} 时发生错误，已重试 {RetryCount} 次", catalog, retryCount);
                        }
                        else
                        {
                            logger.LogWarning(ex, "处理目录 {Catalog} 时发生错误，重试第 {RetryCount} 次", catalog, retryCount);
                            await Task.Delay(1000 * retryCount, ct); // 指数退避
                        }
                    }
                }
            });

            var fileParallelOptions = new ParallelOptions
            {
                CancellationToken = stoppingToken,
                MaxDegreeOfParallelism = 3 // 可根据需要调整并发数
            };

            int fileFailureCount = 0;
            const int fileFailureThreshold = 5; // 熔断阈值
            bool circuitBroken = false;

            await Parallel.ForEachAsync(files, fileParallelOptions, async (file, ct) =>
            {
                if (circuitBroken)
                    return;

                try
                {
                    // 读取文件内容
                    var content = await File.ReadAllTextAsync(file.Path, ct);

                    if (string.IsNullOrWhiteSpace(content))
                    {
                        logger.LogWarning("文件 {File} 内容为空，跳过", file.Path);
                        return;
                    }

                    // 检查内容长度
                    if (IsContentTooLong(content, out var estimatedTokens))
                    {
                        var maxTokens = DocumentsHelper.GetMaxTokens(OpenAIOptions.ChatModel) ?? 32000;
                        var allowedTokens = maxTokens - SystemPromptReservedTokens - OutputReservedTokens;
                        
                        logger.LogWarning(
                            "文件 {File} 内容过长 (约 {EstimatedTokens} tokens，限制 {MaxTokens} tokens)，将截断内容",
                            file.Name, estimatedTokens, allowedTokens);
                        
                        content = TruncateContent(content, allowedTokens);
                    }

                    // 处理文件内容
                    await client.AddAsync([
                        new Message()
                        {
                            Role = "system",
                            Content = await PromptContext.Mem0(nameof(PromptConstant.Mem0.CodeSystem),
                                new KernelArguments(), OpenAIOptions.ChatModel)
                        },
                        new Message
                        {
                            Role = "user",
                            Content = $"""
                                       ```{file.Path.Replace(documents.GitPath, "").TrimStart("/").TrimStart('\\')}
                                       {content}
                                       ```
                                       """
                        }
                    ], userId: warehouse.Id, memoryType: "procedural_memory", metadata: new Dictionary<string, object>()
                    {
                        { "fileName", file.Name },
                        { "filePath", file.Path },
                        { "fileType", file.Type },
                        { "type", "code" },
                        { "documentId", documents.Id },
                    }, cancellationToken: ct);
                }
                catch (Exception ex)
                {
                    Interlocked.Increment(ref fileFailureCount);
                    logger.LogError(ex, "处理文件 {File} 时发生错误", file);

                    if (fileFailureCount >= fileFailureThreshold)
                    {
                        logger.LogError("文件处理连续失败超过阈值，触发熔断，停止后续处理。");
                        circuitBroken = true;
                    }
                }
            });

            await dbContext.Warehouses
                .Where(x => x.Id == warehouse.Id)
                .ExecuteUpdateAsync(x => x.SetProperty(a => a.IsEmbedded, true), stoppingToken);
        }
    }
}