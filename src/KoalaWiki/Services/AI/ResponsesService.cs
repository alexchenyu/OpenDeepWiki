using System.ClientModel.Primitives;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Web;
using FastService;
using KoalaWiki.Dto;
using KoalaWiki.Functions;
using KoalaWiki.Prompts;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;
using OpenAI.Chat;
using ChatMessageContent = Microsoft.SemanticKernel.ChatMessageContent;

#pragma warning disable SKEXP0001

namespace KoalaWiki.Services.AI;

[Tags("Responese")]
[FastService.Route("")]
public class ResponsesService(IKoalaWikiContext koala) : FastApi
{
    [HttpPost("/api/Responses")]
    public async Task ExecuteAsync(HttpContext context, ResponsesInput input)
    {
        using var activity = Activity.Current?.Source.StartActivity("AI.ResponsesService.Execute");
        activity?.SetTag("repository.organization", input.OrganizationName);
        activity?.SetTag("repository.name", input.Name);
        activity?.SetTag("message.count", input.Messages?.Count ?? 0);
        activity?.SetTag("model.provider", OpenAIOptions.ModelProvider);
        activity?.SetTag("model.name", OpenAIOptions.ChatModel);

        // URL decode parameters
        var decodedOrganizationName = HttpUtility.UrlDecode(input.OrganizationName);
        var decodedName = HttpUtility.UrlDecode(input.Name);

        var warehouse = await koala.Warehouses
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.OrganizationName.ToLower() == decodedOrganizationName.ToLower() &&
                x.Name.ToLower() == decodedName.ToLower());

        if (warehouse == null)
        {
            activity?.SetStatus(ActivityStatusCode.Error, "Warehouse not found");
            activity?.SetTag("error.reason", "warehouse_not_found");
            context.Response.StatusCode = 404;
            await context.Response.WriteAsJsonAsync(new
            {
                message = "Warehouse not found",
                code = 404,
            });
            return;
        }


        activity?.SetTag("warehouse.id", warehouse.Id);
        activity?.SetTag("warehouse.address", warehouse.Address);
        activity?.SetTag("warehouse.branch", warehouse.Branch);


        var document = await koala.Documents
            .AsNoTracking()
            .Where(x => x.WarehouseId == warehouse.Id)
            .FirstOrDefaultAsync();

        if (document == null)
        {
            activity?.SetStatus(ActivityStatusCode.Error, "Document not found");
            activity?.SetTag("error.reason", "document_not_found");
            context.Response.StatusCode = 404;
            await context.Response.WriteAsJsonAsync(new
            {
                message = "document not found",
                code = 404,
            });
            return;
        }

        activity?.SetTag("document.id", document.Id);
        activity?.SetTag("document.git_path", document.GitPath);

        // 解析仓库的目录结构
        var path = document.GitPath;

        using var kernelCreateActivity = Activity.Current.Source.StartActivity("AI.KernelCreation");
        kernelCreateActivity?.SetTag("kernel.path", path);
        kernelCreateActivity?.SetTag("kernel.model", OpenAIOptions.ChatModel);

        var kernel = KernelFactory.GetKernel(OpenAIOptions.Endpoint,
            OpenAIOptions.ChatApiKey, path, OpenAIOptions.ChatModel, false);

        kernelCreateActivity?.SetStatus(ActivityStatusCode.Ok);

        if (OpenAIOptions.EnableMem0)
        {
            kernel.Plugins.AddFromObject(new RagFunction(warehouse!.Id));
        }

        if (warehouse.Address.Contains("github.com"))
        {
            kernel.Plugins.AddFromObject(new GithubFunction(warehouse.OrganizationName, warehouse.Name,
                warehouse.Branch), "Github");
        }
        else if (warehouse.Address.Contains("gitee.com") && !string.IsNullOrWhiteSpace(GiteeOptions.Token))
        {
            kernel.Plugins.AddFromObject(new GiteeFunction(warehouse.OrganizationName, warehouse.Name,
                warehouse.Branch), "Gitee");
        }

        DocumentContext.DocumentStore = new DocumentStore();


        var chat = kernel.GetRequiredService<IChatCompletionService>();

        var history = new ChatHistory();

        string tree = string.Empty;

        try
        {
            var ignoreFiles = DocumentsHelper.GetIgnoreFiles(path);
            var pathInfos = new List<PathInfo>();

            // 递归扫描目录所有文件和目录
            DocumentsHelper.ScanDirectory(path, pathInfos, ignoreFiles);

            var fileTree = FileTreeBuilder.BuildTree(pathInfos, path);
            tree = FileTreeBuilder.ToCompactString(fileTree);
        }
        catch (Exception)
        {
            tree = warehouse.OptimizedDirectoryStructure;
        }


        if (input.DeepResearch)
        {
            history.AddSystemMessage(await PromptContext.Chat(nameof(PromptConstant.Chat.ResponsesDeepResearch),
                new KernelArguments()
                {
                    ["catalogue"] = tree,
                    ["repository"] = warehouse.Address.Replace(".git", ""),
                    ["repository_name"] = warehouse.Name,
                    ["branch"] = warehouse.Branch
                }, OpenAIOptions.DeepResearchModel));
        }
        else
        {
            history.AddSystemMessage(await PromptContext.Chat(nameof(PromptConstant.Chat.Responses),
                new KernelArguments()
                {
                    ["catalogue"] = tree,
                    ["repository"] = warehouse.Address.Replace(".git", ""),
                    ["repository_name"] = warehouse.Name,
                    ["branch"] = warehouse.Branch
                }, OpenAIOptions.DeepResearchModel));
        }

        if (!string.IsNullOrEmpty(input.AppId))
        {
            var appConfig = await koala.AppConfigs
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.AppId == input.AppId);

            if (appConfig == null)
            {
                throw new Exception(
                    "AppConfig is not supported in this endpoint. Please use the appropriate API for app configurations.");
            }


            if (!string.IsNullOrEmpty(appConfig?.Prompt))
            {
                history.AddUserMessage($"<system>\n{appConfig?.Prompt}\n</system>");
            }
        }

        // 添加消息历史记录
        foreach (var msg in input.Messages)
        {
            var role = msg.Role.ToLower() switch
            {
                "user" => AuthorRole.User,
                "assistant" => AuthorRole.Assistant,
                "system" => AuthorRole.System,
                _ => AuthorRole.User
            };

            var contents = new ChatMessageContentItemCollection();
            var hasContent = false;

            foreach (var contentItem in msg.Content)
            {
                switch (contentItem.Type)
                {
                    case ContentItemType.Text:
                        if (contentItem is TextContentInput textContent && !string.IsNullOrEmpty(textContent.Text))
                        {
                            contents.Add(new TextContent(textContent.Text));
                            hasContent = true;
                        }

                        break;
                    case ContentItemType.Image:
                        if (contentItem is ImageContentInput imageContent)
                        {
                            if (imageContent.ImageUrl.Url.StartsWith("data:"))
                            {
                                contents.Add(new BinaryContent(imageContent.ImageUrl.Url));
                                hasContent = true;
                            }
                        }

                        break;
                    case ContentItemType.ToolCalls:
                        if (contentItem is ToolCallsContentInput toolCallsContent)
                        {
                            foreach (var toolCall in toolCallsContent.ToolCalls)
                            {
                                contents.Add(new TextContent(
                                    $"Tool call: {toolCall.Function.Name}({toolCall.Function.Arguments})"));
                                hasContent = true;
                            }
                        }

                        break;
                    case ContentItemType.ToolResult:
                        if (contentItem is ToolResultContentInput toolResultContent)
                        {
                            contents.Add(new TextContent($"Tool result: {toolResultContent.Result}"));
                            hasContent = true;
                        }

                        break;
                }
            }

            if (hasContent)
            {
                if (contents.Count == 1 && contents.First() is TextContent singleText)
                {
                    // 单个文本内容直接添加
                    if (role == AuthorRole.User)
                    {
                        history.AddUserMessage(singleText.Text!);
                    }
                    else if (role == AuthorRole.Assistant)
                    {
                        history.AddAssistantMessage(singleText.Text!);
                    }
                    else if (role == AuthorRole.System)
                    {
                        history.AddSystemMessage(singleText.Text!);
                    }
                }
                else
                {
                    // 多个内容项添加
                    history.AddMessage(role, contents);
                }
            }
        }

        // sse
        context.Response.Headers.ContentType = "text/event-stream";
        context.Response.Headers.CacheControl = "no-cache";

        // 是否推理中
        var isReasoning = false;

        // 是否普通消息
        var isMessage = false;

        using var chatActivity = Activity.Current?.Source.StartActivity("AI.StreamingChatCompletion");
        chatActivity?.SetTag("chat.max_tokens", DocumentsHelper.GetMaxTokens(OpenAIOptions.DeepResearchModel));
        chatActivity?.SetTag("chat.temperature", 0.5);
        chatActivity?.SetTag("chat.tool_behavior", "AutoInvokeKernelFunctions");
        chatActivity?.SetTag("chat.history_count", history.Count);

        var messageCount = 0;
        var toolCallCount = 0;
        var reasoningTokens = 0;

        await foreach (var chatItem in chat.GetStreamingChatMessageContentsAsync(history,
                           new OpenAIPromptExecutionSettings()
                           {
                               ToolCallBehavior = ToolCallBehavior.AutoInvokeKernelFunctions,
                               MaxTokens = DocumentsHelper.GetMaxTokens(OpenAIOptions.DeepResearchModel),
                               Temperature = 0.5,
                           }, kernel))
        {
            // 发送数据
            if (chatItem.InnerContent is not StreamingChatCompletionUpdate message) continue;

            if (DocumentContext.DocumentStore != null && DocumentContext.DocumentStore.GitIssus.Count > 0)
            {
                var gitIssuesEvent = new StreamEventOutput
                {
                    Type = "git_issues",
                    Delta = new ContentDeltaOutput
                    {
                        ContentType = "git_issues",
                        Text = JsonSerializer.Serialize(DocumentContext.DocumentStore.GitIssus,
                            JsonSerializerOptions.Web)
                    }
                };

                await context.Response.WriteAsync(
                    $"data: {JsonSerializer.Serialize(gitIssuesEvent, JsonSerializerOptions.Web)}\n\n");
                await context.Response.Body.FlushAsync();

                DocumentContext.DocumentStore.GitIssus.Clear();
            }


            var jsonContent = JsonNode.Parse(ModelReaderWriter.Write(chatItem.InnerContent!));

            var choices = jsonContent!["choices"] as JsonArray;
            if (choices?.Count > 0)
            {
                if (choices[0]!["delta"]!["reasoning_content"] != null)
                {
                    // 推理内容
                    var reasoningContent = choices![0]!["delta"]!["reasoning_content"].ToString();
                    if (!string.IsNullOrEmpty(reasoningContent))
                    {
                        if (isReasoning == false)
                        {
                            // 结束普通消息
                            if (isMessage)
                            {
                                isMessage = false;
                                var messageEndEvent = new StreamEventOutput { Type = "message_end" };
                                await context.Response.WriteAsync(
                                    $"data: {JsonSerializer.Serialize(messageEndEvent, JsonSerializerOptions.Web)}\n\n");
                            }

                            isReasoning = true;
                            var reasoningStartEvent = new StreamEventOutput { Type = "reasoning_start" };
                            await context.Response.WriteAsync(
                                $"data: {JsonSerializer.Serialize(reasoningStartEvent, JsonSerializerOptions.Web)}\n\n");
                        }

                        var reasoningEvent = new StreamEventOutput
                        {
                            Type = StreamEventType.ContentDelta,
                            Delta = new ContentDeltaOutput
                            {
                                ContentType = ContentItemType.Reasoning,
                                Reasoning = reasoningContent
                            }
                        };

                        await context.Response.WriteAsync(
                            $"data: {JsonSerializer.Serialize(reasoningEvent, JsonSerializerOptions.Web)}\n\n");
                        await context.Response.Body.FlushAsync();
                        reasoningTokens += reasoningContent.Length / 4;
                        continue;
                    }
                }
            }

            if (isReasoning)
            {
                // 结束推理
                isReasoning = false;
                var reasoningEndEvent = new StreamEventOutput { Type = "reasoning_end" };
                await context.Response.WriteAsync(
                    $"data: {JsonSerializer.Serialize(reasoningEndEvent, JsonSerializerOptions.Web)}\n\n");

                isMessage = true;
                var messageStartEvent = new StreamEventOutput { Type = "message_start" };
                await context.Response.WriteAsync(
                    $"data: {JsonSerializer.Serialize(messageStartEvent, JsonSerializerOptions.Web)}\n\n");
            }

            if (message.ToolCallUpdates.Count > 0)
            {
                // 工具调用更新
                foreach (var toolCallUpdate in message.ToolCallUpdates)
                {
                    var toolCallEvent = new StreamEventOutput
                    {
                        Type = StreamEventType.ToolCalls,
                        Delta = new ContentDeltaOutput
                        {
                            ContentType = ContentItemType.ToolCalls,
                            ToolCallId = toolCallUpdate.ToolCallId,
                            FunctionName = toolCallUpdate.FunctionName,
                            FunctionArguments = Encoding.UTF8.GetString(toolCallUpdate.FunctionArgumentsUpdate)
                        }
                    };

                    await context.Response.WriteAsync(
                        $"data: {JsonSerializer.Serialize(toolCallEvent, JsonSerializerOptions.Web)}\n\n");
                    await context.Response.Body.FlushAsync();
                }

                toolCallCount++;
                continue;
            }

            // 普通消息内容
            if (!string.IsNullOrEmpty(chatItem.Content))
            {
                if (!isMessage)
                {
                    isMessage = true;
                    var messageStartEvent = new StreamEventOutput { Type = "message_start" };
                    await context.Response.WriteAsync(
                        $"data: {JsonSerializer.Serialize(messageStartEvent, JsonSerializerOptions.Web)}\n\n");
                }

                var contentEvent = new StreamEventOutput
                {
                    Type = StreamEventType.ContentDelta,
                    Delta = new ContentDeltaOutput
                    {
                        ContentType = ContentItemType.Text,
                        Text = chatItem.Content
                    }
                };

                await context.Response.WriteAsync(
                    $"data: {JsonSerializer.Serialize(contentEvent, JsonSerializerOptions.Web)}\n\n");
                await context.Response.Body.FlushAsync();
                messageCount++;
            }
        }

        // 确保最后结束消息
        if (isMessage)
        {
            var messageEndEvent = new StreamEventOutput { Type = "message_end" };
            await context.Response.WriteAsync(
                $"data: {JsonSerializer.Serialize(messageEndEvent, JsonSerializerOptions.Web)}\n\n");
        }

        if (isReasoning)
        {
            var reasoningEndEvent = new StreamEventOutput { Type = "reasoning_end" };
            await context.Response.WriteAsync(
                $"data: {JsonSerializer.Serialize(reasoningEndEvent, JsonSerializerOptions.Web)}\n\n");
        }

        // 发送结束事件
        var doneEvent = new StreamEventOutput { Type = StreamEventType.Done };
        await context.Response.WriteAsync(
            $"data: {JsonSerializer.Serialize(doneEvent, JsonSerializerOptions.Web)}\n\n");
        await context.Response.Body.FlushAsync();

        // 设置聊天活动的统计信息
        chatActivity?.SetTag("chat.message_count", messageCount);
        chatActivity?.SetTag("chat.tool_call_count", toolCallCount);
        chatActivity?.SetTag("chat.reasoning_tokens", reasoningTokens);
        chatActivity?.SetStatus(ActivityStatusCode.Ok);

        // 设置主活动状态
        activity?.SetStatus(ActivityStatusCode.Ok);
        activity?.SetTag("response.completed", true);
    }
}