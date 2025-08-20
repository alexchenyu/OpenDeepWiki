namespace KoalaWiki.Dto;

public class ResponsesInput
{
    public List<MessageInput> Messages { get; set; } = new();

    /// <summary>
    /// 组织名
    /// </summary>
    /// <returns></returns>
    public string OrganizationName { get; set; } = string.Empty;

    /// <summary>
    /// 仓库名称
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// 应用ID
    /// </summary>
    public string? AppId { get; set; }

    /// <summary>
    /// 是否开启深度研究
    /// </summary>
    public bool DeepResearch { get; set; } = false;
}

/// <summary>
/// 统一消息输入格式 - 参考OpenAI标准
/// </summary>
public class MessageInput
{
    /// <summary>
    /// 消息ID
    /// </summary>
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>
    /// 消息角色：user, assistant, system
    /// </summary>
    public string Role { get; set; } = string.Empty;

    /// <summary>
    /// 消息内容数组
    /// </summary>
    public List<ContentItemInput> Content { get; set; } = new();

    /// <summary>
    /// 创建时间
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// 更新时间
    /// </summary>
    public DateTime? UpdatedAt { get; set; }
}

/// <summary>
/// 内容项输入基类
/// </summary>
public class ContentItemInput
{
    public string Type { get; set; } = ContentItemType.Text;
}

/// <summary>
/// 文本内容输入
/// </summary>
public class TextContentInput : ContentItemInput
{
    public TextContentInput() { Type = ContentItemType.Text; }
    public string Text { get; set; } = string.Empty;
}

/// <summary>
/// 工具调用内容输入
/// </summary>
public class ToolCallsContentInput : ContentItemInput
{
    public ToolCallsContentInput() { Type = ContentItemType.ToolCalls; }
    public List<ToolCallInput> ToolCalls { get; set; } = new();
}

/// <summary>
/// 工具调用输入
/// </summary>
public class ToolCallInput
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = "function";
    public ToolCallFunctionInput Function { get; set; } = new();
}

/// <summary>
/// 工具调用函数输入
/// </summary>
public class ToolCallFunctionInput
{
    public string Name { get; set; } = string.Empty;
    public string Arguments { get; set; } = string.Empty;
}

/// <summary>
/// 工具结果内容输入
/// </summary>
public class ToolResultContentInput : ContentItemInput
{
    public ToolResultContentInput() { Type = ContentItemType.ToolResult; }
    public string ToolCallId { get; set; } = string.Empty;
    public string Result { get; set; } = string.Empty;
}

/// <summary>
/// 推理内容输入
/// </summary>
public class ReasoningContentInput : ContentItemInput
{
    public ReasoningContentInput() { Type = ContentItemType.Reasoning; }
    public string Reasoning { get; set; } = string.Empty;
}

/// <summary>
/// 图片内容输入
/// </summary>
public class ImageContentInput : ContentItemInput
{
    public ImageContentInput() { Type = ContentItemType.Image; }
    public ImageUrlInput ImageUrl { get; set; } = new();
}

/// <summary>
/// 图片URL输入
/// </summary>
public class ImageUrlInput
{
    public string Url { get; set; } = string.Empty;
    public string? Detail { get; set; }
}

/// <summary>
/// 内容项类型常量
/// </summary>
public static class ContentItemType
{
    public const string Text = "text";
    public const string ToolCalls = "tool_calls";
    public const string ToolResult = "tool_result";
    public const string Reasoning = "reasoning";
    public const string Image = "image";
    public const string Code = "code";
    public const string Table = "table";
    public const string Link = "link";
    public const string File = "file";
    public const string Audio = "audio";
    public const string Video = "video";
}

/// <summary>
/// SSE流事件输出
/// </summary>
public class StreamEventOutput
{
    public string Type { get; set; } = string.Empty;
    public ContentDeltaOutput? Delta { get; set; }
    public List<ToolCallInput>? ToolCalls { get; set; }
    public StreamErrorOutput? Error { get; set; }
}

/// <summary>
/// 内容增量输出
/// </summary>
public class ContentDeltaOutput
{
    public string ContentType { get; set; } = string.Empty;
    public string? Text { get; set; }
    public string? Reasoning { get; set; }
    public string? ToolCallId { get; set; }
    public string? FunctionName { get; set; }
    public string? FunctionArguments { get; set; }
}

/// <summary>
/// 流错误输出
/// </summary>
public class StreamErrorOutput
{
    public string Code { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public object? Details { get; set; }
}

/// <summary>
/// 流事件类型常量
/// </summary>
public static class StreamEventType
{
    public const string ContentDelta = "content_delta";
    public const string ToolCalls = "tool_calls";
    public const string Done = "done";
    public const string Error = "error";
}