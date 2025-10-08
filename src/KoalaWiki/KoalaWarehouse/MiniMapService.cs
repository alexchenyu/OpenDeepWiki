using System.Text;
using System.Text.RegularExpressions;
using KoalaWiki.Domains.Warehouse;
using KoalaWiki.Dto;
using KoalaWiki.Prompts;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;

namespace KoalaWiki.KoalaWarehouse;

/// <summary>
/// 
/// </summary>
public static class MiniMapService
{
    /// <summary>
    /// 生成知识图谱
    /// </summary>
    /// <returns></returns>
    public static async Task<MiniMapResult> GenerateMiniMap(string catalogue,
        Warehouse warehouse, string path)
    {
        // 使用AnalysisModel，如果为空则使用ChatModel
        string modelToUse = string.IsNullOrEmpty(OpenAIOptions.AnalysisModel) ? OpenAIOptions.ChatModel : OpenAIOptions.AnalysisModel;

        // 注意：catalogue 已经在调用方通过 maxDepth 参数进行了深度限制
        // 不再需要在这里进行截断
        string prompt = await PromptContext.Warehouse(nameof(PromptConstant.Warehouse.GenerateMindMap),
            new KernelArguments()
            {
                ["code_files"] = catalogue,
                ["repository_url"] = warehouse.Address.Replace(".git", ""),
                ["branch_name"] = warehouse.Branch
            }, modelToUse);

        var miniMap = new StringBuilder();

        var history = new ChatHistory();

        history.AddSystemEnhance();

        history.AddUserMessage(prompt);

        var kernel = KernelFactory.GetKernel(OpenAIOptions.Endpoint, OpenAIOptions.ChatApiKey, path,
            modelToUse, false);

        int retry = 1;
        retry:
        
        await foreach (var item in kernel.GetRequiredService<IChatCompletionService>()
                           .GetStreamingChatMessageContentsAsync(history, new OpenAIPromptExecutionSettings()
                           {
                               ToolCallBehavior = ToolCallBehavior.AutoInvokeKernelFunctions,
                               MaxTokens = DocumentsHelper.GetMaxTokens(modelToUse)
                           }, kernel))
        {
            if (!string.IsNullOrEmpty(item.Content))
            {
                miniMap.Append(item.Content);
            }
        }

        // 删除thinking标签包括中间的内容使用正则表达式

        var thinkingPattern = new Regex(@"<thinking>.*?</thinking>", RegexOptions.Singleline);
        miniMap = new StringBuilder(thinkingPattern.Replace(miniMap.ToString(), string.Empty).Trim());
        
        // 如果内容是空的则再次执行
        if (miniMap.Length == 0)
        {
            retry++;
            if (retry > 3)
            {
                throw new Exception("知识图谱生成失败，请检查仓库是否存在代码文件或仓库地址是否正确。");
            }

            goto retry;
        }

        // 开始解析知识图谱
        var miniMapContent = miniMap.ToString();

        // 解析知识图谱 # region \n## 标题:文件
        var lines = miniMapContent.Split(new[] { '\n' }, StringSplitOptions.RemoveEmptyEntries);

        var result = ParseMiniMapRecursive(lines, 0, 0);

        return result;
    }

    private static MiniMapResult ParseMiniMapRecursive(string[] lines, int startIndex, int currentLevel)
    {
        var result = new MiniMapResult();

        for (int i = startIndex; i < lines.Length; i++)
        {
            var line = lines[i].Trim();

            if (string.IsNullOrEmpty(line))
                continue;

            // 计算当前行的标题级别
            int level = GetHeaderLevel(line);

            if (level == 0)
                continue; // 不是标题行，跳过

            if (level <= currentLevel && i > startIndex)
            {
                // 遇到同级或更高级的标题，结束当前层级的解析
                break;
            }

            if (level == currentLevel + 1)
            {
                // 解析标题和URL
                var titleAndUrl = ParseTitleAndUrl(line);
                var node = new MiniMapResult
                {
                    Title = titleAndUrl.title,
                    Url = titleAndUrl.url
                };

                // 递归解析子节点
                var childResult = ParseMiniMapRecursive(lines, i + 1, level);
                node.Nodes = childResult.Nodes;

                if (result.Title == null)
                {
                    // 如果这是第一个节点，设置为根节点
                    result.Title = node.Title;
                    result.Url = node.Url;
                    result.Nodes = node.Nodes;
                }
                else
                {
                    // 否则添加到子节点列表
                    result.Nodes.Add(node);
                }
            }
            else if (level > currentLevel + 1)
            {
                // 跳过级别的标题，继续处理
                continue;
            }
        }

        return result;
    }

    private static int GetHeaderLevel(string line)
    {
        int level = 0;
        foreach (char c in line)
        {
            if (c == '#')
                level++;
            else
                break;
        }

        return level;
    }

    private static (string title, string url) ParseTitleAndUrl(string line)
    {
        // 移除开头的#号和空格
        var content = line.TrimStart('#').Trim();

        // 检查是否包含URL格式 "标题:文件"
        if (content.Contains(':'))
        {
            var parts = content.Split(':', 2);
            var title = parts[0].Trim();
            var url = parts[1].Trim();
            return (title, url);
        }

        return (content, string.Empty);
    }
}