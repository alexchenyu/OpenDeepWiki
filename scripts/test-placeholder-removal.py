#!/usr/bin/env python3
"""
测试占位符清理功能
用法: python3 scripts/test-placeholder-removal.py
"""

import re

# 测试用例
test_cases = [
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
]

# 占位符模式（从 DocumentQualityValidator.cs 复制）
placeholder_patterns = [
    # 全角括号 - 中文字数占位符
    r"（\s*扩展至\s*[\d,]+\s*字[^）]*\）",
    r"（\s*约\s*[\d,]+\s*字[^）]*\）",
    r"（[^（）]*约\s*[\d,]+\s*字[^（）]*\）",
    r"（\s*[\d,]+\s*字[^）]*\）",

    # 半角括号 - 中文字数占位符
    r"\(\s*扩展至\s*[\d,]+\s*字[^)]*\)",
    r"\(\s*约\s*[\d,]+\s*字[^)]*\)",
    r"\([^()]*约\s*[\d,]+\s*字[^()]*\)",
    r"\(\s*[\d,]+\s*字[^)]*\)",

    # 英文字数占位符
    r"\(\s*extend\s+to\s+[\d,]+\s+words[^)]*\)",
    r"\(\s*about\s+[\d,]+\s+words[^)]*\)",
    r"\(\s*approx\.?\s+[\d,]+\s+words[^)]*\)",
    r"\(\s*~[\d,]+\s+words[^)]*\)",

    # TODO 和扩展标记
    r"\[TODO[^\]]*\]",
    r"\[扩展[^\]]*\]",
    r"\[expand\s+this\s+section\]",

    # 省略号 + 字数提示
    r"\.\.\.[^.]{0,30}字[^.]{0,30}\.\.\.",
    r"\.{3,}\s*\d+\s*字\s*\.{3,}",

    # 通用占位符文本
    r"further\s+details\s+to\s+be\s+added",
    r"more\s+content\s+here",
    r"to\s+be\s+completed",
    r"placeholder\s+text",

    # 特定格式的不完整句子
    r"包括故障排除\.\.\.\）",
    r"包括\s+QEMU\s+测试\.\.\.\）",
    r"包括[^。，！？\n]{0,20}\.\.\.[）)]",
]

print("=== 占位符清理测试 ===\n")

for test_case in test_cases:
    print(f'测试: "{test_case}"')

    result = test_case

    # 第一步：移除 <del> 标签
    result = re.sub(r'<del[^>]*>(.*?)</del>', r'\1', result, flags=re.IGNORECASE | re.DOTALL)

    # 第二步：移除 ~~ 删除线
    result = re.sub(r'~~(.+?)~~', r'\1', result, flags=re.MULTILINE)

    # 第三步：清理占位符
    matched_patterns = []
    for pattern in placeholder_patterns:
        regex = re.compile(pattern, re.IGNORECASE | re.MULTILINE)
        if regex.search(result):
            matched_patterns.append(pattern)
            result = regex.sub('', result)

    # 第四步：清理空白
    result = re.sub(r'\n{3,}', '\n\n', result)
    result = re.sub(r' {2,}', ' ', result, flags=re.MULTILINE)
    result = result.strip()

    print(f'  结果: "{result}"')
    print(f'  匹配的模式数: {len(matched_patterns)}')

    if matched_patterns:
        print(f'  \033[92m✓ 占位符已清理\033[0m')
    else:
        # 检查是否仍包含占位符特征
        if re.search(r'[（(]\s*约?\s*\d+\s*字', result):
            print(f'  \033[91m✗ 警告：仍包含字数占位符！\033[0m')
        else:
            print(f'  \033[93m- 未匹配（可能是正常文本）\033[0m')

    print()

print("\n=== 测试完成 ===")
