using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace KoalaWiki.KoalaWarehouse.Mermaid;

internal static class MermaidStyleSanitizer
{
    private static readonly HashSet<string> AllowedProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "stroke",
        "stroke-width",
        "stroke-dasharray",
        "stroke-dashoffset",
        "stroke-opacity",
        "fill",
        "fill-opacity",
        "color",
        "opacity",
        "font-size",
        "font-weight",
        "font-style",
        "font-family",
        "text-decoration"
    };

    private static readonly Regex StyleLineRegex = new(@"^style\s+(""[^""]+""|[A-Za-z0-9_]+)\s*(.*)$", RegexOptions.Compiled);

    public static bool TryNormalize(string line, [NotNullWhen(true)] out string? normalized)
    {
        normalized = default;

        var match = StyleLineRegex.Match(line.Trim());
        if (!match.Success)
        {
            return false;
        }

        var nodeId = match.Groups[1].Value;
        var tail = match.Groups[2].Value.Trim();

        var properties = ParseProperties(tail);
        if (properties.Count == 0 && string.IsNullOrWhiteSpace(tail))
        {
            normalized = $"style {nodeId}";
            return true;
        }

        string? fillColor = null;
        if (properties.TryGetValue("fill", out var colorValue))
        {
            fillColor = NormalizeColor(colorValue);
            properties.Remove("fill");
        }

        fillColor ??= "#f9f9f9";

        var orderedProperties = properties
            .Where(pair => AllowedProperties.Contains(pair.Key) && !string.IsNullOrWhiteSpace(pair.Value))
            .Select(pair =>
            {
                var value = NormalizePropertyValue(pair.Key, pair.Value);
                return (Key: pair.Key.ToLowerInvariant(), Value: value);
            })
            .Where(pair => !string.IsNullOrWhiteSpace(pair.Value))
            .DistinctBy(pair => pair.Key)
            .OrderBy(pair => pair.Key)
            .ToList();

        var builder = new StringBuilder();
        builder.Append("style ");
        builder.Append(nodeId);
        builder.Append(' ');
        builder.Append("fill:");
        builder.Append(fillColor);

        foreach (var (key, value) in orderedProperties)
        {
            builder.Append(',');
            builder.Append(key);
            builder.Append(':');
            builder.Append(value);
        }

        normalized = builder.ToString();
        return true;
    }

    private static Dictionary<string, string> ParseProperties(string tail)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        if (string.IsNullOrWhiteSpace(tail))
        {
            return result;
        }

        var span = tail.AsSpan();
        var index = 0;
        while (index < span.Length)
        {
            // Skip separators
            while (index < span.Length && (span[index] == ' ' || span[index] == '\t' || span[index] == ',' || span[index] == ';'))
            {
                index++;
            }

            if (index >= span.Length)
            {
                break;
            }

            var nameStart = index;
            while (index < span.Length && (char.IsLetter(span[index]) || span[index] == '-' || span[index] == '_'))
            {
                index++;
            }

            if (index == nameStart)
            {
                // Cannot detect property name – stop parsing to avoid infinite loop
                break;
            }

            var propertyName = span[nameStart..index].ToString();

            // Skip whitespace before colon
            while (index < span.Length && char.IsWhiteSpace(span[index]))
            {
                index++;
            }

            if (index >= span.Length || span[index] != ':')
            {
                // Missing colon – stop parsing to avoid misinterpretation
                break;
            }

            index++; // Skip colon

            // Skip whitespace after colon
            while (index < span.Length && char.IsWhiteSpace(span[index]))
            {
                index++;
            }

            var valueBuilder = new StringBuilder();
            while (index < span.Length)
            {
                var current = span[index];

                if (current == ',' || current == ';')
                {
                    index++;
                    break;
                }

                if (char.IsWhiteSpace(current))
                {
                    var lookahead = index + 1;
                    while (lookahead < span.Length && char.IsWhiteSpace(span[lookahead]))
                    {
                        lookahead++;
                    }

                    var potentialNameStart = lookahead;
                    while (potentialNameStart < span.Length && (char.IsLetter(span[potentialNameStart]) || span[potentialNameStart] == '-' || span[potentialNameStart] == '_'))
                    {
                        potentialNameStart++;
                    }

                    if (potentialNameStart > lookahead && potentialNameStart < span.Length && span[potentialNameStart] == ':')
                    {
                        index = lookahead;
                        break;
                    }
                }

                valueBuilder.Append(current);
                index++;
            }

            var propertyValue = valueBuilder.ToString().Trim();
            if (string.IsNullOrWhiteSpace(propertyValue))
            {
                continue;
            }

            if (!result.ContainsKey(propertyName))
            {
                result[propertyName] = propertyValue;
            }
        }

        return result;
    }

    private static string NormalizeColor(string value)
    {
        var cleaned = value.Trim();

        if (string.IsNullOrWhiteSpace(cleaned))
        {
            return "#f9f9f9";
        }

        if (cleaned.StartsWith("#", StringComparison.Ordinal))
        {
            cleaned = "#" + Regex.Replace(cleaned[1..], @"[^0-9a-fA-F]", "");
        }

        if (Regex.IsMatch(cleaned, @"^#[0-9a-fA-F]{3}$"))
        {
            return cleaned.ToLowerInvariant();
        }

        if (Regex.IsMatch(cleaned, @"^#[0-9a-fA-F]{6}$"))
        {
            return cleaned.ToLowerInvariant();
        }

        if (Regex.IsMatch(cleaned, @"^#[0-9a-fA-F]{8}$"))
        {
            return cleaned.ToLowerInvariant();
        }

        // Support rgb/rgba(...) syntax directly
        if (Regex.IsMatch(cleaned, @"^rgba?\([0-9,\s.]+\)$", RegexOptions.IgnoreCase))
        {
            return cleaned.ToLowerInvariant();
        }

        // Basic keyword allowance
        if (Regex.IsMatch(cleaned, @"^[a-zA-Z]+$", RegexOptions.IgnoreCase))
        {
            return cleaned.ToLowerInvariant();
        }

        return "#f9f9f9";
    }

    private static string NormalizePropertyValue(string propertyName, string value)
    {
        var trimmed = Regex.Replace(value, @"\s{2,}", " ").Trim();

        if (string.Equals(propertyName, "stroke-width", StringComparison.OrdinalIgnoreCase))
        {
            return NormalizeNumericValue(trimmed, fallback: "1");
        }

        if (string.Equals(propertyName, "font-size", StringComparison.OrdinalIgnoreCase))
        {
            return NormalizeNumericValue(trimmed, fallback: "14px");
        }

        if (string.Equals(propertyName, "opacity", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(propertyName, "fill-opacity", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(propertyName, "stroke-opacity", StringComparison.OrdinalIgnoreCase))
        {
            return NormalizeNumericValue(trimmed, fallback: "1");
        }

        if (string.Equals(propertyName, "stroke", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(propertyName, "color", StringComparison.OrdinalIgnoreCase))
        {
            return NormalizeColor(trimmed);
        }

        return trimmed;
    }

    private static string NormalizeNumericValue(string value, string fallback)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return fallback;
        }

        var candidate = value.Trim().ToLowerInvariant();
        if (double.TryParse(candidate, out var numeric))
        {
            return numeric.ToString("0.##", CultureInfo.InvariantCulture);
        }

        if (double.TryParse(candidate.TrimEnd('%'), out numeric) && candidate.EndsWith("%", StringComparison.Ordinal))
        {
            return numeric.ToString("0.##", CultureInfo.InvariantCulture) + "%";
        }

        if (Regex.IsMatch(candidate, @"^[0-9.]+(px|em|rem)$"))
        {
            return candidate;
        }

        return fallback;
    }
}
