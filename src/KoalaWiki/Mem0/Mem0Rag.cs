using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using KoalaWiki.Core.Extensions;
using KoalaWiki.Domains.Warehouse;
using KoalaWiki.Infrastructure;
using KoalaWiki.Prompts;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using System.Text;

namespace KoalaWiki.Mem0;

public class Mem0Rag(IServiceProvider service, ILogger<Mem0Rag> logger) : BackgroundService
{
    // Token限制：为系统提示、格式化和输出预留空间
    private const int SystemPromptReservedTokens = 10000;  // system prompt 通常较长，增加预留
    private const int FormattingReservedTokens = 5000;     // 格式化标签和标题
    private const int OutputReservedTokens = 32768;        // LLM 输出空间（max_tokens），Grok-4可以输出更多
    private const int HistoryReservedTokens = 200000;      // Mem0检索和历史预留（因为有graph store）
    private const double CharsPerToken = 2.5;              // 代码通常2.5-3.5字符=1token

    // Grok-4-fast-reasoning 的实际 context window
    private const int Grok4ContextWindow = 2000000;

    // 实际可用的最大token数量（扣除所有预留空间）
    // Mem0会添加大量检索内容（尤其是graph store）
    // 计算结果: 2000000 - 10000 - 5000 - 32768 - 200000 = 1752232
    // 取70%安全边界: 2000000 * 0.7 = 1400000
    private static int MaxAllowedInputTokens =>
        Math.Min(
            Grok4ContextWindow - SystemPromptReservedTokens - FormattingReservedTokens - OutputReservedTokens - HistoryReservedTokens,
            (int)(Grok4ContextWindow * 0.7) // 单次输入不超过70% context window（Grok-4很大，可以放宽）
        );

    private readonly HttpClient _mem0HttpClient = CreateMem0HttpClient();
    private static readonly JsonSerializerSettings Mem0JsonSettings = new()
    {
        NullValueHandling = NullValueHandling.Ignore,
        DateTimeZoneHandling = DateTimeZoneHandling.Utc
    };
    
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

    private static string SanitizeGraphIdentifier(string? value, string fallback)
    {
        if (string.IsNullOrWhiteSpace(value))
            return fallback;

        var sanitized = Regex.Replace(value, @"[:/\\\s\-.]", "_");
        sanitized = Regex.Replace(sanitized, @"[^0-9A-Za-z_]", "_");
        sanitized = Regex.Replace(sanitized, "_+", "_").Trim('_');

        if (string.IsNullOrEmpty(sanitized))
            sanitized = fallback;

        if (!char.IsLetter(sanitized[0]))
            sanitized = $"REL_{sanitized}";

        return sanitized;
    }

    private static string EscapeAttributeValue(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return string.Empty;
        return value.Replace("\"", "&quot;");
    }

    private sealed record DependentFileInfo(
        string DocumentFileItemId,
        string Address,
        string? Name,
        string Id,
        DateTime CreatedAt);

    private static List<Dictionary<string, object?>> BuildSanitizedReferences(
        IEnumerable<DependentFileInfo> references,
        string documentId)
    {
        var result = new List<Dictionary<string, object?>>();
        foreach (var reference in references)
        {
            var originalName = reference.Name ?? string.Empty;
            var fallback = $"reference_{documentId}_{reference.Id}";
            var sanitizedName = SanitizeGraphIdentifier(originalName, fallback);

            result.Add(new Dictionary<string, object?>
            {
                ["documentFileItemId"] = reference.DocumentFileItemId,
                ["address"] = reference.Address,
                ["name"] = sanitizedName,
                ["originalName"] = originalName,
                ["id"] = reference.Id,
                ["createdAt"] = reference.CreatedAt
            });
        }

        return result;
    }

    private static HttpClient CreateMem0HttpClient()
    {
        if (string.IsNullOrWhiteSpace(OpenAIOptions.Mem0Endpoint))
        {
            throw new InvalidOperationException("Mem0 endpoint is not configured.");
        }

        var baseAddress = OpenAIOptions.Mem0Endpoint.EndsWith("/")
            ? new Uri(OpenAIOptions.Mem0Endpoint)
            : new Uri(OpenAIOptions.Mem0Endpoint + "/");

        var client = new HttpClient
        {
            BaseAddress = baseAddress,
            Timeout = TimeSpan.FromMinutes(10)
        };

        if (!string.IsNullOrWhiteSpace(OpenAIOptions.Mem0ApiKey))
        {
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", OpenAIOptions.Mem0ApiKey);
        }

        client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("KoalaWiki", "1.0"));
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        return client;
    }

    private sealed class Mem0MessagePayload
    {
        [JsonProperty("role")]
        public string Role { get; init; } = string.Empty;

        [JsonProperty("content")]
        public string Content { get; init; } = string.Empty;
    }

    private sealed class Mem0MemoryCreatePayload
    {
        [JsonProperty("messages")]
        public List<Mem0MessagePayload> Messages { get; init; } = new();

        [JsonProperty("user_id")]
        public string? UserId { get; init; }

        [JsonProperty("agent_id")]
        public string? AgentId { get; init; }

        [JsonProperty("run_id")]
        public string? RunId { get; init; }

        [JsonProperty("metadata")]
        public object? Metadata { get; init; }

        [JsonProperty("memory_type")]
        public string? MemoryType { get; init; }

        [JsonProperty("prompt")]
        public string? Prompt { get; init; }
    }

    private async Task SendMem0MemoryAsync(
        List<Mem0MessagePayload> messages,
        string userId,
        object? metadata,
        CancellationToken cancellationToken,
        string? agentId = null,
        string? runId = null,
        string? prompt = null)
    {
        var payload = new Mem0MemoryCreatePayload
        {
            Messages = messages,
            UserId = userId,
            AgentId = agentId,
            RunId = runId,
            Metadata = metadata,
            MemoryType = "procedural_memory",
            Prompt = prompt
        };

        var json = JsonConvert.SerializeObject(payload, Mem0JsonSettings);
        using var request = new HttpRequestMessage(HttpMethod.Post, "memories/")
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };

        using var response = await _mem0HttpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            logger.LogError("Mem0 add failed with status {StatusCode}. Response: {Body}", (int)response.StatusCode, body);
            response.EnsureSuccessStatusCode();
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // 等待更长时间，确保数据库已启动
        await Task.Delay(15000, stoppingToken); // 增加到15秒

        if (OpenAIOptions.EnableMem0 == false)
        {
            logger.LogWarning("Mem0功能未启用,");
            return;
        }

        // 等待数据库连接就绪
        var dbReady = false;
        var retryCount = 0;
        const int maxRetries = 60; // 增加重试次数到60次
        const int delaySeconds = 10; // 增加重试间隔到10秒

        while (!dbReady && retryCount < maxRetries && !stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var testScope = service.CreateAsyncScope();
                var testDbContext = testScope.ServiceProvider.GetService<IKoalaWikiContext>();
                await testDbContext!.Warehouses.AnyAsync(stoppingToken);
                dbReady = true;
                logger.LogInformation("Mem0Rag 服务：数据库连接就绪");
            }
            catch (Exception ex)
            {
                retryCount++;
                logger.LogWarning(ex, "Mem0Rag 服务：等待数据库连接就绪 (尝试 {RetryCount}/{MaxRetries})", retryCount, maxRetries);
                await Task.Delay(TimeSpan.FromSeconds(delaySeconds), stoppingToken); // 等待5秒后重试
            }
        }

        if (!dbReady)
        {
            logger.LogError("Mem0Rag 服务：数据库连接失败，服务退出");
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // 每次循环创建新的 scope，避免长时间持有 DbContext 导致连接问题
                await using var scope = service.CreateAsyncScope();
                var dbContext = scope.ServiceProvider.GetService<IKoalaWikiContext>();

                // 设置命令超时为10分钟，避免在大数据量时读取超时
                if (dbContext is DbContext db)
                {
                    db.Database.SetCommandTimeout(TimeSpan.FromMinutes(10));
                }

                var warehouse = await dbContext!.Warehouses
                    .Where(x => x.Status == WarehouseStatus.Completed && x.IsEmbedded == false)
                    .AsNoTracking() // 不跟踪查询，提高性能
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
                .AsNoTracking() // 不跟踪查询，提高性能
                .FirstOrDefaultAsync(stoppingToken);

            var files = DocumentsHelper.GetCatalogueFiles(documents.GitPath);

            // 为每次处理生成唯一的session ID，避免历史累积
            var sessionId = $"{warehouse.Id}_{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid():N}";
            logger.LogInformation("开始处理 warehouse {WarehouseId}，使用唯一session: {SessionId}",
                warehouse.Id, sessionId);

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
                            .Select(x => new DependentFileInfo(
                                x.DocumentFileItemId,
                                x.Address,
                                x.Name,
                                x.Id,
                                x.CreatedAt))
                            .ToListAsync(cancellationToken: ct);

                        var sanitizedReferences = BuildSanitizedReferences(dependentFiles, documents.Id);
                        var originalFileName = string.IsNullOrWhiteSpace(catalog.Url)
                            ? (string.IsNullOrWhiteSpace(catalog.Name) ? catalog.Id : catalog.Name)
                            : catalog.Url;
                        var sanitizedFileName = SanitizeGraphIdentifier(
                            originalFileName,
                            $"catalog_{catalog.Id}");
                        var sanitizedCatalogName = SanitizeGraphIdentifier(
                            catalog.Name,
                            $"catalog_{catalog.Id}");
                        var sanitizedCatalogUrl = SanitizeGraphIdentifier(
                            catalog.Url,
                            sanitizedFileName);
                        var metadata = new Dictionary<string, object>
                        {
                            ["id"] = catalog.Id,
                            ["name"] = sanitizedCatalogName,
                            ["displayName"] = catalog.Name ?? string.Empty,
                            ["url"] = sanitizedCatalogUrl,
                            ["originalUrl"] = originalFileName,
                            ["documentId"] = documents.Id,
                            ["type"] = "docs",
                            ["reference"] = sanitizedReferences
                        };

                        var mem0Messages = new List<Mem0MessagePayload>
                        {
                            new()
                            {
                                Role = "system",
                                Content = await PromptContext.Mem0(nameof(PromptConstant.Mem0.DocsSystem),
                                    new KernelArguments(), OpenAIOptions.ChatModel)
                            },
                            new()
                            {
                                Role = "user",
                                Content = $"""
                                           # {catalog.Name}
                                           <file name="{sanitizedFileName}" original-name="{EscapeAttributeValue(originalFileName)}">
                                           {content.Content}
                                           </file>
                                           """
                            }
                        };

                        await SendMem0MemoryAsync(mem0Messages, sessionId, metadata, ct);

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
                                          ex.Message.Contains("context window") ||
                                          ex.Message.Contains("too long");

                        if (isTokenError && retryCount < maxRetries)
                        {
                            // Token超限时，自动缩减内容到50%再重试
                            var content = await innerDbContext!.DocumentFileItems
                                .Where(x => x.DocumentCatalogId == catalog.Id)
                                .FirstOrDefaultAsync(cancellationToken: ct);

                            if (content != null && !string.IsNullOrWhiteSpace(content.Content))
                            {
                                var reducedLimit = MaxAllowedInputTokens / (retryCount + 1); // 逐次减半
                                logger.LogWarning(
                                    "目录 {Catalog} Token超限，自动缩减到 {ReducedLimit} tokens 后重试",
                                    catalog.Name, reducedLimit);
                                content.Content = TruncateContent(content.Content, reducedLimit);
                            }
                        }

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

                    var relativePath = file.Path.Replace(documents.GitPath, "")
                        .TrimStart('/')
                        .TrimStart('\\');
                    var sanitizedFileName = SanitizeGraphIdentifier(file.Name, $"file_{documents.Id}");
                    var sanitizedFileType = SanitizeGraphIdentifier(file.Type, "file_type");
                    var sanitizedRelativePath = SanitizeGraphIdentifier(relativePath, $"file_path_{documents.Id}");
                    var fileMetadata = new Dictionary<string, object>
                    {
                        ["fileName"] = file.Name,
                        ["fileNameGraph"] = sanitizedFileName,
                        ["filePath"] = file.Path,
                        ["filePathRelative"] = relativePath,
                        ["filePathGraph"] = sanitizedRelativePath,
                        ["fileType"] = file.Type,
                        ["fileTypeGraph"] = sanitizedFileType,
                        ["type"] = "code",
                        ["documentId"] = documents.Id,
                    };

                    var mem0Messages = new List<Mem0MessagePayload>
                    {
                        new()
                        {
                            Role = "system",
                            Content = await PromptContext.Mem0(nameof(PromptConstant.Mem0.CodeSystem),
                                new KernelArguments(), OpenAIOptions.ChatModel)
                        },
                        new()
                        {
                            Role = "user",
                            Content = $"""
                                       ```{relativePath}
                                       {content}
                                       ```
                                       """
                        }
                    };

                    await SendMem0MemoryAsync(mem0Messages, warehouse.Id, fileMetadata, ct);

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

            // 使用唯一session ID，不需要手动清理，session结束后自然隔离
            logger.LogInformation("完成 warehouse {WarehouseId} 的处理，使用的session: {SessionId}",
                warehouse.Id, sessionId);

            await dbContext.Warehouses
                .Where(x => x.Id == warehouse.Id)
                .ExecuteUpdateAsync(x => x.SetProperty(a => a.IsEmbedded, true), stoppingToken);

            logger.LogInformation("完成 warehouse {WarehouseId} ({WarehouseName}) 的处理",
                warehouse.Id, warehouse.Name);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Mem0Rag 服务主循环发生异常，等待30秒后重试");
                await Task.Delay(30000, stoppingToken);
            }
        }
    }
}
