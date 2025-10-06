#!/bin/bash
set -e

echo "=========================================="
echo "Docker 数据迁移到 /home 分区"
echo "=========================================="
echo ""

# 1. 停止所有容器和 Docker 服务
echo "步骤 1/9: 停止所有容器..."
cd /home/alex_chen/OpenDeepWiki
docker compose -f docker-compose-mem0.yml down || true

echo "步骤 2/9: 停止 Docker 服务..."
sudo systemctl stop docker
sudo systemctl stop docker.socket

# 2. 查看当前 Docker 数据大小
echo ""
echo "步骤 3/9: 检查当前 Docker 数据大小..."
sudo du -sh /var/lib/docker

# 3. 创建新的 Docker 数据目录
echo ""
echo "步骤 4/9: 创建新的 Docker 数据目录 /home/docker..."
sudo mkdir -p /home/docker

# 4. 复制数据
echo ""
echo "步骤 5/9: 复制 Docker 数据（这可能需要几分钟）..."
sudo rsync -aP /var/lib/docker/ /home/docker/

# 5. 备份旧配置
echo ""
echo "步骤 6/9: 备份 Docker 配置..."
sudo mkdir -p /etc/docker
sudo cp /etc/docker/daemon.json /etc/docker/daemon.json.bak 2>/dev/null || echo "无现有配置文件，跳过备份"

# 6. 创建新配置
echo ""
echo "步骤 7/9: 更新 Docker 配置..."
sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "data-root": "/home/docker"
}
EOF

# 7. 启动 Docker
echo ""
echo "步骤 8/9: 启动 Docker 服务..."
sudo systemctl start docker

# 8. 验证
echo ""
echo "步骤 9/9: 验证新路径..."
docker info | grep "Docker Root Dir"

echo ""
echo "=========================================="
echo "迁移完成！"
echo "=========================================="
echo ""
echo "新的 Docker 数据路径："
docker info | grep "Docker Root Dir"
echo ""
echo "验证容器是否正常："
docker ps -a
echo ""
echo "如果一切正常，可以删除旧数据释放空间："
echo "  sudo rm -rf /var/lib/docker"
echo ""
echo "旧数据大小："
sudo du -sh /var/lib/docker 2>/dev/null || echo "已删除"
echo ""
echo "根分区剩余空间："
df -h /
echo ""

