using System;
using System.Linq;
using System.Text.RegularExpressions;
using Serilog;

namespace KoalaWiki.KoalaWarehouse;

/// <summary>
/// 验证文档质量，检测占位符和未完成的内容
/// </summary>
public class DocumentQualityValidator
{
    /// <summary>
    /// 占位符模式列表
    /// 注意：这些模式已简化，不再匹配 <del> 或 ~~ 包裹的情况
    /// 因为我们会在后续步骤中统一处理这些标记
    /// </summary>
    private static readonly string[] PlaceholderPatterns = new[]
    {
        // 全角括号 - 中文字数占位符
        @"（\s*扩展至\s*[\d,]+\s*字[^）]*\）",                    // （扩展至 600 字...）
        @"（\s*约\s*[\d,]+\s*字[^）]*\）",                        // （约 1200 字，包括解释）、（约700字）
        @"（[^（）]*约\s*[\d,]+\s*字[^（）]*\）",                 // （总字数约 8500 字）
        @"（\s*[\d,]+\s*字[^）]*\）",                             // （400 字...）、（700字）

        // 半角括号 - 中文字数占位符
        @"\(\s*扩展至\s*[\d,]+\s*字[^)]*\)",                     // (扩展至 600 字...)
        @"\(\s*约\s*[\d,]+\s*字[^)]*\)",                         // (约 1200 字，包括解释)、(约700字)
        @"\([^()]*约\s*[\d,]+\s*字[^()]*\)",                     // (总字数约 8500 字)
        @"\(\s*[\d,]+\s*字[^)]*\)",                              // (400 字…)、(700字)

        // 英文字数占位符
        @"\(\s*extend\s+to\s+[\d,]+\s+words[^)]*\)",            // (extend to 600 words...)
        @"\(\s*about\s+[\d,]+\s+words[^)]*\)",                  // (about 700 words)
        @"\(\s*approx\.?\s+[\d,]+\s+words[^)]*\)",              // (approx. 700 words)
        @"\(\s*~[\d,]+\s+words[^)]*\)",                         // (~700 words)

        // TODO 和扩展标记
        @"\[TODO[^\]]*\]",                                       // [TODO: add more details]
        @"\[扩展[^\]]*\]",                                       // [扩展示例至 1000 字]
        @"\[expand\s+this\s+section\]",                          // [expand this section]

        // 省略号 + 字数提示
        @"\.\.\.[^.]{0,30}字[^.]{0,30}\.\.\.",                  // ...more content... 字 ...
        @"\.{3,}\s*\d+\s*字\s*\.{3,}",                          // ... 700 字 ...

        // 通用占位符文本
        @"further\s+details\s+to\s+be\s+added",                 // further details to be added
        @"more\s+content\s+here",                                // more content here
        @"to\s+be\s+completed",                                  // to be completed
        @"placeholder\s+text",                                   // placeholder text

        // 特定格式的不完整句子
        @"包括故障排除\.\.\.\）",                                // 包括故障排除...）
        @"包括\s+QEMU\s+测试\.\.\.\）",                          // 包括 QEMU 测试...）
        @"包括[^。，！？\n]{0,20}\.\.\.[）)]",                   // 包括xxx...）
    };

    /// <summary>
    /// 验证文档内容，检测是否包含占位符
    /// </summary>
    /// <param name="content">文档内容</param>
    /// <returns>验证结果</returns>
    public static DocumentQualityResult ValidateDocument(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return new DocumentQualityResult
            {
                IsValid = false,
                ErrorMessage = "文档内容为空",
                PlaceholdersFound = Array.Empty<string>()
            };
        }

        var foundPlaceholders = new List<string>();

        foreach (var pattern in PlaceholderPatterns)
        {
            var regex = new Regex(pattern, RegexOptions.IgnoreCase | RegexOptions.Multiline);
            var matches = regex.Matches(content);

            foreach (Match match in matches)
            {
                foundPlaceholders.Add(match.Value);
            }
        }

        if (foundPlaceholders.Count > 0)
        {
            var distinctPlaceholders = foundPlaceholders.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

            return new DocumentQualityResult
            {
                IsValid = false,
                ErrorMessage = $"文档包含 {distinctPlaceholders.Length} 个占位符，需要重新生成",
                PlaceholdersFound = distinctPlaceholders
            };
        }

        return new DocumentQualityResult
        {
            IsValid = true,
            ErrorMessage = null,
            PlaceholdersFound = Array.Empty<string>()
        };
    }

    /// <summary>
    /// 清理文档中的占位符和删除线标记
    /// </summary>
    /// <param name="content">文档内容</param>
    /// <returns>清理后的内容</returns>
    public static string RemovePlaceholders(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        var result = content;

        // 第一步：先移除所有 <del> 标签，保留其内容
        // 这样被 <del> 包裹的占位符就会暴露出来，便于后续匹配
        result = Regex.Replace(result, @"<del[^>]*>(.*?)</del>", "$1", RegexOptions.IgnoreCase | RegexOptions.Singleline);

        // 第二步：移除 Markdown 删除线语法 ~~text~~，保留内容
        result = Regex.Replace(result, @"~~(.+?)~~", "$1", RegexOptions.Multiline);

        // 第三步：清理所有占位符模式（现在这些占位符不再被标签包裹）
        foreach (var pattern in PlaceholderPatterns)
        {
            var regex = new Regex(pattern, RegexOptions.IgnoreCase | RegexOptions.Multiline);
            var before = result;
            result = regex.Replace(result, "");

            // 调试日志：记录哪些模式匹配成功
            if (before != result)
            {
                Log.Logger.Debug("占位符模式匹配成功: {Pattern}", pattern);
            }
        }

        // 第四步：清理可能遗留的空标签
        result = Regex.Replace(result, @"<del>\s*</del>", "", RegexOptions.IgnoreCase | RegexOptions.Multiline);
        result = Regex.Replace(result, @"~~\s*~~", "", RegexOptions.Multiline);

        // 第五步：清理多余的空行（占位符删除后可能留下的）
        result = Regex.Replace(result, @"\n{3,}", "\n\n");

        // 第六步：清理多余的空格
        result = Regex.Replace(result, @" {2,}", " ", RegexOptions.Multiline);

        // 第七步：清理段落开头和结尾的空格
        result = Regex.Replace(result, @"^\s+", "", RegexOptions.Multiline);
        result = Regex.Replace(result, @"\s+$", "", RegexOptions.Multiline);

        return result.Trim();
    }
}

/// <summary>
/// 文档质量验证结果
/// </summary>
public class DocumentQualityResult
{
    /// <summary>
    /// 是否通过验证
    /// </summary>
    public bool IsValid { get; set; }

    /// <summary>
    /// 错误信息
    /// </summary>
    public string? ErrorMessage { get; set; }

    /// <summary>
    /// 发现的占位符列表
    /// </summary>
    public string[] PlaceholdersFound { get; set; } = Array.Empty<string>();

    /// <summary>
    /// 占位符数量
    /// </summary>
    public int PlaceholderCount => PlaceholdersFound.Length;
}
