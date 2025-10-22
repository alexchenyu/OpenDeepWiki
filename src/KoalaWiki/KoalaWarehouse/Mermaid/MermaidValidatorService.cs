using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace KoalaWiki.KoalaWarehouse.Mermaid;

/// <summary>
/// Pure Mermaid diagram validator using Puppeteer + official mermaid.parse()
///
/// This service ONLY validates syntax - it does NOT attempt to fix errors.
/// If validation fails, the error should be logged and reported to improve AI prompts.
/// </summary>
internal static class MermaidValidatorService
{
    private const int ValidationTimeoutMilliseconds = 30000; // Puppeteer needs more time

    /// <summary>
    /// Validation result from Puppeteer-based validator
    /// </summary>
    public record ValidationResult
    {
        [JsonPropertyName("isValid")]
        public bool IsValid { get; init; }

        [JsonPropertyName("diagramType")]
        public string? DiagramType { get; init; }

        [JsonPropertyName("errors")]
        public string[] Errors { get; init; } = Array.Empty<string>();

        /// <summary>
        /// Get a human-readable summary of the validation result
        /// </summary>
        public string GetSummary()
        {
            if (IsValid)
            {
                return $"Valid {DiagramType ?? "unknown"} diagram";
            }

            var firstError = Errors.Length > 0 ? Errors[0] : "Unknown error";
            // Extract the most relevant part of the error message
            var lines = firstError.Split('\n');
            var errorLine = lines.FirstOrDefault(l => l.Contains("error", StringComparison.OrdinalIgnoreCase)
                                                      || l.Contains("expecting", StringComparison.OrdinalIgnoreCase))
                            ?? lines[0];

            return $"Invalid syntax: {errorLine.Trim()}";
        }
    }

    /// <summary>
    /// Validate Mermaid diagram syntax using official mermaid.parse() API
    /// </summary>
    /// <param name="mermaidCode">Mermaid diagram code to validate</param>
    /// <returns>Validation result with detailed error information</returns>
    public static ValidationResult Validate(string mermaidCode)
    {
        if (string.IsNullOrWhiteSpace(mermaidCode))
        {
            return new ValidationResult
            {
                IsValid = false,
                Errors = new[] { "Empty Mermaid diagram content." }
            };
        }

        if (!TryResolveValidatorScript(out var scriptPath, out var skipReason))
        {
            Log.Logger.Debug("Mermaid validator not available: {Reason}", skipReason);

            // If validator is not available, assume valid (optimistic)
            // This allows the system to work even without Node.js
            return new ValidationResult
            {
                IsValid = true,
                Errors = new[] { $"Validation skipped: {skipReason}" }
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
                return OptimisticResult(mermaidCode, "Failed to start Node.js process");
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

                return OptimisticResult(mermaidCode, "Validation timed out");
            }

            var stdout = process.StandardOutput.ReadToEnd();
            var stderr = process.StandardError.ReadToEnd();

            // Check for Node.js errors
            if (!string.IsNullOrWhiteSpace(stderr))
            {
                Log.Logger.Warning("Mermaid validator stderr: {Error}", stderr);

                if (stderr.Contains("Cannot find module", StringComparison.OrdinalIgnoreCase) ||
                    stderr.Contains("ERR_MODULE_NOT_FOUND", StringComparison.OrdinalIgnoreCase))
                {
                    return OptimisticResult(mermaidCode, "Puppeteer not installed");
                }
            }

            if (string.IsNullOrWhiteSpace(stdout))
            {
                return OptimisticResult(mermaidCode, "No output from validator");
            }

            // Parse JSON result
            var result = JsonSerializer.Deserialize<ValidationResult>(stdout, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (result == null)
            {
                return OptimisticResult(mermaidCode, "Failed to parse validator output");
            }

            // Log validation results
            if (result.IsValid)
            {
                Log.Logger.Debug("Mermaid diagram validated successfully: {Type}", result.DiagramType);
            }
            else
            {
                Log.Logger.Warning("Mermaid validation failed: {Summary}", result.GetSummary());

                // Log full error details at debug level
                foreach (var error in result.Errors)
                {
                    Log.Logger.Debug("Mermaid error detail: {Error}", error);
                }
            }

            return result;
        }
        catch (Exception ex)
        {
            Log.Logger.Warning(ex, "Mermaid validator exception");
            return OptimisticResult(mermaidCode, $"Exception: {ex.Message}");
        }
    }

    /// <summary>
    /// Create an optimistic result when validation is skipped
    /// </summary>
    private static ValidationResult OptimisticResult(string originalCode, string reason)
    {
        return new ValidationResult
        {
            IsValid = true, // Assume valid to allow rendering
            Errors = new[] { $"Validation skipped: {reason}" }
        };
    }

    private static bool TryResolveValidatorScript(out string scriptPath, out string? reason)
    {
        scriptPath = string.Empty;
        reason = null;

        var baseDirectory = AppContext.BaseDirectory;
        var candidatePaths = new[]
        {
            Path.Combine(baseDirectory, "scripts", "mermaid-validator", "puppeteer-validator.mjs"),
            Path.Combine(baseDirectory, "scripts", "mermaid-validator", "validate-and-fix.mjs"),
        };

        var existing = candidatePaths.FirstOrDefault(File.Exists);
        if (existing is null)
        {
            reason = $"Mermaid validator script not found under {Path.Combine(baseDirectory, "scripts", "mermaid-validator")}.";
            return false;
        }

        scriptPath = existing;
        return true;
    }
}
