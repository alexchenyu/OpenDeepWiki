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
    // Token限制：为系统提示、格式化和输出预留空间
    private const int SystemPromptReservedTokens = 8000; // system prompt 通常较长，增加预留
    private const int FormattingReservedTokens = 2000;   // 格式化标签和标题
    private const int OutputReservedTokens = 16384;      // LLM 输出空间（max_tokens）
    private const int HistoryReservedTokens = 50000;     // 历史对话预留空间（mem0会累积历史）
    private const double CharsPerToken = 2.5; // 更保守的估算（中文+代码混合）

    // GLM-4.6-FP8 的实际 context window
    private const int GLM46ContextWindow = 202752;

    // 实际可用的最大token数量（扣除所有预留空间）
    private static int MaxAllowedInputTokens =>
        GLM46ContextWindow - SystemPromptReservedTokens - FormattingReservedTokens - OutputReservedTokens - HistoryReservedTokens;
    
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
        return estimatedTokens > MaxAllowedInputTokens;
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

            logger.LogInformation("开始处理 warehouse {WarehouseId} ({WarehouseName})，共 {CatalogCount} 个目录",
                warehouse.Id, warehouse.Name, catalogs.Count);

            int catalogProcessed = 0;
            int catalogSuccess = 0;
            int catalogFailed = 0;

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
                            logger.LogWarning(
                                "目录 {Catalog} 内容过长 (约 {EstimatedTokens} tokens，限制 {MaxTokens} tokens)，将截断内容",
                                catalog.Name, estimatedTokens, MaxAllowedInputTokens);

                            content.Content = TruncateContent(content.Content, MaxAllowedInputTokens);
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

                        Interlocked.Increment(ref catalogSuccess);
                        var processed = Interlocked.Increment(ref catalogProcessed);

                        if (processed % 10 == 0)
                        {
                            logger.LogInformation("目录处理进度: {Processed}/{Total} (成功: {Success}, 失败: {Failed})",
                                processed, catalogs.Count, catalogSuccess, catalogFailed);
                        }

                        break; // 成功则跳出重试循环
                    }
                    catch (Exception ex)
                    {
                        retryCount++;

                        // 检查是否是token超限错误
                        var isTokenError = ex.Message.Contains("maximum context length") ||
                                          ex.Message.Contains("tokens") ||
                                          ex.Message.Contains("context window");

                        if (retryCount >= maxRetries)
                        {
                            Interlocked.Increment(ref catalogFailed);
                            Interlocked.Increment(ref catalogProcessed);

                            logger.LogError(ex,
                                "处理目录 {Catalog} 时发生错误，已重试 {RetryCount} 次。错误类型: {ErrorType}。详细信息: {Message}",
                                catalog.Name, retryCount,
                                isTokenError ? "Token超限" : "其他错误",
                                ex.Message);
                        }
                        else
                        {
                            logger.LogWarning(ex,
                                "处理目录 {Catalog} 时发生错误，重试第 {RetryCount} 次。错误: {Message}",
                                catalog.Name, retryCount, ex.Message);
                            await Task.Delay(1000 * retryCount, ct); // 指数退避
                        }
                    }
                }
            });

            logger.LogInformation("目录处理完成: 成功 {Success}/{Total}, 失败 {Failed}",
                catalogSuccess, catalogs.Count, catalogFailed);

            var fileParallelOptions = new ParallelOptions
            {
                CancellationToken = stoppingToken,
                MaxDegreeOfParallelism = 3 // 可根据需要调整并发数
            };

            logger.LogInformation("开始处理 warehouse {WarehouseId} 的代码文件，共 {FileCount} 个文件",
                warehouse.Id, files.Count);

            int fileProcessed = 0;
            int fileSuccess = 0;
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
                        logger.LogWarning(
                            "文件 {File} 内容过长 (约 {EstimatedTokens} tokens，限制 {MaxTokens} tokens)，将截断内容",
                            file.Name, estimatedTokens, MaxAllowedInputTokens);

                        content = TruncateContent(content, MaxAllowedInputTokens);
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

                    Interlocked.Increment(ref fileSuccess);
                    var processed = Interlocked.Increment(ref fileProcessed);

                    if (processed % 50 == 0)
                    {
                        logger.LogInformation("文件处理进度: {Processed}/{Total} (成功: {Success}, 失败: {Failed})",
                            processed, files.Count, fileSuccess, fileFailureCount);
                    }
                }
                catch (Exception ex)
                {
                    Interlocked.Increment(ref fileFailureCount);
                    Interlocked.Increment(ref fileProcessed);

                    // 检查是否是token超限错误
                    var isTokenError = ex.Message.Contains("maximum context length") ||
                                      ex.Message.Contains("tokens") ||
                                      ex.Message.Contains("context window");

                    logger.LogError(ex,
                        "处理文件 {File} 时发生错误。错误类型: {ErrorType}。详细信息: {Message}",
                        file.Name,
                        isTokenError ? "Token超限" : "其他错误",
                        ex.Message);

                    if (fileFailureCount >= fileFailureThreshold)
                    {
                        logger.LogError("文件处理连续失败超过阈值({Threshold})，触发熔断，停止后续处理。", fileFailureThreshold);
                        circuitBroken = true;
                    }
                }
            });

            logger.LogInformation("文件处理完成: 成功 {Success}/{Total}, 失败 {Failed}",
                fileSuccess, files.Count, fileFailureCount);

            // 完成后清理该warehouse的历史，避免下次处理时累积
            try
            {
                logger.LogInformation("清理 warehouse {WarehouseId} 的历史mem0记忆", warehouse.Id);
                await client.DeleteAllAsync(warehouse.Id, cancellationToken: stoppingToken);
                logger.LogInformation("成功清理 warehouse {WarehouseId} 的历史记忆", warehouse.Id);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "清理 warehouse {WarehouseId} 历史记忆失败", warehouse.Id);
            }

            await dbContext.Warehouses
                .Where(x => x.Id == warehouse.Id)
                .ExecuteUpdateAsync(x => x.SetProperty(a => a.IsEmbedded, true), stoppingToken);

            logger.LogInformation("完成 warehouse {WarehouseId} ({WarehouseName}) 的处理",
                warehouse.Id, warehouse.Name);
        }
    }
}