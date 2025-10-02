using KoalaWiki.Core.Extensions;
using KoalaWiki.Prompts;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;
using Newtonsoft.Json;
using OpenAI.Chat;
using JsonSerializer = System.Text.Json.JsonSerializer;

namespace KoalaWiki.KoalaWarehouse.GenerateThinkCatalogue;

public static partial class GenerateThinkCatalogueService
{
    private const int MaxRetries = 8; // 增加重试次数
    private const int BaseDelayMs = 1000;
    private const double MaxDelayMs = 30000; // 最大延迟30秒
    private const double JitterRange = 0.3; // 抖动范围30%

    // 错误分类
    private enum ErrorType
    {
        NetworkError, // 网络相关错误
        JsonParseError, // JSON解析错误
        ApiRateLimit, // API限流
        ModelError, // 模型响应错误
        UnknownError // 未知错误
    }

    public static async Task<DocumentResultCatalogue?> GenerateCatalogue(string path,
        string catalogue, Warehouse warehouse, ClassifyType? classify)
    {
        var retryCount = 0;
        Exception? lastException = null;
        var consecutiveFailures = 0;

        Log.Logger.Information("开始处理仓库：{path}，处理标题：{name}", path, warehouse.Name);

        while (retryCount < MaxRetries)
        {
            try
            {
                var result =
                    await ExecuteSingleAttempt(path, catalogue, classify, retryCount).ConfigureAwait(false);

                if (result != null)
                {
                    Log.Logger.Information("成功处理仓库：{path}，处理标题：{name}，尝试次数：{retryCount}",
                        path, warehouse.Name, retryCount + 1);
                    return result;
                }

                // result为null也算失败，继续重试
                Log.Logger.Warning("处理仓库返回空结果：{path}，处理标题：{name}，尝试次数：{retryCount}",
                    path, warehouse.Name, retryCount + 1);
                consecutiveFailures++;
            }
            catch (Exception ex)
            {
                lastException = ex;
                consecutiveFailures++;
                var errorType = ClassifyError(ex);

                Log.Logger.Warning("处理仓库失败：{path}，处理标题：{name}，尝试次数：{retryCount}，错误类型：{errorType}，错误：{error}",
                    path, warehouse.Name, retryCount + 1, errorType, ex.Message);

                // 根据错误类型决定是否继续重试
                if (!ShouldRetry(errorType, retryCount, consecutiveFailures))
                {
                    Log.Logger.Error("错误类型 {errorType} 不适合重试或达到最大重试次数，停止重试", errorType);
                    break;
                }
            }

            retryCount++;

            if (retryCount < MaxRetries)
            {
                var delay = CalculateDelay(retryCount, consecutiveFailures);
                Log.Logger.Information("等待 {delay}ms 后进行第 {nextAttempt} 次尝试", delay, retryCount + 1);
                await Task.Delay(delay);

                // 如果连续失败过多，尝试重置某些状态
                if (consecutiveFailures >= 3)
                {
                    Log.Logger.Information("连续失败 {consecutiveFailures} 次，尝试重置状态", consecutiveFailures);
                    // 可以在这里添加一些重置逻辑，比如清理缓存等
                    await Task.Delay(2000); // 额外等待
                }
            }
        }

        Log.Logger.Error("处理仓库最终失败：{path}，处理标题：{name}，总尝试次数：{totalAttempts}，最后错误：{error}",
            path, warehouse.Name, retryCount, lastException?.Message ?? "未知错误");

        return null;
    }

    private static async Task<DocumentResultCatalogue?> ExecuteSingleAttempt(
        string path, string catalogue, ClassifyType? classify, int attemptNumber)
    {
        // 根据尝试次数调整提示词策略
        var enhancedPrompt = await GenerateThinkCataloguePromptAsync(classify, catalogue);

        var history = new ChatHistory();

        history.AddSystemEnhance();

        var contents = new ChatMessageContentItemCollection()
        {
            new TextContent(enhancedPrompt),
            new TextContent(
                $"""
                 <system-reminder>
                 <catalog_tool_usage_guidelines>
                 **PARALLEL READ OPERATIONS**
                 - MANDATORY: Always perform PARALLEL File.Read calls — batch multiple files in a SINGLE message for maximum efficiency
                 - CRITICAL: Read MULTIPLE files simultaneously in one operation
                 - PROHIBITED: Sequential one-by-one file reads (inefficient and wastes context capacity)

                 **EDITING OPERATION LIMITS**
                 - HARD LIMIT: Maximum of 3 editing operations total (catalog.MultiEdit only)
                 - PRIORITY: Maximize each catalog.MultiEdit operation by bundling ALL related changes across multiple files
                 - STRATEGIC PLANNING: Consolidate all modifications into minimal MultiEdit operations to stay within the limit
                 - Use catalog.Write **only once** for initial creation or full rebuild (counts as initial structure creation, not part of the 3 edits)
                 - Always verify content before further changes using catalog.Read (Reads do NOT count toward limit)

                 **CRITICAL MULTIEDIT BEST PRACTICES**
                 - MAXIMIZE EFFICIENCY: Each MultiEdit should target multiple distinct sections across files
                 - AVOID CONFLICTS: Never edit overlapping or identical content regions within the same MultiEdit operation
                 - UNIQUE TARGETS: Ensure each edit instruction addresses a completely different section or file
                 - BATCH STRATEGY: Group all necessary changes by proximity and relevance, but maintain clear separation between edit targets

                 **RECOMMENDED EDITING SEQUENCE**
                 1. catalog.Write (one-time full structure creation)
                 2. catalog.MultiEdit with maximum parallel changes (counts toward 3-operation limit)
                 3. Use catalog.Read after each MultiEdit to verify success before next operation
                 4. Remaining MultiEdit operations for any missed changes
                 </catalog_tool_usage_guidelines>


                 ## Execution steps requirements:
                 1. Before performing any other operations, you must first invoke the 'agent-think' tool to plan the analytical steps. This is a necessary step for completing each research task.
                 2. Then, the code structure provided in the code_file must be utilized by calling file.Read to read the code for in-depth analysis, and then use catalog.Write to write the results of the analysis into the catalog directory.
                 3. If necessary, some parts that need to be optimized can be edited through catalog.MultiEdit.

                 For maximum efficiency, whenever you need to perform multiple independent operations, invoke all relevant tools simultaneously rather than sequentially.
                 The repository's directory structure has been provided in <code_files>. Please utilize the provided structure directly for file navigation and reading operations, rather than relying on glob patterns or filesystem traversal methods.
                 Below is an example of the directory structure of the warehouse, where /D represents a directory and /F represents a file:
                    server/D
                      src/D
                        Main/F
                    web/D
                      components/D
                        Header.tsx/F

                 {Prompt.Language}

                 </system-reminder>
                 """),
            new TextContent(Prompt.Language)
        };
        history.AddUserMessage(contents);

        var catalogueTool = new CatalogueFunction();
        var analysisModel = KernelFactory.GetKernel(OpenAIOptions.Endpoint,
            OpenAIOptions.ChatApiKey, path, OpenAIOptions.AnalysisModel, false, null,
            builder => { builder.Plugins.AddFromObject(catalogueTool, "catalog"); });

        var chat = analysisModel.Services.GetService<IChatCompletionService>();
        if (chat == null)
        {
            throw new InvalidOperationException("无法获取聊天完成服务");
        }

        // 根据尝试次数调整设置
        var settings = new OpenAIPromptExecutionSettings()
        {
            ToolCallBehavior = ToolCallBehavior.AutoInvokeKernelFunctions,
            MaxTokens = DocumentsHelper.GetMaxTokens(OpenAIOptions.AnalysisModel)
        };

        var inputTokenCount = 0;
        var outputTokenCount = 0;

        const int maxStreamAttempts = 3;
        var contentAvailable = false;
        var consecutiveEmptyResponses = 0;

        for (var streamAttempt = 1; streamAttempt <= maxStreamAttempts; streamAttempt++)
        {
            var timeout = streamAttempt == 1
                ? TimeSpan.FromMinutes(20)
                : TimeSpan.FromMinutes(5);

            using var cts = new CancellationTokenSource(timeout);

            try
            {
                // 流式获取响应 - 添加取消令牌和异常处理
                await foreach (var item in chat.GetStreamingChatMessageContentsAsync(
                                   history,
                                   settings,
                                   analysisModel,
                                   cts.Token).ConfigureAwait(false))
                {
                    // 定期检查取消
                    cts.Token.ThrowIfCancellationRequested();

                    switch (item.InnerContent)
                    {
                        case StreamingChatCompletionUpdate { Usage.InputTokenCount: > 0 } content:
                            inputTokenCount += content.Usage.InputTokenCount;
                            outputTokenCount += content.Usage.OutputTokenCount;
                            break;

                        case StreamingChatCompletionUpdate tool when tool.ToolCallUpdates.Count > 0:
                            break;

                        case StreamingChatCompletionUpdate value:
                            var text = value.ContentUpdate.FirstOrDefault()?.Text;
                            if (!string.IsNullOrEmpty(text))
                            {
                                Console.Write(text);
                            }

                            break;
                    }
                }

                if (!string.IsNullOrWhiteSpace(catalogueTool.Content))
                {
                    contentAvailable = true;
                    break;
                }

                consecutiveEmptyResponses++;

                if (consecutiveEmptyResponses >= 2)
                {
                    Console.WriteLine("目录生成响应为空，尝试执行质量补救...");
                    await RefineResponse(history, chat, settings, analysisModel, catalogueTool, consecutiveEmptyResponses);

                    if (!string.IsNullOrWhiteSpace(catalogueTool.Content))
                    {
                        contentAvailable = true;
                        break;
                    }
                }

                if (streamAttempt == maxStreamAttempts)
                {
                    break;
                }

                Console.WriteLine("AI生成目录返回空内容，正在重试...");
                await Task.Delay(TimeSpan.FromMilliseconds(1500 * streamAttempt), CancellationToken.None);
            }
            catch (OperationCanceledException) when (cts.IsCancellationRequested)
            {
                consecutiveEmptyResponses = 0;

                if (streamAttempt == maxStreamAttempts)
                {
                    throw new TimeoutException("流式处理超时");
                }

                Console.WriteLine($"超时，正在重试 ({streamAttempt + 1}/{maxStreamAttempts})...");
                await Task.Delay(TimeSpan.FromMilliseconds(2000 * streamAttempt), CancellationToken.None);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"流式处理错误: {ex.Message}");
                throw;
            }
        }

        if (!contentAvailable)
        {
            await RefineResponse(history, chat, settings, analysisModel, catalogueTool, consecutiveEmptyResponses + 1);

            if (string.IsNullOrWhiteSpace(catalogueTool.Content))
            {
                throw new InvalidOperationException("catalogueTool.Content is empty after all fallback attempts");
            }
        }

        // Prefer tool-stored JSON when available
        if (!string.IsNullOrWhiteSpace(catalogueTool.Content))
        {
            // 质量增强逻辑
            if (!DocumentOptions.RefineAndEnhanceQuality || attemptNumber >= 3) // 前几次尝试才进行质量增强
                return ExtractAndParseJson(catalogueTool.Content);

            await RefineResponse(history, chat, settings, analysisModel, catalogueTool, consecutiveEmptyResponses);

            return ExtractAndParseJson(catalogueTool.Content);
        }

        throw new InvalidOperationException("catalogueTool.Content is empty after streaming attempts");
    }

    private static async Task RefineResponse(ChatHistory history, IChatCompletionService chat,
        OpenAIPromptExecutionSettings settings, Kernel kernel, CatalogueFunction catalogueTool,
        int emptyResponseCount)
    {
        try
        {
            var refinementPrompt = $"""
                                    The documentation_structure JSON is still empty after {emptyResponseCount} attempts.
                                    Provide a full replacement JSON with concise hierarchy. Requirements:
                                    - Include at least 'getting-started' and 'deep-dive' top-level sections
                                    - For each section, provide a Chinese name and an action-oriented prompt
                                    - Keep structure shallow (max depth 3) to avoid bloating
                                    Use only Catalogue.Write to produce the JSON.
                                    """;

            history.AddUserMessage(refinementPrompt);

            await foreach (var _ in chat.GetStreamingChatMessageContentsAsync(history, settings, kernel))
            {
                // 仅消费流式结果；CatalogueFunction 插件会在 Write 被调用时自行更新内容
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"RefineResponse error: {ex.Message}");
        }
    }

    private static DocumentResultCatalogue? ExtractAndParseJson(string responseText)
    {
        var extractedJson = JsonConvert.DeserializeObject<DocumentResultCatalogue>(responseText);

        return extractedJson;
    }

    private static ErrorType ClassifyError(Exception ex)
    {
        return ex switch
        {
            HttpRequestException => ErrorType.NetworkError,
            TaskCanceledException => ErrorType.NetworkError,
            JsonException => ErrorType.JsonParseError,
            InvalidOperationException when ex.Message.Contains("rate") => ErrorType.ApiRateLimit,
            InvalidOperationException when ex.Message.Contains("quota") => ErrorType.ApiRateLimit,
            _ when ex.Message.Contains("model") => ErrorType.ModelError,
            _ => ErrorType.UnknownError
        };
    }

    private static bool ShouldRetry(ErrorType errorType, int retryCount, int consecutiveFailures)
    {
        // 总是允许至少重试几次
        if (retryCount < 3) return true;

        // 根据错误类型决定是否继续重试
        return errorType switch
        {
            ErrorType.NetworkError => retryCount < MaxRetries,
            ErrorType.ApiRateLimit => retryCount < MaxRetries && consecutiveFailures < 5,
            ErrorType.JsonParseError => retryCount < 6, // JSON错误多重试几次
            ErrorType.ModelError => retryCount < 4,
            ErrorType.UnknownError => retryCount < MaxRetries,
            _ => throw new ArgumentOutOfRangeException(nameof(errorType), errorType, null)
        };
    }

    private static int CalculateDelay(int retryCount, int consecutiveFailures)
    {
        // 指数退避 + 抖动 + 连续失败惩罚
        var exponentialDelay = BaseDelayMs * Math.Pow(2, retryCount);
        var consecutiveFailurePenalty = consecutiveFailures * 1000;
        var jitter = Random.Shared.NextDouble() * JitterRange * exponentialDelay;

        var totalDelay = exponentialDelay + consecutiveFailurePenalty + jitter;

        return (int)Math.Min(totalDelay, MaxDelayMs);
    }
}