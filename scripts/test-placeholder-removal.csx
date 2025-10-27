#!/usr/bin/env dotnet-script
/*
 * 测试占位符清理功能
 * 用法: dotnet script scripts/test-placeholder-removal.csx
 */

using System;
using System.Text.RegularExpressions;

// 测试用例
var testCases = new[]
{
    "（约700字）",
    "（约500字）",
    "（约600字）",
    "（约 700 字）",
    "（700字）",
    "（扩展至 600 字...）",
    "（约 1200 字，包括解释）",
    "<del>（约700字）</del>",
    "~~（约500字）~~",
    "(约700字)",
    "(约 700 字)",
    "(700字)",
    "[TODO: add more details]",
    "...more content... 字 ...",
    "这是正常文本（约700字）后面还有内容",
};

// 占位符模式（从 DocumentQualityValidator.cs 复制）
var placeholderPatterns = new[]
{
    // 全角括号 - 中文字数占位符
    @"（\s*扩展至\s*[\d,]+\s*字[^）]*\）",
    @"（\s*约\s*[\d,]+\s*字[^）]*\）",
    @"（[^（）]*约\s*[\d,]+\s*字[^（）]*\）",
    @"（\s*[\d,]+\s*字[^）]*\）",

    // 半角括号 - 中文字数占位符
    @"\(\s*扩展至\s*[\d,]+\s*字[^)]*\)",
    @"\(\s*约\s*[\d,]+\s*字[^)]*\)",
    @"\([^()]*约\s*[\d,]+\s*字[^()]*\)",
    @"\(\s*[\d,]+\s*字[^)]*\)",

    // 英文字数占位符
    @"\(\s*extend\s+to\s+[\d,]+\s+words[^)]*\)",
    @"\(\s*about\s+[\d,]+\s+words[^)]*\)",
    @"\(\s*approx\.?\s+[\d,]+\s+words[^)]*\)",
    @"\(\s*~[\d,]+\s+words[^)]*\)",

    // TODO 和扩展标记
    @"\[TODO[^\]]*\]",
    @"\[扩展[^\]]*\]",
    @"\[expand\s+this\s+section\]",

    // 省略号 + 字数提示
    @"\.\.\.[^.]{0,30}字[^.]{0,30}\.\.\.",
    @"\.{3,}\s*\d+\s*字\s*\.{3,}",

    // 通用占位符文本
    @"further\s+details\s+to\s+be\s+added",
    @"more\s+content\s+here",
    @"to\s+be\s+completed",
    @"placeholder\s+text",

    // 特定格式的不完整句子
    @"包括故障排除\.\.\.\）",
    @"包括\s+QEMU\s+测试\.\.\.\）",
    @"包括[^。，！？\n]{0,20}\.\.\.[）)]",
};

Console.WriteLine("=== 占位符清理测试 ===\n");

foreach (var testCase in testCases)
{
    Console.WriteLine($"测试: \"{testCase}\"");

    var result = testCase;

    // 第一步：移除 <del> 标签
    result = Regex.Replace(result, @"<del[^>]*>(.*?)</del>", "$1", RegexOptions.IgnoreCase | RegexOptions.Singleline);

    // 第二步：移除 ~~ 删除线
    result = Regex.Replace(result, @"~~(.+?)~~", "$1", RegexOptions.Multiline);

    // 第三步：清理占位符
    var matchedPatterns = new List<string>();
    foreach (var pattern in placeholderPatterns)
    {
        var regex = new Regex(pattern, RegexOptions.IgnoreCase | RegexOptions.Multiline);
        if (regex.IsMatch(result))
        {
            matchedPatterns.Add(pattern);
            result = regex.Replace(result, "");
        }
    }

    // 第四步：清理空白
    result = Regex.Replace(result, @"\n{3,}", "\n\n");
    result = Regex.Replace(result, @" {2,}", " ", RegexOptions.Multiline);
    result = result.Trim();

    Console.WriteLine($"  结果: \"{result}\"");
    Console.WriteLine($"  匹配的模式数: {matchedPatterns.Count}");

    if (matchedPatterns.Count > 0)
    {
        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine($"  ✓ 占位符已清理");
        Console.ResetColor();
    }
    else
    {
        // 检查是否仍包含占位符特征
        if (Regex.IsMatch(result, @"[（(]\s*约?\s*\d+\s*字"))
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine($"  ✗ 警告：仍包含字数占位符！");
            Console.ResetColor();
        }
        else
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine($"  - 未匹配（可能是正常文本）");
            Console.ResetColor();
        }
    }

    Console.WriteLine();
}

Console.WriteLine("\n=== 测试完成 ===");
