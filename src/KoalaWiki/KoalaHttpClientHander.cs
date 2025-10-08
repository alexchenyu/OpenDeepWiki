using System.Diagnostics;
using System.Text.Json;
using Newtonsoft.Json;
using Serilog;

namespace KoalaWiki;

public sealed class KoalaHttpClientHandler : HttpClientHandler
{
    public string Version => typeof(HttpClientHandler).Assembly.GetName().Version?.ToString() ?? "unknown";

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        Log.Logger.Information("HTTP {Method} {Uri}", request.Method, request.RequestUri);

        request.Headers.UserAgent.ParseAdd("KoalaWiki/" + Version);

        var json = JsonConvert.DeserializeObject<dynamic>(await request.Content.ReadAsStringAsync(cancellationToken));

        var model = $"{json.model}";

        // 兼容旧模型 ( max_completion_tokens => max_tokens )
        if (json != null && json.max_completion_tokens != null && !model.StartsWith("o") &&
            !model.StartsWith("gpt"))
        {
            json.max_tokens = json.max_completion_tokens;
            json.Remove("max_completion_tokens");
        }

        // GPT o系列不能传递温度
        if (model.StartsWith("o") || model.StartsWith("gpt-5"))
        {
            json.Remove("temperature");
        }
        else
        {
            json.temperature = 0.3;
        }

        // 关闭推理模式: qwen3系列
        if (model.StartsWith("qwen3", StringComparison.CurrentCultureIgnoreCase)
            || model.IndexOf("/qwen3", StringComparison.CurrentCultureIgnoreCase) >= 0)
        {
            if (request.RequestUri.ToString()
                .StartsWith("https://dashscope.aliyuncs.com", StringComparison.CurrentCultureIgnoreCase))
            {
                json.enable_thinking = false;
            }
            else
            {
                // 开源部署最佳实践
                json.temperature ??= 0.7;
                json.top_p ??= 0.8;
                json.chat_template_kwargs ??= new Newtonsoft.Json.Linq.JObject();
                json.chat_template_kwargs.enable_thinking = false;
            }
        }

        // 关闭推理模式: GLM-4.6-FP8 推理模型
        if (model.Contains("GLM-4.6-FP8", StringComparison.CurrentCultureIgnoreCase)
            || model.Contains("glm-4", StringComparison.CurrentCultureIgnoreCase))
        {
            // GLM 推理模型通过 chat_template_kwargs 关闭推理
            // litellm 会自动将非标准参数传递给 vLLM
            json.chat_template_kwargs = new Newtonsoft.Json.Linq.JObject();
            json.chat_template_kwargs.enable_thinking = false;
        }

        // 重写请求体
        request.Content = new StringContent(JsonConvert.SerializeObject(json),
            System.Text.Encoding.UTF8, "application/json");

        // 1. 启动计时
        HttpResponseMessage response = null!;
        var stopwatch = Stopwatch.StartNew();
        for (int i = 0; i < 3; i++)
        {
            // 2. 发送请求
            try
            {
                response = await base.SendAsync(request, cancellationToken)
                    .ConfigureAwait(false);
                if (response.IsSuccessStatusCode)
                {
                    // 成功返回响应
                    break;
                }
                else
                {
                    // 如果是400系列错误，不重试
                    if ((int)response.StatusCode >= 400 && (int)response.StatusCode < 500)
                    {
                        break;
                    }

                    var sendToken = new CancellationTokenSource();
                    sendToken.CancelAfter(30000); // 30秒超时
                    var errorContent = await response.Content.ReadAsStringAsync(sendToken.Token);
                    Log.Logger.Warning("HTTP request failed, attempt {Attempt}: {StatusCode} {ErrorMessage}",
                        i + 1, (int)response.StatusCode, errorContent);
                    if (i == 2)
                    {
                        // 最后一次失败，抛出异常
                        throw new HttpRequestException(
                            $"Request failed with status code {(int)response.StatusCode}: {errorContent}");
                    }

                    await Task.Delay(3000 * i, cancellationToken); // 等待一秒后重试
                    continue;
                }
            }
            catch (Exception e)
            {
                Log.Logger.Warning("HTTP request failed, attempt {Attempt}: {ErrorMessage}", i + 1, e.Message);
                if (i == 2)
                {
                    throw; // 最后一次失败，抛出异常
                }

                await Task.Delay(1000, cancellationToken); // 等待一秒后重试
                continue;
            }
        }

        // 3. 停止计时
        stopwatch.Stop();

        // 如果响应错误那么输出错误信息
        if (!response.IsSuccessStatusCode)
        {
            var errorContent = await response.Content.ReadAsStringAsync(cancellationToken);
            Log.Logger.Error(
                "HTTP {Method} {Uri} => {StatusCode} in {ElapsedMilliseconds}ms, Error: {Error}",
                request.Method,
                request.RequestUri,
                (int)response.StatusCode,
                stopwatch.ElapsedMilliseconds,
                errorContent
            );
            Log.Logger.Information("Request JSON: {RequestJson}",
                await request.Content?.ReadAsStringAsync(cancellationToken) ?? "");

            throw new HttpRequestException(
                $"Request failed with status code {(int)response.StatusCode}: {errorContent}");
        }
        else
        {
            // 4. 记录简洁日志
            Log.Logger.Information(
                "HTTP {Method} {Uri} => {StatusCode} in {ElapsedMilliseconds}ms",
                request.Method,
                request.RequestUri,
                (int)response.StatusCode,
                stopwatch.ElapsedMilliseconds
            );
            return response;
        }
    }
}