namespace KoalaWiki.Options;

public class DocumentOptions
{
    public const string Name = "Document";

    /// <summary>
    /// 是否启用增量更新
    /// </summary>
    /// <returns></returns>
    public static bool EnableIncrementalUpdate { get; set; } = true;

    /// <summary>
    /// 排除的文件
    /// </summary>
    /// <returns></returns>
    public static string[] ExcludedFiles { get; set; } = [];

    /// <summary>
    /// 排除的文件夹
    /// </summary>
    /// <returns></returns>
    public static string[] ExcludedFolders { get; set; } = [];

    /// <summary>
    /// 是否启用智能过滤
    /// </summary>
    /// <returns></returns>
    public static bool EnableSmartFilter { get; set; } = true;

    /// <summary>
    /// 目录结构格式 (compact, json, pathlist, unix)
    /// </summary>
    /// <returns></returns>
    public static string CatalogueFormat { get; set; } = "compact";

    /// <summary>
    /// 是否启用代码依赖分析
    /// </summary>
    /// <returns></returns>
    public static bool EnableCodeDependencyAnalysis { get; set; } = false;

    /// <summary>
    /// 是否启用仓库功能提示任务
    /// </summary>
    public static bool EnableWarehouseFunctionPromptTask { get; set; } = true;

    /// <summary>
    /// 是否启用仓库描述任务
    /// </summary>
    public static bool EnableWarehouseDescriptionTask { get; set; } = true;

    /// <summary>
    /// 是否启用文件提交
    /// </summary>
    /// <returns></returns>
    public static bool EnableFileCommit { get; set; } = true;

    /// <summary>
    /// 精炼并且提高质量
    /// </summary>
    /// <returns></returns>
    public static bool RefineAndEnhanceQuality { get; set; } = false;

    /// <summary>
    /// 是否启用仓库提交
    /// </summary>
    /// <returns></returns>
    public static bool EnableWarehouseCommit { get; set; } = true;

    /// <summary>
    /// 是否启用代码压缩
    /// 当启用时，FileFunction读取代码文件时会应用压缩算法
    /// 压缩会保留注释、方法名等关键信息，但会移除多余的空白和格式
    /// </summary>
    /// <returns></returns>
    public static bool EnableCodeCompression { get; set; } = false;

    /// <summary>
    /// 限制单个AI读取的最大token上下文比例是当前模型的多少，范围0.1-1.0
    /// </summary>
    /// <returns></returns>
    public static int ReadMaxTokens { get; set; } = 80000;

    /// <summary>
    /// Catalogue（目录结构）的最大 token 数量
    /// 用于控制发送给 AI 的仓库目录结构大小，避免超过模型上下文窗口
    /// </summary>
    /// <returns></returns>
    public static int CatalogueMaxTokens { get; set; } = 15000;

    /// <summary>
    /// 字符转 token 的估算比例
    /// 用于粗略估算文本的 token 数量（实际值取决于语言和内容类型）
    /// 中文通常为 1.5-2.0，英文通常为 3-4，代码通常为 2.5-3.5
    /// </summary>
    /// <returns></returns>
    public static double CharsPerToken { get; set; } = 2.0;

    /// <summary>
    /// Git代理设置
    /// 支持HTTP/HTTPS代理，格式：http://proxy-server:port 或 https://proxy-server:port
    /// 可通过环境变量GIT_PROXY进行配置
    /// </summary>
    /// <returns></returns>
    public static string? Proxy { get; set; }

    /// <summary>
    /// 是否启用Agent工具插件
    /// </summary>
    /// <returns></returns>
    public static bool EnableAgentTool { get; set; } = false;
    
    /// <summary>
    /// 是否启用Wiki功能
    /// </summary>
    public static bool EnableWiki { get; set; } = true;

    public static void InitConfig(IConfiguration configuration)
    {
        configuration.GetSection(Name).Get<DocumentOptions>();

        var enableWarehouseCommit = configuration.GetValue<bool?>($"ENABLE_WAREHOUSE_COMMIT") ?? true;

        EnableWarehouseCommit = enableWarehouseCommit;

        var enableFileCommit = configuration.GetValue<bool?>($"ENABLE_FILE_COMMIT") ?? true;

        EnableFileCommit = enableFileCommit;

        var enableIncrementalUpdate = configuration.GetValue<string>($"ENABLE_INCREMENTAL_UPDATE");
        if (!string.IsNullOrEmpty(enableIncrementalUpdate))
        {
            if (bool.TryParse(enableIncrementalUpdate, out var enable))
            {
                EnableIncrementalUpdate = enable;
            }
        }

        var refineAndEnhanceQuality =
            configuration.GetValue<string>($"REFINE_AND_ENHANCE_QUALITY");

        if (!string.IsNullOrEmpty(refineAndEnhanceQuality))
        {
            RefineAndEnhanceQuality = bool.TryParse(refineAndEnhanceQuality, out var enable) && enable;
        }

        var enableCodeDependencyAnalysis = configuration.GetValue<string>($"ENABLE_CODED_DEPENDENCY_ANALYSIS");

        if (!string.IsNullOrEmpty(enableCodeDependencyAnalysis))
        {
            if (bool.TryParse(enableCodeDependencyAnalysis, out var enable))
            {
                EnableCodeDependencyAnalysis = enable;
            }
        }

        var enableWarehouseFunctionPromptTask =
            configuration.GetValue<string>($"ENABLE_WAREHOUSE_FUNCTION_PROMPT_TASK");

        if (!string.IsNullOrEmpty(enableWarehouseFunctionPromptTask))
        {
            if (bool.TryParse(enableWarehouseFunctionPromptTask, out var enable))
            {
                EnableWarehouseFunctionPromptTask = enable;
            }
        }

        var enableWarehouseDescriptionTask = configuration.GetValue<string>($"ENABLE_WAREHOUSE_DESCRIPTION_TASK");
        if (!string.IsNullOrEmpty(enableWarehouseDescriptionTask))
        {
            if (bool.TryParse(enableWarehouseDescriptionTask, out var enable))
            {
                EnableWarehouseDescriptionTask = enable;
            }
        }

        var catalogueFormat = configuration.GetValue<string>($"CATALOGUE_FORMAT");
        if (!string.IsNullOrEmpty(catalogueFormat))
        {
            CatalogueFormat = catalogueFormat.ToLower();
        }

        var enableCodeCompression = configuration.GetValue<string>($"ENABLE_CODE_COMPRESSION");
        if (!string.IsNullOrEmpty(enableCodeCompression))
        {
            if (bool.TryParse(enableCodeCompression, out var enable))
            {
                EnableCodeCompression = enable;
            }
        }

        var maxFileReadCount = configuration.GetValue<string>($"READ_MAX_TOKENS");
        if (!string.IsNullOrEmpty(maxFileReadCount))
        {
            if (int.TryParse(maxFileReadCount, out var count) && count >= 0)
            {
                ReadMaxTokens = count;
            }
        }

        var catalogueMaxTokens = configuration.GetValue<string>($"CATALOGUE_MAX_TOKENS");
        if (!string.IsNullOrEmpty(catalogueMaxTokens))
        {
            if (int.TryParse(catalogueMaxTokens, out var count) && count > 0)
            {
                CatalogueMaxTokens = count;
            }
        }

        var charsPerToken = configuration.GetValue<string>($"CHARS_PER_TOKEN");
        if (!string.IsNullOrEmpty(charsPerToken))
        {
            if (double.TryParse(charsPerToken, out var ratio) && ratio > 0)
            {
                CharsPerToken = ratio;
            }
        }

        var proxy = configuration.GetValue<string>($"GIT_PROXY");
        if (!string.IsNullOrEmpty(proxy))
        {
            Proxy = proxy;
        }

        var enableAgentTool = configuration.GetValue<string>($"ENABLE_AGENT_TOOL");
        if (!string.IsNullOrEmpty(enableAgentTool))
        {
            if (bool.TryParse(enableAgentTool, out var enable))
            {
                EnableAgentTool = enable;
            }
        }
        
        var enableWiki = configuration.GetValue<string>($"ENABLE_WIKI");
        if (!string.IsNullOrEmpty(enableWiki))
        {
            if (bool.TryParse(enableWiki, out var enable))
            {
                EnableWiki = enable;
            }
        }
    }
}