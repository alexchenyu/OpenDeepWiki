using System.ComponentModel;
using System.Text.Json;

namespace KoalaWiki.Tools;

public class CodeAnalyzeTool(string gitPath)
{
    /// <summary>
    /// Analyzes the dependency tree of a specified function within a file.
    /// </summary>
    /// <param name="filePath">The path to the file containing the function to analyze.</param>
    /// <param name="functionName">The name of the function to analyze for dependency relationships.</param>
    /// <returns>A JSON string representing the dependency tree of the specified function.</returns>
    [KernelFunction, Description(
         """
         Analyzes the complete dependency tree for a specified function within a code file.

         Parameters:
         - filePath: Relative path from Git repository root (e.g., src/service/user.ts)
         - functionName: Exact name of function/method to analyze

         Returns:
         - Strict JSON tree structure with function call hierarchy
         - Only actual detected dependencies - no speculation or fabricated relationships
         - Empty result indicates function not found or no dependencies

         Constraints:
         - Analyzes existing code files only - never creates or assumes file content
         - Returns only verified dependencies - no inferred or potential calls
         - Returns error for non-existent paths
         """)]
    public async Task<string> AnalyzeFunctionDependencyTree(
        [Description("File Path")] string filePath,
        [Description("Analyze the dependency relationship of the specified method")]
        string functionName)
    {
        try
        {
            Log.Logger.Information($"ReadCodeFileAsync: {filePath} {functionName}");

            var newPath = Path.Combine(gitPath, filePath.TrimStart('/'));

            var code = new DependencyAnalyzer(gitPath);

            var result = await code.AnalyzeFunctionDependencyTree(newPath, functionName);

            return JsonSerializer.Serialize(result, JsonSerializerOptions.Web);
        }
        catch (Exception ex)
        {
            // 文件不存在或分析失败（正常情况，AI 可能查询不存在的文件）
            Console.WriteLine($"[INFO] Code analysis failed: {ex.Message}");
            return $"Code analysis failed: {ex.Message}";
        }
    }

    /// <summary>
    /// 分析指定文件的依赖关系
    /// </summary>
    /// <returns></returns>
    [KernelFunction, Description("Analyze the dependency relationship of the specified file")]
    [return: Description("Return the dependency tree of the specified file")]
    public async Task<string> AnalyzeFileDependencyTree(
        [Description("File Path")] string filePath)
    {
        try
        {
            Log.Logger.Information($"ReadCodeFileAsync: {filePath}");

            var newPath = Path.Combine(gitPath, filePath.TrimStart('/'));

            var code = new DependencyAnalyzer(gitPath);

            var result = await code.AnalyzeFileDependencyTree(newPath);

            return JsonSerializer.Serialize(result, JsonSerializerOptions.Web);
        }
        catch (Exception ex)
        {
            // 文件不存在或分析失败（正常情况，AI 可能查询不存在的文件）
            Console.WriteLine($"[INFO] Code analysis failed: {ex.Message}");
            return $"Code analysis failed: {ex.Message}";
        }
    }
}