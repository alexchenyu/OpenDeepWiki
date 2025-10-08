using System.Text.Json;
using KoalaWiki.Domains;
using KoalaWiki.Domains.Warehouse;
using Microsoft.EntityFrameworkCore;

namespace KoalaWiki.KoalaWarehouse;

/// <summary>
/// 思维导图服务生成
/// </summary>
/// <param name="service"></param>
public sealed class MiniMapBackgroundService(IServiceProvider service) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(5000, stoppingToken); // 等待服务启动完成

        // 等待数据库连接就绪
        var dbReady = false;
        var retryCount = 0;
        const int maxRetries = 10;

        while (!dbReady && retryCount < maxRetries && !stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var testScope = service.CreateScope();
                var testContext = testScope.ServiceProvider.GetRequiredService<IKoalaWikiContext>();
                await testContext.Warehouses.AnyAsync(stoppingToken);
                dbReady = true;
                Log.Logger.Information("MiniMapBackgroundService：数据库连接就绪");
            }
            catch (Exception ex)
            {
                retryCount++;
                Log.Logger.Warning(ex, "MiniMapBackgroundService：等待数据库连接就绪 (尝试 {RetryCount}/{MaxRetries})", retryCount, maxRetries);
                await Task.Delay(3000, stoppingToken); // 等待3秒后重试
            }
        }

        if (!dbReady)
        {
            Log.Logger.Error("MiniMapBackgroundService：数据库连接失败，服务退出");
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // 第一步：快速查询需要处理的仓库，然后立即释放 DbContext
                Warehouse item;
                string documentCatalogue;
                string documentGitPath;

                using (var scope = service.CreateScope())
                {
                    var context = scope.ServiceProvider.GetRequiredService<IKoalaWikiContext>();

                    var existingMiniMapIds = await context.MiniMaps
                        .Select(m => m.WarehouseId)
                        .ToListAsync(stoppingToken);

                    // 查询需要生成知识图谱的仓库
                    var query = context.Warehouses
                        .Where(w => w.Status == WarehouseStatus.Completed && !existingMiniMapIds.Contains(w.Id))
                        .OrderBy(w => w.CreatedAt)
                        .AsNoTracking();

                    item = await query.FirstOrDefaultAsync(stoppingToken);
                    if (item == null)
                    {
                        await Task.Delay(10000, stoppingToken); // 等待10秒后重试
                        continue;
                    }

                    Log.Logger.Information("开始生成知识图谱，共有 {Count} 个仓库需要处理",
                        await query.CountAsync(cancellationToken: stoppingToken));

                    Log.Logger.Information("开始处理仓库 {WarehouseName}", item.Name);

                    var document = await context.Documents
                        .Where(d => d.WarehouseId == item.Id)
                        .FirstOrDefaultAsync(stoppingToken);

                    // 为 MindMap 生成使用深度限制（3层），避免超大项目 token 超限
                    documentCatalogue = document.GetCatalogueSmartFilterOptimized(maxDepth: 3);
                    documentGitPath = document.GitPath;
                } // scope 在这里释放，数据库连接关闭

                try
                {
                    // 第二步：执行耗时的 AI 操作（此时没有持有 DbContext）
                    var miniMap = await MiniMapService.GenerateMiniMap(
                        documentCatalogue,
                        item,
                        documentGitPath);

                    // 第三步：保存结果（重新创建 scope）
                    if (miniMap != null)
                    {
                        using var saveScope = service.CreateScope();
                        var saveContext = saveScope.ServiceProvider.GetRequiredService<IKoalaWikiContext>();

                        saveContext.MiniMaps.Add(new MiniMap
                        {
                            WarehouseId = item.Id,
                            Value = JsonSerializer.Serialize(miniMap, JsonSerializerOptions.Web),
                            CreatedAt = DateTime.UtcNow,
                            Id = Guid.NewGuid().ToString("N")
                        });
                        await saveContext.SaveChangesAsync(stoppingToken);
                        Log.Logger.Information("仓库 {WarehouseName} 的知识图谱生成成功", item.Name);
                    }
                    else
                    {
                        Log.Logger.Warning("仓库 {WarehouseName} 的知识图谱生成失败", item.Name);
                    }
                }
                catch (Exception e)
                {
                    Log.Logger.Error(e, "处理仓库 {WarehouseName} 时发生异常：{Message}\n堆栈：{StackTrace}\n内部异常：{InnerException}",
                        item.Name, e.Message, e.StackTrace, e.InnerException?.ToString() ?? "无");
                }
            }
            catch (Exception e)
            {
                await Task.Delay(10000, stoppingToken); // 等待10秒后重试
                Log.Logger.Error(e, "MiniMapBackgroundService 执行异常：{Message}\n堆栈：{StackTrace}\n内部异常：{InnerException}",
                    e.Message, e.StackTrace, e.InnerException?.ToString() ?? "无");
            }
        }
    }
}