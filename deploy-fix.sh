#!/bin/bash
set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 解析命令行参数
RUN_MODE="foreground"  # 默认前台运行

if [ $# -gt 0 ]; then
    case "$1" in
        -d|--daemon|background)
            RUN_MODE="background"
            ;;
        -f|--foreground|foreground)
            RUN_MODE="foreground"
            ;;
        -h|--help)
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  -f, --foreground    前台运行（默认），日志输出到终端和 mem0.log"
            echo "  -d, --daemon        后台运行，日志输出到 mem0.log"
            echo "  -h, --help          显示此帮助信息"
            echo ""
            echo "示例:"
            echo "  $0                  # 前台运行"
            echo "  $0 -d               # 后台运行"
            echo "  $0 --foreground     # 前台运行"
            exit 0
            ;;
        *)
            echo -e "${RED}错误: 未知选项 '$1'${NC}"
            echo "使用 '$0 --help' 查看帮助"
            exit 1
            ;;
    esac
fi

echo "=========================================="
echo "OpenDeepWiki 超时问题完整修复部署脚本"
echo "运行模式: $([ "$RUN_MODE" = "background" ] && echo "后台" || echo "前台")"
echo "=========================================="
echo ""

# 1. 停止所有服务
echo -e "${YELLOW}[1/7] 停止所有服务...${NC}"
make down 2>/dev/null || docker-compose -f docker-compose-mem0.yml down

# 2. 清理旧容器和镜像
echo -e "${YELLOW}[2/7] 清理旧容器和镜像...${NC}"
docker stop opendeepwiki-koalawiki-1 aspire-dashboard mem0 opendeepwiki-postgres-1 neo4j opendeepwiki-mem0 2>/dev/null || true
docker rm opendeepwiki-koalawiki-1 aspire-dashboard mem0 opendeepwiki-postgres-1 neo4j opendeepwiki-mem0 2>/dev/null || true

# 删除旧镜像（保留基础镜像）
echo -e "${YELLOW}[3/7] 删除旧的 koalawiki 镜像...${NC}"
docker rmi opendeepwiki_koalawiki opendeepwiki-koalawiki 2>/dev/null || true

# 3. 构建前端（如果需要）
echo -e "${YELLOW}[4/7] 构建前端...${NC}"
if [ -d "web-site" ]; then
    cd web-site
    if [ -f "package.json" ]; then
        echo "构建 React 前端..."
        npm run build
    fi
    cd ..
else
    echo "跳过前端构建（目录不存在）"
fi

# 4. 强制重新构建 koalawiki 镜像
echo -e "${YELLOW}[5/7] 重新构建 koalawiki 镜像（--no-cache）...${NC}"
docker-compose -f docker-compose-mem0.yml build --no-cache koalawiki

# 5. 验证镜像构建时间
echo -e "${YELLOW}[6/7] 验证新镜像...${NC}"
docker images opendeepwiki_koalawiki --format "table {{.Repository}}\t{{.Tag}}\t{{.CreatedAt}}"

# 6. 启动服务
echo -e "${YELLOW}[7/7] 启动所有服务...${NC}"
echo ""

rm -f mem0.log

if [ "$RUN_MODE" = "background" ]; then
    # 后台运行
    echo -e "${GREEN}=========================================="
    echo "服务后台启动中..."
    echo "日志保存到: mem0.log"
    echo "==========================================${NC}"
    echo ""

    make dev-mem0 >> mem0.log 2>&1 &

    echo -e "${GREEN}✓ 服务已在后台启动${NC}"
    echo ""
    echo "查看日志: tail -f mem0.log"
    echo "停止服务: make down-mem0"
    echo ""
else
    # 前台运行
    echo -e "${GREEN}=========================================="
    echo "服务启动中，按 Ctrl+C 停止..."
    echo "日志同时保存到: mem0.log"
    echo "==========================================${NC}"
    echo ""

    make dev-mem0 2>&1 | tee mem0.log
fi
