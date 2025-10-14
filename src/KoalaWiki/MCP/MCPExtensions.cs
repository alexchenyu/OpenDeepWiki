using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using KoalaWiki.Core.DataAccess;
using KoalaWiki.Functions;
using KoalaWiki.MCP.Tools;
using KoalaWiki.Tools;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.WebEncoders.Testing;
using ModelContextProtocol.Protocol;
using Serilog;

namespace KoalaWiki.MCP;

public static class McpExtensions
{
    public static IServiceCollection AddKoalaMcp(this IServiceCollection service)
    {
        service.AddScoped<WarehouseTool>();

        service.AddMcpServer()
            .WithListToolsHandler((async (context, token) =>
            {
                var name = context.Server.ServerOptions.Capabilities!.Experimental["name"].ToString().ToLower();
                var owner = context.Server.ServerOptions.Capabilities.Experimental["owner"].ToString().ToLower();

                var descript =
                    $"Generate detailed technical documentation for the {owner}/{name} GitHub repository based on user inquiries. Analyzes repository structure, code components, APIs, dependencies, and implementation patterns to create comprehensive developer documentation with troubleshooting guides, architecture explanations, customization options, and implementation insights.";

                var input = """
                    {
                        "type": "object",
                        "properties": {
                          "question": {
                            "type": "string",
                            "description": "The relevant keywords for your retrieval of {owner}/{name} or a question content"
                          }
                        },
                        "required": ["question"]
                    }
                    """.Replace("{owner}", owner)
                    .Replace("{name}", name);


                // 删除特殊字符串
                var mcpName = $"{owner}_{name}";
                mcpName = Regex.Replace(mcpName, @"[^a-zA-Z0-9]", "");
                mcpName = mcpName.Length > 50 ? mcpName.Substring(0, 50) : mcpName;
                mcpName = mcpName.ToLower();

                var tools = new List<Tool>
                {
                    new()
                    {
                        Name = mcpName + "_GenerateDocument",
                        Description =
                            descript,
                        InputSchema =
                            JsonSerializer.Deserialize<JsonElement>(input),
                    }
                };

                if (OpenAIOptions.EnableMem0)
                {
                    tools.Add(new Tool()
                    {
                        Name = $"{mcpName}-Search",
                        Description =
                            $"Query {owner}/{name} repository for relevant code snippets and documentation based on user inquiries. For large repositories, consider using limit=3 and minRelevance=0.7 to reduce context size.",
                        InputSchema = JsonSerializer.Deserialize<JsonElement>("""
                                                                              {
                                                                                  "type": "object",
                                                                                  "properties": {
                                                                                    "query": {
                                                                                      "type": "string",
                                                                                      "description": "Detailed description of the code or documentation you need. Specify whether you're looking for a function, class, method, or specific documentation. Be as specific as possible to improve search accuracy."
                                                                                    },
                                                                                    "limit": {
                                                                                      "type": "integer",
                                                                                      "description": "Number of search results to return. Default is 5. For large repositories like OpenBMC, use 3 to avoid context overflow.",
                                                                                      "default": 5
                                                                                    },
                                                                                    "minRelevance": {
                                                                                      "type": "number",
                                                                                      "description": "Minimum relevance threshold for vector search results, ranging from 0 to 1. Default is 0.3. For large repositories, use 0.7 for more precise matches and smaller context size.",
                                                                                      "default": 0.3
                                                                                    }
                                                                                  },
                                                                                  "required": ["query"]
                                                                              }
                                                                              """)
                    });
                }

                tools.Add(new Tool()
                {
                    Name = $"{mcpName}-" + nameof(FileTool.ReadFileFromLineAsync),
                    Description =
                        "Returns the file content from the specified starting line to the ending line (inclusive). If the total output length exceeds 10,000 characters, only the first 10,000 characters are returned, the content order is consistent with the original file, and the original line breaks are retained.",
                    InputSchema = JsonSerializer.Deserialize<JsonElement>(
                        """
                        {
                          "type": "object",
                          "properties": {
                            "filePath": {
                              "type": "string",
                              "description": "The absolute or relative path of the target file. The file must exist and be readable. If the path is invalid or the file does not exist, an exception will be thrown."
                            },
                            "startLine": {
                              "type": "integer",
                              "description": "The starting line number for reading (starting from 0), must be less than or equal to the ending line number, and must be within the actual number of lines in the file.",
                              "default": 0
                            },
                            "endLine": {
                              "type": "integer",
                              "description": "The ending line number for reading (including this line), must be greater than or equal to the starting line number, and must not exceed the total number of lines in the file.",
                              "default": 200
                            }
                          },
                          "required": [
                            "filePath"
                          ]
                        }
                        """)
                });

                tools.Add(new Tool()
                {
                    Name = $"{mcpName}-" + nameof(FileTool.GetTree),
                    Description = "Returns the file tree of the repository, with options to control output size to avoid context window overflow.",
                    InputSchema = JsonSerializer.Deserialize<JsonElement>("""
                                                                          {
                                                                              "type": "object",
                                                                              "properties": {
                                                                                  "maxDepth": {
                                                                                      "type": "integer",
                                                                                      "description": "Maximum directory depth to traverse (default: unlimited)",
                                                                                      "default": null
                                                                                  },
                                                                                  "maxItems": {
                                                                                      "type": "integer",
                                                                                      "description": "Maximum number of items to return (default: 1000 to avoid context overflow)",
                                                                                      "default": 1000
                                                                                  },
                                                                                  "outputFormat": {
                                                                                      "type": "string",
                                                                                      "enum": ["full", "summary", "compact", "pathlist"],
                                                                                      "description": "Output format: full tree, summary stats, compact format, or path list",
                                                                                      "default": "compact"
                                                                                  },
                                                                                  "rootPath": {
                                                                                      "type": "string",
                                                                                      "description": "Root path to start traversal from (default: repository root)",
                                                                                      "default": ""
                                                                                  },
                                                                                  "includeFiles": {
                                                                                      "type": "boolean",
                                                                                      "description": "Whether to include files in output (default: true)",
                                                                                      "default": true
                                                                                  },
                                                                                  "includeDirs": {
                                                                                      "type": "boolean",
                                                                                      "description": "Whether to include directories in output (default: true)",
                                                                                      "default": true
                                                                                  }
                                                                              },
                                                                              "required": []
                                                                          }
                                                                          """)
                });

                return await Task.FromResult(new ListToolsResult()
                {
                    Tools = tools
                });
            }))
            .WithListResourcesHandler(
                ((context, token) => new ValueTask<ListResourcesResult>(new ListResourcesResult())))
            .WithCallToolHandler((async (context, token) =>
            {
                var owner = context.Server.ServerOptions.Capabilities!.Experimental["owner"].ToString().ToLower();
                var name = context.Server.ServerOptions.Capabilities.Experimental["name"].ToString().ToLower();


                // 删除特殊字符串
                var mcpName = $"{owner}_{name}";
                mcpName = Regex.Replace(mcpName, @"[^a-zA-Z0-9]", "");
                mcpName = mcpName.Length > 50 ? mcpName.Substring(0, 50) : mcpName;
                mcpName = mcpName.ToLower();


                var functionName = context.Params.Name;
                if (functionName.Equals(mcpName + "-" + nameof(FileTool.ReadFileFromLineAsync),
                        StringComparison.CurrentCulture))
                {
                    var sw = Stopwatch.StartNew();

                    string response;
                    
                    // 检查是否有参数
                    if (context.Params.Arguments != null && context.Params.Arguments.Count > 0)
                    {
                        try
                        {
                            var argumentsJson = JsonSerializer.Serialize(context.Params.Arguments, JsonSerializerOptions.Web);
                            var readFileInput = JsonSerializer.Deserialize<ReadFileItemInput>(argumentsJson, JsonSerializerOptions.Web);
                            
                            var dbContext = context.Services!.GetService<IKoalaWikiContext>();
                            var warehouse = await dbContext.Warehouses
                                .Where(x => x.OrganizationName.ToLower() == owner && x.Name.ToLower() == name)
                                .FirstOrDefaultAsync(token);

                            var document = await dbContext.Documents
                                .Where(x => x.WarehouseId == warehouse.Id)
                                .FirstOrDefaultAsync(token);

                            var fileFunction = new FileTool(document.GitPath, null);
                            response = await fileFunction.ReadFileFromLineAsync(readFileInput);
                        }
                        catch (Exception ex)
                        {
                            response = $"Error: {ex.Message}";
                        }
                    }
                    else
                    {
                        response = "Error: Missing required parameters (filePath, startLine, endLine)";
                    }

                    sw.Stop();

                    Log.Logger.Information("functionName {functionName} Execution Time: {ExecutionTime}ms",
                        context.Params.Name, sw.ElapsedMilliseconds);

                    return new CallToolResult()
                    {
                        Content =
                        [
                            new TextContentBlock
                            {
                                Text = response,
                                Type = "text"
                            }
                        ]
                    };
                } // 在这里需要根据不同方法名称调用不同实现

                if (functionName.Equals(mcpName + "-" + nameof(FileTool.GetTree),
                        StringComparison.CurrentCulture))
                {
                    var dbContext = context.Services!.GetService<IKoalaWikiContext>();

                    var warehouse = await dbContext.Warehouses
                        .Where(x => x.OrganizationName.ToLower() == owner && x.Name.ToLower() == name)
                        .FirstOrDefaultAsync(token);

                    var document = await dbContext.Documents
                        .Where(x => x.WarehouseId == warehouse.Id)
                        .FirstOrDefaultAsync(token);

                    var fileFunction = new FileTool(document.GitPath, null);

                    var sw = Stopwatch.StartNew();

                    string response;
                    
                    // 检查是否有参数
                    if (context.Params.Arguments != null && context.Params.Arguments.Count > 0)
                    {
                        try
                        {
                            var argumentsJson = JsonSerializer.Serialize(context.Params.Arguments, JsonSerializerOptions.Web);
                            var getTreeInput = JsonSerializer.Deserialize<GetTreeInput>(argumentsJson, JsonSerializerOptions.Web);
                            response = fileFunction.GetTree(getTreeInput);
                        }
                        catch
                        {
                            // 如果参数解析失败，使用默认参数
                            response = fileFunction.GetTree();
                        }
                    }
                    else
                    {
                        // 没有参数时，使用默认的限制参数以避免context overflow
                        response = fileFunction.GetTree(new GetTreeInput { MaxItems = 1000, OutputFormat = "compact" });
                    }

                    sw.Stop();

                    Log.Logger.Information("functionName {functionName} Execution Time: {ExecutionTime}ms",
                        context.Params.Name, sw.ElapsedMilliseconds);

                    return new CallToolResult()
                    {
                        Content =
                        [
                            new TextContentBlock
                            {
                                Text = response,
                                Type = "text"
                            }
                        ]
                    };
                }
                else if (functionName.Equals(mcpName + "-Search", StringComparison.CurrentCulture) &&
                         OpenAIOptions.EnableMem0)
                {
                    var dbContext = context.Services!.GetService<IKoalaWikiContext>();

                    var warehouse = await dbContext.Warehouses
                        .Where(x => x.OrganizationName.ToLower() == owner && x.Name.ToLower() == name)
                        .FirstOrDefaultAsync(token);

                    if (warehouse == null)
                    {
                        return new CallToolResult()
                        {
                            Content =
                            [
                                new TextContentBlock
                                {
                                    Text = $"Error: Repository {owner}/{name} not found. Please create the repository first.",
                                    Type = "text"
                                }
                            ]
                        };
                    }

                    var question = context.Params?.Arguments?["query"].ToString();
                    int limit = 5;
                    double minRelevance = 0.3;
                    if (context.Params?.Arguments != null)
                    {
                        if (context.Params.Arguments.TryGetValue("limit", out var argument))
                        {
                            if (argument is JsonElement limitElement)
                            {
                                limit = limitElement.GetInt32();
                            }
                            else
                            {
                                limit = Convert.ToInt32(argument);
                            }
                        }

                        if (context.Params.Arguments.TryGetValue("minRelevance", out var paramsArgument))
                        {
                            if (paramsArgument is JsonElement relevanceElement)
                            {
                                minRelevance = relevanceElement.GetDouble();
                            }
                            else
                            {
                                minRelevance = Convert.ToDouble(paramsArgument);
                            }
                        }
                    }

                    var sw = Stopwatch.StartNew();

                    var rag = new RagTool(warehouse.Id);

                    var response = await rag.SearchAsync(question, limit, minRelevance);

                    sw.Stop();

                    Log.Logger.Information("functionName {functionName} Execution Time: {ExecutionTime}ms",
                        context.Params.Name, sw.ElapsedMilliseconds);

                    return new CallToolResult()
                    {
                        Content =
                        [
                            new TextContentBlock
                            {
                                Text = response,
                                Type = "text"
                            }
                        ]
                    };
                }
                else
                {
                    var warehouse = context.Services!.GetService<WarehouseTool>();

                    var question = context.Params?.Arguments?["question"].ToString();
                    var sw = Stopwatch.StartNew();

                    var response = await warehouse.GenerateDocumentAsync(context.Server, question);

                    sw.Stop();

                    Log.Logger.Information("functionName {functionName} Execution Time: {ExecutionTime}ms",
                        context.Params.Name, sw.ElapsedMilliseconds);

                    return new CallToolResult()
                    {
                        Content =
                        [
                            new TextContentBlock
                            {
                                Text = response,
                                Type = "text"
                            }
                        ]
                    };
                }
            }))
            .WithHttpTransport(options =>
            {
                options.ConfigureSessionOptions += async (context, serverOptions, token) =>
                {
                    var owner = context.Request.Query["owner"].ToString();
                    var name = context.Request.Query["name"].ToString();

                    serverOptions.InitializationTimeout = TimeSpan.FromSeconds(600);
                    serverOptions.Capabilities!.Experimental = new Dictionary<string, object>();
                    serverOptions.Capabilities.Experimental.Add("owner", owner);
                    serverOptions.Capabilities.Experimental.Add("name", name);
                    await Task.CompletedTask;
                };

                options.Stateless = true;
            });

        return service;
    }
}