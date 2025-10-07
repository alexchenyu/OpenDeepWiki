using System.Text;
using Serilog;

namespace KoalaWiki.Extensions;

public static class CatalogueExtensions
{
    /// <summary>
    /// 获取智能过滤的优化树形目录结构
    /// </summary>
    /// <param name="document"></param>
    /// <param name="format">输出格式</param>
    /// <returns>优化后的目录结构</returns>
    public static string GetCatalogueSmartFilterOptimized(this Document document,
        string format = "compact")
    {
        var path = document.GitPath;

        var ignoreFiles = DocumentsHelper.GetIgnoreFiles(path);
        var pathInfos = new List<PathInfo>();

        // 递归扫描目录所有文件和目录
        DocumentsHelper.ScanDirectory(path, pathInfos, ignoreFiles);

        // 只保留文件，排除目录（避免 LLM 尝试读取目录导致错误和循环重试）
        var fileInfos = pathInfos.Where(p => p.Type == "File").ToList();

        // 如果文件数量超过500，返回智能摘要而非完整目录树
        if (fileInfos.Count >= 500)
        {
            return GenerateDirectorySummary(fileInfos, path);
        }

        var fileTree = FileTreeBuilder.BuildTree(fileInfos, path);
        return format.ToLower() switch
        {
            "json" => FileTreeBuilder.ToCompactJson(fileTree),
            "pathlist" => string.Join("\n", FileTreeBuilder.ToPathList(fileTree)),
            "compact" or _ => FileTreeBuilder.ToCompactString(fileTree)
        };
    }

    /// <summary>
    /// 为超大仓库生成智能目录摘要
    /// </summary>
    private static string GenerateDirectorySummary(List<PathInfo> pathInfos, string basePath)
    {
        var summary = new StringBuilder();
        summary.AppendLine("# Repository Structure Summary");
        summary.AppendLine($"## Total Files: {pathInfos.Count}");
        summary.AppendLine();
        
        // 按顶层目录分组统计（显示所有顶层目录，不限制数量）
        var topLevelGroups = pathInfos
            .Select(p => {
                var relativePath = p.Path.Replace(basePath, "").TrimStart(Path.DirectorySeparatorChar, '/');
                var parts = relativePath.Split(new[] { Path.DirectorySeparatorChar, '/' }, StringSplitOptions.RemoveEmptyEntries);
                return new { 
                    TopLevel = parts.Length > 0 ? parts[0] : relativePath,
                    IsTopLevel = parts.Length == 1,
                    Extension = Path.GetExtension(p.Path),
                    Type = p.Type
                };
            })
            .GroupBy(x => x.TopLevel)
            .Select(g => new {
                Name = g.Key,
                FileCount = g.Count(x => x.Type == "file"),
                DirCount = g.Count(x => x.Type == "directory"),
                Extensions = g.Where(x => !string.IsNullOrEmpty(x.Extension))
                             .GroupBy(x => x.Extension)
                             .OrderByDescending(ex => ex.Count())
                             .Take(5)  // 每个目录显示前5种文件类型
                             .Select(ex => $"{ex.Key}:{ex.Count()}")
            })
            .OrderByDescending(x => x.FileCount)  // 按文件数排序
            .ToList();
        
        summary.AppendLine("## Top-Level Directories (all):");
        foreach (var group in topLevelGroups)
        {
            var extInfo = group.Extensions.Any() ? $" ({string.Join(", ", group.Extensions)})" : "";
            summary.AppendLine($"📁 {group.Name}/ - {group.FileCount} files, {group.DirCount} subdirs{extInfo}");
        }
        
        summary.AppendLine();
        summary.AppendLine("## Important Top-Level Files:");
        var importantPatterns = new[] { 
            "README", "LICENSE", "CONTRIBUTING", "CHANGELOG",
            "package.json", "pom.xml", "build.gradle", "Cargo.toml", "go.mod",
            "Makefile", "CMakeLists.txt", "setup.py", "requirements.txt",
            ".gitignore", "Dockerfile", "docker-compose"
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
            .Select(p => Path.GetFileName(p.Path))
            .ToList();
        
        if (importantFiles.Any())
        {
            foreach (var file in importantFiles)
            {
                summary.AppendLine($"📄 {file}");
            }
        }
        else
        {
            summary.AppendLine("(No standard configuration files found at root level)");
        }
        
        // 添加全局文件类型统计
        summary.AppendLine();
        summary.AppendLine("## File Type Distribution (Top 10):");
        var fileTypeStats = pathInfos
            .Where(p => p.Type == "file" && !string.IsNullOrEmpty(Path.GetExtension(p.Path)))
            .GroupBy(p => Path.GetExtension(p.Path))
            .OrderByDescending(g => g.Count())
            .Take(10)
            .Select(g => $"{g.Key} ({g.Count()})");
        
        summary.AppendLine(string.Join(", ", fileTypeStats));
        
        // 添加探索指南
        summary.AppendLine();
        summary.AppendLine("## How to Explore This Repository:");
        summary.AppendLine("1. Read the README file (if available) to understand the project structure");
        summary.AppendLine("2. Based on the user's question, use the read_file tool to explore specific directories");
        summary.AppendLine("3. Focus on relevant file types and directories according to the task");
        summary.AppendLine("4. The AI has access to file reading tools to dive deeper when needed");
        
        Log.Logger.Warning("仓库文件数量过多({Count})，返回智能摘要而非完整目录结构", pathInfos.Count);
        
        return summary.ToString();
    }
}