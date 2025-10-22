using System.Text.RegularExpressions;

namespace KoalaWiki.KoalaWarehouse.Mermaid;

/// <summary>
/// Simple, safe Mermaid fixes for KNOWN, CONFIRMED issues
///
/// Philosophy:
/// - Only fix errors we are 100% certain about
/// - Each fix must be well-documented with the exact error it addresses
/// - If unsure, don't fix - let validation fail instead
/// </summary>
internal static class MermaidSimpleFixer
{
    /// <summary>
    /// Apply simple, safe fixes to known Mermaid syntax issues
    /// </summary>
    /// <param name="code">Original Mermaid code</param>
    /// <returns>Potentially fixed code</returns>
    public static string ApplySafeFixes(string code)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return code;
        }

        var result = code;
        var fixesApplied = new System.Collections.Generic.List<string>();

        // Fix #1: Remove note after terminal state [*] in stateDiagram
        // Error: "Parse error... got 'DESCR'"
        // Invalid: Running --> [*] : exit note right: "text"
        // Valid: Running --> [*] : exit
        var beforeFix1 = result;
        result = Regex.Replace(
            result,
            @"(-->\s*\[\*\][^:\n]*:[^n\r]*)(note\s+(right|left|over)[^\n]*)",
            "$1",
            RegexOptions.Multiline | RegexOptions.IgnoreCase
        );
        if (result != beforeFix1)
        {
            fixesApplied.Add("Removed 'note' after terminal state [*]");
        }

        // Fix #2: Remove note on same line as [*] without label
        // Invalid: Running --> [*] note right: "text"
        // Valid: Running --> [*]
        var beforeFix2 = result;
        result = Regex.Replace(
            result,
            @"(-->\s*\[\*\])\s+(note\s+(right|left|over)[^\n]*)",
            "$1",
            RegexOptions.Multiline | RegexOptions.IgnoreCase
        );
        if (result != beforeFix2)
        {
            fixesApplied.Add("Removed 'note' on same line as [*]");
        }

        // Fix #3: Remove trailing whitespace (safe cleanup)
        var beforeFix3 = result;
        result = Regex.Replace(result, @"[ \t]+$", "", RegexOptions.Multiline);
        if (result != beforeFix3)
        {
            fixesApplied.Add("Removed trailing whitespace");
        }

        // Fix #4: Remove excessive blank lines (safe cleanup)
        var beforeFix4 = result;
        result = Regex.Replace(result, @"\n{3,}", "\n\n");
        if (result != beforeFix4)
        {
            fixesApplied.Add("Removed excessive blank lines");
        }

        // Log fixes if any were applied
        if (fixesApplied.Count > 0)
        {
            Log.Logger.Information(
                "Applied {Count} safe Mermaid fixes: {Fixes}",
                fixesApplied.Count,
                string.Join(", ", fixesApplied)
            );
        }

        return result;
    }

    /// <summary>
    /// Check if the code contains known fixable issues
    /// </summary>
    public static bool HasKnownFixableIssues(string code)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return false;
        }

        // Check for "note after [*]" issue
        if (Regex.IsMatch(code, @"-->\s*\[\*\][^\n]*note\s+(right|left|over)", RegexOptions.IgnoreCase))
        {
            return true;
        }

        return false;
    }
}
