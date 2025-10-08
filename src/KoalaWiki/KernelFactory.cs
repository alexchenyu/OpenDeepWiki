﻿using System.Diagnostics;
using System.Net;
using KoalaWiki.plugins;
using KoalaWiki.Tools;

#pragma warning disable SKEXP0070

#pragma warning disable SKEXP0010

namespace KoalaWiki;

/// <summary>
/// 提供一个静态方法来创建和配置一个内核实例，用于各种基于ai的操作。
/// KernelFactory类负责设置必要的服务、插件和配置
/// 内核需要的，包括聊天完成服务，日志记录和文件处理功能。
/// 它支持多个AI模型提供者，并允许可选的代码分析功能。
/// </summary>
public static class KernelFactory
{
    public static Kernel GetKernel(string chatEndpoint,
        string apiKey,
        string gitPath,
        string model, bool isCodeAnalysis = true,
        List<string>? files = null, Action<IKernelBuilder>? kernelBuilderAction = null)
    {
        using var activity = Activity.Current?.Source.StartActivity();
        activity?.SetTag("model", model);
        activity?.SetTag("provider", OpenAIOptions.ModelProvider);
        activity?.SetTag("code_analysis_enabled", isCodeAnalysis);
        activity?.SetTag("git_path", gitPath);

        var kernelBuilder = Kernel.CreateBuilder();

        kernelBuilder.Services.AddSerilog(Log.Logger);

        kernelBuilder.Services.AddSingleton<IPromptRenderFilter, LanguagePromptFilter>();

        if (OpenAIOptions.ModelProvider.Equals("OpenAI", StringComparison.OrdinalIgnoreCase))
        {
            kernelBuilder.AddOpenAIChatCompletion(model, new Uri(chatEndpoint), apiKey,
                httpClient: new HttpClient(new KoalaHttpClientHandler()
                {
                    AutomaticDecompression = DecompressionMethods.GZip |
                                             DecompressionMethods.Brotli |
                                             DecompressionMethods.Deflate |
                                             DecompressionMethods.None
                })
                {
                    Timeout = TimeSpan.FromMinutes(15), // 15分钟 = 900秒，适应超大仓库的依赖分析
                });
        }
        else if (OpenAIOptions.ModelProvider.Equals("AzureOpenAI", StringComparison.OrdinalIgnoreCase))
        {
            kernelBuilder.AddAzureOpenAIChatCompletion(model, chatEndpoint, apiKey, httpClient: new HttpClient(
                new KoalaHttpClientHandler()
                {
                    AutomaticDecompression = DecompressionMethods.GZip |
                                             DecompressionMethods.Brotli |
                                             DecompressionMethods.Deflate |
                                             DecompressionMethods.None
                })
            {
                Timeout = TimeSpan.FromSeconds(900), // 15分钟，适应超大仓库的依赖分析
            });
        }
        else
        {
            activity?.SetStatus(ActivityStatusCode.Error, "不支持的模型提供者");
            throw new Exception("暂不支持：" + OpenAIOptions.ModelProvider + "，请使用OpenAI、AzureOpenAI或Anthropic");
        }

        if (isCodeAnalysis)
        {
            kernelBuilder.Plugins.AddFromPromptDirectory(Path.Combine(AppContext.BaseDirectory, "plugins",
                "CodeAnalysis"));
            activity?.SetTag("plugins.code_analysis", "loaded");
        }

        // 添加文件函数
        var fileFunction = new FileTool(gitPath, files);
        kernelBuilder.Plugins.AddFromObject(fileFunction, "file");

        kernelBuilder.Plugins.AddFromType<AgentTool>();
        activity?.SetTag("plugins.agent_tool", "loaded");

        activity?.SetTag("plugins.file_function", "loaded");

        if (DocumentOptions.EnableCodeDependencyAnalysis)
        {
            var codeAnalyzeFunction = new CodeAnalyzeTool(gitPath);
            kernelBuilder.Plugins.AddFromObject(codeAnalyzeFunction, "git");
            activity?.SetTag("plugins.code_analyze_function", "loaded");
        }

        kernelBuilderAction?.Invoke(kernelBuilder);

        var kernel = kernelBuilder.Build();

        activity?.SetStatus(ActivityStatusCode.Ok);
        activity?.SetTag("kernel.created", true);

        return kernel;
    }
}