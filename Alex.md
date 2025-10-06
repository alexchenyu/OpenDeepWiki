```bash
sudo rm -rf OpenDeepWiki
git clone https://github.com/AIDotNet/OpenDeepWiki.git

每次改完代码，我都这样重新从头开始运行：
docker stop opendeepwiki-koalawiki-1 aspire-dashboard mem0 opendeepwiki-postgres-1 neo4j opendeepwiki-mem0
docker rm opendeepwiki-koalawiki-1 aspire-dashboard mem0 opendeepwiki-postgres-1 neo4j opendeepwiki-mem0
docker rmi $(docker images --filter "dangling=true" -q --no-trunc)
make down
docker rmi crpi-j9ha7sxwhatgtvj4.cn-shenzhen.personal.cr.aliyuncs.com/koala-ai/koala-wiki mcr.microsoft.com/dotnet/aspire-dashboard neo4j:5.26.4 registry.cn-shenzhen.aliyuncs.com/tokengo/mem0 opendeepwiki-mem0
sudo rm -rf repositories/openbmc
sudo rm -rf data/ postgres_db/ neo4j_data/ repositories/
make build
make dev-mem0 2>&1 | tee mem0.log


# 只改了业务代码：
make build-backend          # 重新构建后端
make down-mem0             # 停止服务
make up-mem0               # 启动服务（或用 dev-mem0 查看日志）

# 改了数据库 Schema（需要重新迁移）
make down-mem0
sudo rm -rf postgres_db/    # 只删除 PostgreSQL 数据
sudo rm -rf neo4j_data/     # 只删除 Neo4j 数据（如果改了 graph schema）
make build-backend
make up-mem0

# 完全重置：
make down-mem0
sudo rm -rf postgres_db/ neo4j_data/ data/
make build-backend
make up-mem0
```