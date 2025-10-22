namespace KoalaWiki.KoalaWarehouse.Mermaid;

public sealed record MermaidValidationResult(bool IsValid, string? ErrorMessage, bool WasAttempted)
{
    public static MermaidValidationResult Valid() => new(true, null, true);

    public static MermaidValidationResult Invalid(string message) => new(false, message, true);

    public static MermaidValidationResult Skipped(string? reason = null) => new(true, reason, false);
}
