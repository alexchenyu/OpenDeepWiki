using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;
using KoalaWiki.KoalaWarehouse.Pipeline;
using Microsoft.SemanticKernel.Connectors.OpenAI;

namespace KoalaWiki.KoalaWarehouse;

public class DocumentsService(IDocumentProcessingOrchestrator orchestrator)
{
    private static readonly ActivitySource SActivitySource = new("KoalaWiki.Warehouse");

    /// <summary>
    /// Handles the asynchronous processing of a document within a specified warehouse, including parsing directory structures, generating update logs, and saving results to the database.
    /// </summary>
    /// <param name="document">The document to be processed.</param>
    /// <param name="warehouse">The warehouse associated with the document.</param>
    /// <param name="dbContext">The database context used for data operations.</param>
    /// <param name="gitRepository">The Git repository address related to the document.</param>
    /// <returns>A task representing the asynchronous operation.</returns>
    public async Task HandleAsync(Document document, Warehouse warehouse, IKoalaWikiContext dbContext,
        string gitRepository)
    {
        using var activity = SActivitySource.StartActivity(ActivityKind.Server);
        activity?.SetTag("warehouse.id", warehouse.Id);
        activity?.SetTag("warehouse.name", warehouse.Name);
        activity?.SetTag("document.id", document.Id);
        activity?.SetTag("git.repository", gitRepository);

        var result = await orchestrator.ProcessDocumentAsync(
            document,
            warehouse,
            dbContext,
            gitRepository);

        if (!result.Success)
        {
            activity?.SetTag("processing.failed", true);
            activity?.SetTag("error", result.ErrorMessage);

            if (result.Exception != null)
            {
                throw result.Exception;
            }

            throw new InvalidOperationException($"文档处理失败: {result.ErrorMessage}");
        }

        activity?.SetTag("processing.completed", true);
    }

    /// <summary>
    /// 获取智能过滤的目录结构（保持向后兼容的原始方法）
    /// </summary>
    /// <param name="path">扫描路径</param>
    /// <param name="readme">README内容</param>
    /// <returns>目录结构字符串</returns>
    public static async Task<string> GetCatalogueSmartFilterAsync(string path, string readme)
    {
        var ignoreFiles = DocumentsHelper.GetIgnoreFiles(path);

        var pathInfos = new List<PathInfo>();
        // 递归扫描目录所有文件和目录
        DocumentsHelper.ScanDirectory(path, pathInfos, ignoreFiles);
        var catalogue = new StringBuilder();

        foreach (var info in pathInfos)
        {
            // 删除前缀 Constant.GitPath
            var relativePath = info.Path.Replace(path, "").TrimStart('\\');

            // 过滤.开头的文件
            if (relativePath.StartsWith("."))
                continue;

            catalogue.Append($"{relativePath}\n");
        }

        // 如果文件数量小于500
        if (pathInfos.Count < 500)
        {
            // 直接返回
            return catalogue.ToString();
        }

        // 如果超过500个文件，返回智能摘要（避免token超限）
        // 注意：不再使用AI简化中间层，因为发送完整目录给AI本身就会超限
        if (pathInfos.Count >= 500)
        {
            Log.Logger.Warning("仓库文件数量过多({Count})，返回目录摘要而非完整结构", pathInfos.Count);
            return GenerateDirectorySummary(pathInfos, path);
        }

        // 如果不启用则直接返回
        if (DocumentOptions.EnableSmartFilter == false)
        {
            return catalogue.ToString();
        }

        Log.Logger.Information("开始优化目录结构，当前文件数：{Count}", pathInfos.Count);

        var analysisModel = KernelFactory.GetKernel(OpenAIOptions.Endpoint,
            OpenAIOptions.ChatApiKey, path, OpenAIOptions.AnalysisModel);

        var codeDirSimplifier = analysisModel.Plugins["CodeAnalysis"]["CodeDirSimplifier"];

        var sb = new StringBuilder();
        int retryCount = 0;
        const int maxRetries = 5;
        Exception? lastException = null;

        while (retryCount < maxRetries)
        {
            try
            {
                await foreach (var item in analysisModel.InvokeStreamingAsync(codeDirSimplifier, new KernelArguments(
                                   new OpenAIPromptExecutionSettings()
                                   {
                                       MaxTokens = DocumentsHelper.GetMaxTokens(OpenAIOptions.AnalysisModel)
                                   })
                               {
                                   ["code_files"] = catalogue.ToString(),
                                   ["readme"] = readme
                               }))
                {
                    sb.Append(item);
                }

                // 成功则跳出循环
                lastException = null;
                break;
            }
            catch (Exception ex)
            {
                retryCount++;
                lastException = ex;
                Log.Logger.Error(ex, $"优化目录结构失败，重试第{retryCount}次");
                if (retryCount >= maxRetries)
                {
                    throw new Exception($"优化目录结构失败，已重试{maxRetries}次", ex);
                }

                await Task.Delay(5000 * retryCount);
                sb.Clear();
            }
        }

        // 正则表达式提取response_file
        var regex = new Regex("<response_file>(.*?)</response_file>", RegexOptions.Singleline);
        var match = regex.Match(sb.ToString());
        if (match.Success)
        {
            // 提取到的内容
            var extractedContent = match.Groups[1].Value;
            catalogue.Clear();
            catalogue.Append(extractedContent);
        }
        else
        {
            // 可能是```json
            var jsonRegex = new Regex("```json(.*?)```", RegexOptions.Singleline);
            var jsonMatch = jsonRegex.Match(sb.ToString());
            if (jsonMatch.Success)
            {
                // 提取到的内容
                var extractedContent = jsonMatch.Groups[1].Value;
                catalogue.Clear();
                catalogue.Append(extractedContent);
            }
            else
            {
                catalogue.Clear();
                catalogue.Append(sb);
            }
        }

        return catalogue.ToString();
    }

    /// <summary>
    /// 为超大仓库生成智能目录摘要
    /// </summary>
    private static string GenerateDirectorySummary(List<PathInfo> pathInfos, string basePath)
    {
        var summary = new StringBuilder();
        summary.AppendLine("# Repository Structure Summary (Large Repository)");
        summary.AppendLine($"**Total Items: {pathInfos.Count}**");
        summary.AppendLine();
        summary.AppendLine("⚠️ This repository is too large to display full structure. Below is a condensed summary.");
        summary.AppendLine("💡 Use 'read_file' tool to explore specific directories or files based on user questions.");
        summary.AppendLine();
        
        // 按顶层目录分组统计
        var topLevelGroups = pathInfos
            .Select(p => {
                var relativePath = p.Path.Replace(basePath, "").TrimStart(Path.DirectorySeparatorChar, '/');
                var parts = relativePath.Split(new[] { Path.DirectorySeparatorChar, '/' }, StringSplitOptions.RemoveEmptyEntries);
                return new { 
                    TopLevel = parts.Length > 0 ? parts[0] : relativePath,
                    IsTopLevel = parts.Length == 1,
                    Extension = Path.GetExtension(p.Path),
                    Type = p.Type,
                    FullPath = relativePath
                };
            })
            .Where(x => !x.TopLevel.StartsWith("."))
            .GroupBy(x => x.TopLevel)
            .OrderBy(g => g.Key); // 按字母顺序，不限制数量
        
        summary.AppendLine("## All Top-Level Directories & Files:");
        summary.AppendLine("```");
        foreach (var group in topLevelGroups)
        {
            var fileCount = group.Count(x => x.Type == "file");
            var dirCount = group.Count(x => x.Type == "directory");
            
            // 统计主要文件类型
            var extensions = group.Where(x => !string.IsNullOrEmpty(x.Extension))
                                  .GroupBy(x => x.Extension)
                                  .OrderByDescending(g => g.Count())
                                  .Take(5)
                                  .Select(g => $"{g.Key}:{g.Count()}");
            
            var isDirectory = group.Any(x => x.Type == "directory");
            var marker = isDirectory ? "📁" : "📄";
            var extInfo = extensions.Any() ? $" ({string.Join(", ", extensions)})" : "";
            
            summary.AppendLine($"{marker} {group.Key}/ - {fileCount} files, {dirCount} subdirs{extInfo}");
        }
        
        summary.AppendLine("```");
        summary.AppendLine();
        
        // 显示重要的配置文件和文档
        var importantPatterns = new[] { 
            "README", "LICENSE", "CONTRIBUTING", "CHANGELOG", "AUTHORS",
            "package.json", "pom.xml", "build.gradle", "Cargo.toml", "go.mod",
            "Makefile", "CMakeLists.txt", "setup.py", "requirements.txt", "pyproject.toml",
            ".gitignore", "Dockerfile", "docker-compose", ".env"
        };
        
        var importantFiles = pathInfos
            .Where(p => {
                var relativePath = p.Path.Replace(basePath, "").TrimStart(Path.DirectorySeparatorChar, '/');
                var fileName = Path.GetFileName(relativePath);
                return !relativePath.Contains(Path.DirectorySeparatorChar.ToString()) && 
                       !relativePath.Contains("/") &&
                       p.Type == "file" &&
                       importantPatterns.Any(pattern => fileName.Contains(pattern, StringComparison.OrdinalIgnoreCase));
            })
            .Select(p => Path.GetFileName(p.Path.Replace(basePath, "").TrimStart(Path.DirectorySeparatorChar, '/')))
            .OrderBy(f => f);
        
        if (importantFiles.Any())
        {
            summary.AppendLine("## 📋 Important Configuration & Documentation Files:");
            summary.AppendLine("```");
            foreach (var file in importantFiles)
            {
                summary.AppendLine($"  {file}");
            }
            summary.AppendLine("```");
            summary.AppendLine();
        }
        
        // 文件类型统计
        var fileTypeStats = pathInfos
            .Where(p => p.Type == "file" && !string.IsNullOrEmpty(Path.GetExtension(p.Path)))
            .GroupBy(p => Path.GetExtension(p.Path))
            .OrderByDescending(g => g.Count())
            .Take(10)
            .Select(g => $"{g.Key} ({g.Count()})");
        
        if (fileTypeStats.Any())
        {
            summary.AppendLine("## 📊 File Type Distribution (Top 10):");
            summary.AppendLine($"```\n{string.Join(", ", fileTypeStats)}\n```");
            summary.AppendLine();
        }
        
        summary.AppendLine("---");
        summary.AppendLine();
        summary.AppendLine("## 🔍 How to Explore This Repository:");
        summary.AppendLine("1. Read README files first to understand the project structure");
        summary.AppendLine("2. Based on user questions, use `read_file` tool to explore relevant directories");
        summary.AppendLine("3. For example: `read_file('src/README.md')` or `read_file('docs/')` to list directory contents");
        summary.AppendLine("4. Analyze the file type distribution to understand the tech stack");
        summary.AppendLine("5. Start with configuration files (Makefile, package.json, etc.) to understand build process");
        
        return summary.ToString();
    }

    public static async Task<string> GenerateReadMe(Warehouse warehouse, string path,
        IKoalaWikiContext koalaWikiContext)
    {
        using var activity = SActivitySource.StartActivity("生成README文档", ActivityKind.Server);
        activity?.SetTag("warehouse.id", warehouse.Id);
        activity?.SetTag("warehouse.name", warehouse.Name);
        activity?.SetTag("path", path);

        var readme = await DocumentsHelper.ReadMeFile(path);
        activity?.SetTag("existing_readme_found", !string.IsNullOrEmpty(readme));

        if (string.IsNullOrEmpty(readme))
        {
            activity?.SetTag("action", "generate_new_readme");

            var catalogue = DocumentsHelper.GetCatalogue(path);
            activity?.SetTag("catalogue.length", catalogue?.Length ?? 0);

            var kernel = KernelFactory.GetKernel(OpenAIOptions.Endpoint,
                OpenAIOptions.ChatApiKey,
                path, OpenAIOptions.ChatModel);

            var fileKernel = KernelFactory.GetKernel(OpenAIOptions.Endpoint,
                OpenAIOptions.ChatApiKey, path, OpenAIOptions.ChatModel, false);

            // 生成README
            var generateReadmePlugin = kernel.Plugins["CodeAnalysis"]["GenerateReadme"];
            var generateReadme = await fileKernel.InvokeAsync(generateReadmePlugin, new KernelArguments(
                new OpenAIPromptExecutionSettings()
                {
                    ToolCallBehavior = ToolCallBehavior.AutoInvokeKernelFunctions,
                })
            {
                ["catalogue"] = catalogue,
                ["git_repository"] = warehouse.Address.Replace(".git", ""),
                ["branch"] = warehouse.Branch
            });

            readme = generateReadme.ToString();
            activity?.SetTag("generated_readme.length", readme?.Length ?? 0);

            // 可能需要先处理一下documentation_structure 有些模型不支持json
            var readmeRegex = new Regex(@"<readme>(.*?)</readme>", RegexOptions.Singleline);
            var readmeMatch = readmeRegex.Match(readme);

            if (readmeMatch.Success)
            {
                // 提取到的内容
                var extractedContent = readmeMatch.Groups[1].Value;
                readme = extractedContent;
                activity?.SetTag("extraction_method", "readme_tag");
            }
            else
            {
                activity?.SetTag("extraction_method", "raw_content");
            }
        }

        if (string.IsNullOrEmpty(readme))
        {
            activity?.SetTag("fallback_to_warehouse_readme", true);
            return "暂无仓库说明文档";
        }

        activity?.SetTag("final_readme.length", readme?.Length ?? 0);
        return readme;
    }
}