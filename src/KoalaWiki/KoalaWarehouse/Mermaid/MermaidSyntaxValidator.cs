using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;

namespace KoalaWiki.KoalaWarehouse.Mermaid;

internal static class MermaidSyntaxValidator
{
    private const int ValidationTimeoutMilliseconds = 5000;

    public static MermaidValidationResult Validate(string mermaidCode)
    {
        if (string.IsNullOrWhiteSpace(mermaidCode))
        {
            return MermaidValidationResult.Invalid("Empty Mermaid diagram content.");
        }

        if (!TryResolveValidatorScript(out var scriptPath, out var skipReason))
        {
            return MermaidValidationResult.Skipped(skipReason);
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
                return MermaidValidationResult.Skipped("Failed to start Node.js process for Mermaid validation.");
            }

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

                return MermaidValidationResult.Invalid("Mermaid validation timed out.");
            }

            var stdout = process.StandardOutput.ReadToEnd();
            var stderr = process.StandardError.ReadToEnd();

            if (process.ExitCode == 0)
            {
                return MermaidValidationResult.Valid();
            }

            var message = !string.IsNullOrWhiteSpace(stdout) ? stdout : stderr;
            if (string.IsNullOrWhiteSpace(message))
            {
                message = "Unknown Mermaid validation error.";
            }

            if (message.Contains("Cannot find module", StringComparison.OrdinalIgnoreCase) ||
                message.Contains("ERR_MODULE_NOT_FOUND", StringComparison.OrdinalIgnoreCase))
            {
                return MermaidValidationResult.Skipped("Mermaid validator dependency '@mermaid-js/mermaid' is not installed.");
            }

            // Keep only the first line to avoid overwhelming comments
            var firstLine = message.Split('\n').FirstOrDefault()?.Trim();
            return MermaidValidationResult.Invalid(firstLine ?? message.Trim());
        }
        catch (Exception ex) when (ex is InvalidOperationException or Win32Exception or PlatformNotSupportedException)
        {
            return MermaidValidationResult.Skipped($"Mermaid validation skipped: {ex.Message}");
        }
    }

    private static bool TryResolveValidatorScript(out string scriptPath, out string? reason)
    {
        scriptPath = string.Empty;
        reason = null;

        var baseDirectory = AppContext.BaseDirectory;
        var candidatePaths = new[]
        {
            Path.Combine(baseDirectory, "scripts", "mermaid-validator", "validate.mjs"),
            Path.Combine(baseDirectory, "scripts", "mermaid-validator", "validate.js"),
            Path.Combine(baseDirectory, "scripts", "mermaid-validator", "validate.cjs"),
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
