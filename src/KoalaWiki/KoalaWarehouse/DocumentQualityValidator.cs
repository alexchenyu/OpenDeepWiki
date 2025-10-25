using System;
using System.Linq;
using System.Text.RegularExpressions;

namespace KoalaWiki.KoalaWarehouse;

/// <summary>
/// 验证文档质量，检测占位符和未完成的内容
/// </summary>
public class DocumentQualityValidator
{
    /// <summary>
    /// 占位符模式列表
    /// </summary>
    private static readonly string[] PlaceholderPatterns = new[]
    {
        @"(?:(?:<del>\s*)|(?:~~\s*))?\（扩展至\s*[\d,]+\s*字[^）]*\）(?:\s*</del>|~~)?",              // （扩展至 600 字...）
        @"(?:(?:<del>\s*)|(?:~~\s*))?\（约\s*[\d,]+\s*字[^）]*\）(?:\s*</del>|~~)?",                  // （约 1200 字，包括解释）
        @"(?:(?:<del>\s*)|(?:~~\s*))?\（[^（）]*约\s*[\d,]+\s*字[^（）]*\）(?:\s*</del>|~~)?",        // （总字数约 8500 字）
        @"(?:(?:<del>\s*)|(?:~~\s*))?\(约\s*[\d,]+\s*字[^)]*\)(?:\s*</del>|~~)?",                   // (约 1200 字，包括解释)
        @"(?:(?:<del>\s*)|(?:~~\s*))?\([^()]*约\s*[\d,]+\s*字[^()]*\)(?:\s*</del>|~~)?",            // (总字数约 8500 字)
        @"(?:(?:<del>\s*)|(?:~~\s*))?\（[\d,]+\s*字[^）]*\）(?:\s*</del>|~~)?",                      // （400 字...）
        @"(?:(?:<del>\s*)|(?:~~\s*))?\([\d,]+\s*字[^)]*\)(?:\s*</del>|~~)?",                        // (400 字…)
        @"(?:(?:<del>\s*)|(?:~~\s*))?\(extend\s+to\s+[\d,]+\s+words[^)]*\)(?:\s*</del>|~~)?",      // (extend to 600 words...)
        @"\[TODO[^\]]*\]",                           // [TODO: add more details]
        @"\[扩展[^\]]*\]",                           // [扩展示例至 1000 字]
        @"\.\.\.[^.]{0,20}字[^.]{0,20}\.\.\.",      // ...more content... 字 ...
        @"further\s+details\s+to\s+be\s+added",     // further details to be added
        @"more\s+content\s+here",                    // more content here
        @"\[expand\s+this\s+section\]",              // [expand this section]
        @"包括故障排除\.\.\.\）",                    // 包括故障排除...）
        @"包括\s+QEMU\s+测试\.\.\.\）",              // 包括 QEMU 测试...）
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

        // 第一步：清理占位符模式（可能包含 <del> 或 ~~ 包裹）
        foreach (var pattern in PlaceholderPatterns)
        {
            var regex = new Regex(pattern, RegexOptions.IgnoreCase | RegexOptions.Multiline);
            result = regex.Replace(result, "");
        }

        // 第二步：移除所有 <del> 标签，但保留其内容
        // 这样可以保留文本，只是去掉删除线样式
        result = Regex.Replace(result, @"<del[^>]*>(.*?)</del>", "$1", RegexOptions.IgnoreCase | RegexOptions.Singleline);

        // 第三步：移除 Markdown 删除线语法 ~~text~~，但保留内容
        result = Regex.Replace(result, @"~~(.+?)~~", "$1", RegexOptions.Multiline);

        // 第四步：清理可能遗留的空标签
        result = Regex.Replace(result, @"<del>\s*</del>", "", RegexOptions.IgnoreCase | RegexOptions.Multiline);
        result = Regex.Replace(result, @"~~\s*~~", "", RegexOptions.Multiline);

        // 第五步：清理多余的空行（占位符删除后可能留下的）
        result = Regex.Replace(result, @"\n{3,}", "\n\n");

        // 第六步：清理多余的空格
        result = Regex.Replace(result, @" {2,}", " ", RegexOptions.Multiline);

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
