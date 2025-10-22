using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace KoalaWiki.KoalaWarehouse.Mermaid;

/// <summary>
/// Advanced Mermaid diagram validator and fixer using the official mermaid.js library
/// </summary>
internal static class MermaidFixerService
{
    private const int ValidationTimeoutMilliseconds = 10000;

    /// <summary>
    /// Validation and fix result from Node.js script
    /// </summary>
    public record FixResult
    {
        [JsonPropertyName("isValid")]
        public bool IsValid { get; init; }

        [JsonPropertyName("originalCode")]
        public string OriginalCode { get; init; } = string.Empty;

        [JsonPropertyName("fixedCode")]
        public string FixedCode { get; init; } = string.Empty;

        [JsonPropertyName("errors")]
        public string[] Errors { get; init; } = Array.Empty<string>();

        [JsonPropertyName("fixesApplied")]
        public string[] FixesApplied { get; init; } = Array.Empty<string>();

        [JsonPropertyName("diagramType")]
        public string? DiagramType { get; init; }
    }

    /// <summary>
    /// Validate and automatically fix Mermaid diagram syntax
    /// </summary>
    /// <param name="mermaidCode">Original Mermaid diagram code</param>
    /// <returns>Fix result with validation status and corrected code</returns>
    public static FixResult ValidateAndFix(string mermaidCode)
    {
        if (string.IsNullOrWhiteSpace(mermaidCode))
        {
            return new FixResult
            {
                IsValid = false,
                OriginalCode = mermaidCode ?? string.Empty,
                FixedCode = string.Empty,
                Errors = new[] { "Empty Mermaid diagram content." }
            };
        }

        if (!TryResolveFixerScript(out var scriptPath, out var skipReason))
        {
            Log.Logger.Warning("Mermaid fixer not available: {Reason}", skipReason);
            // Fallback: return original code as "fixed" without validation
            return new FixResult
            {
                IsValid = true,
                OriginalCode = mermaidCode,
                FixedCode = mermaidCode,
                Errors = new[] { $"Fixer skipped: {skipReason}" }
            };
        }

        try
        {
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "node",
                    Arguments = $"\"{scriptPath}\"",
                    RedirectStandardInput = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };

            if (!process.Start())
            {
                Log.Logger.Warning("Failed to start Node.js process for Mermaid validation");
                return FallbackResult(mermaidCode, "Failed to start Node.js process");
            }

            // Write mermaid code to stdin
            process.StandardInput.Write(mermaidCode);
            process.StandardInput.Close();

            if (!process.WaitForExit(ValidationTimeoutMilliseconds))
            {
                try
                {
                    process.Kill();
                }
                catch
                {
                    // ignore termination failures
                }

                return FallbackResult(mermaidCode, "Mermaid validation timed out");
            }

            var stdout = process.StandardOutput.ReadToEnd();
            var stderr = process.StandardError.ReadToEnd();

            if (string.IsNullOrWhiteSpace(stdout))
            {
                if (!string.IsNullOrWhiteSpace(stderr))
                {
                    Log.Logger.Warning("Mermaid fixer error: {Error}", stderr);
                    if (stderr.Contains("Cannot find module", StringComparison.OrdinalIgnoreCase) ||
                        stderr.Contains("ERR_MODULE_NOT_FOUND", StringComparison.OrdinalIgnoreCase))
                    {
                        return FallbackResult(mermaidCode, "Mermaid dependency not installed");
                    }
                }

                return FallbackResult(mermaidCode, "No output from fixer script");
            }

            // Parse JSON result
            var result = JsonSerializer.Deserialize<FixResult>(stdout, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (result == null)
            {
                return FallbackResult(mermaidCode, "Failed to parse fixer output");
            }

            // Log fixes applied
            if (result.FixesApplied.Length > 0)
            {
                Log.Logger.Information("Mermaid fixes applied: {Fixes}", string.Join(", ", result.FixesApplied));
            }

            // Log validation errors
            if (!result.IsValid && result.Errors.Length > 0)
            {
                Log.Logger.Warning("Mermaid validation failed: {Errors}", string.Join(", ", result.Errors));
            }

            return result;
        }
        catch (Exception ex)
        {
            Log.Logger.Warning(ex, "Mermaid fixer exception");
            return FallbackResult(mermaidCode, $"Exception: {ex.Message}");
        }
    }

    private static FixResult FallbackResult(string originalCode, string reason)
    {
        return new FixResult
        {
            IsValid = true, // Assume valid to allow rendering
            OriginalCode = originalCode,
            FixedCode = originalCode,
            Errors = new[] { $"Validation skipped: {reason}" }
        };
    }

    private static bool TryResolveFixerScript(out string scriptPath, out string? reason)
    {
        scriptPath = string.Empty;
        reason = null;

        var baseDirectory = AppContext.BaseDirectory;
        var candidatePaths = new[]
        {
            Path.Combine(baseDirectory, "scripts", "mermaid-validator", "validate-and-fix.mjs"),
            Path.Combine(baseDirectory, "scripts", "mermaid-validator", "validate-and-fix.js"),
        };

        var existing = candidatePaths.FirstOrDefault(File.Exists);
        if (existing is null)
        {
            reason = $"Mermaid fixer script not found under {Path.Combine(baseDirectory, "scripts", "mermaid-validator")}.";
            return false;
        }

        scriptPath = existing;
        return true;
    }
}
