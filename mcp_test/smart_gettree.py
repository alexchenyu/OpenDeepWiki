#!/usr/bin/env python3
"""
智能GetTree处理工具 - 避免context window溢出
"""

import json
import requests
import time
from typing import Dict, Any, List, Optional

class SmartGetTreeHandler:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'User-Agent': 'OpenBMC-Smart-Tree/1.0'
        })
    
    def _make_mcp_request(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Make MCP JSON-RPC request with SSE response handling"""
        payload = {
            "jsonrpc": "2.0",
            "id": int(time.time() * 1000),
            "method": method,
            "params": params
        }
        
        response = self.session.post(self.base_url, json=payload, timeout=120, stream=True)
        response.raise_for_status()
        
        lines = response.text.strip().split('\n')
        for line in lines:
            if line.startswith('data: '):
                try:
                    return json.loads(line[6:])
                except json.JSONDecodeError:
                    return {"error": f"JSON解析失败: {line[6:]}"}
        return {"error": "未找到SSE数据"}
    
    def get_full_tree(self) -> Optional[str]:
        """获取完整文件树"""
        response = self._make_mcp_request("tools/call", {
            "name": "openbmcopenbmc-GetTree",
            "arguments": {}
        })
        
        if "result" in response:
            result = response["result"]
            if isinstance(result, dict) and "content" in result:
                content = result["content"]
                if isinstance(content, list) and len(content) > 0:
                    return content[0].get("text", "")
        return None
    
    def parse_tree_structure(self, tree_text: str) -> Dict[str, Any]:
        """解析文件树结构"""
        lines = tree_text.strip().split('\n')
        structure = {
            "directories": [],
            "files": [],
            "total_dirs": 0,
            "total_files": 0,
            "depth_stats": {}
        }
        
        for line in lines:
            if not line.strip():
                continue
                
            # 计算缩进深度
            depth = (len(line) - len(line.lstrip())) // 2
            
            # 提取名称和类型
            content = line.strip()
            if content.endswith('/D'):
                # 目录
                name = content[:-2]
                structure["directories"].append({
                    "name": name,
                    "depth": depth,
                    "path": name
                })
                structure["total_dirs"] += 1
            elif content.endswith('/F'):
                # 文件
                name = content[:-2]
                structure["files"].append({
                    "name": name,
                    "depth": depth,
                    "path": name
                })
                structure["total_files"] += 1
            
            # 统计深度
            if depth not in structure["depth_stats"]:
                structure["depth_stats"][depth] = 0
            structure["depth_stats"][depth] += 1
        
        return structure
    
    def get_tree_summary(self, max_items: int = 50) -> Dict[str, Any]:
        """获取文件树摘要，避免context window溢出"""
        print("📁 获取文件树摘要...")
        
        tree_text = self.get_full_tree()
        if not tree_text:
            return {"error": "无法获取文件树"}
        
        print(f"📊 原始文件树大小: {len(tree_text)} 字符")
        
        # 解析结构
        structure = self.parse_tree_structure(tree_text)
        
        # 创建摘要
        summary = {
            "statistics": {
                "total_directories": structure["total_dirs"],
                "total_files": structure["total_files"],
                "total_items": structure["total_dirs"] + structure["total_files"],
                "max_depth": max(structure["depth_stats"].keys()) if structure["depth_stats"] else 0,
                "depth_distribution": structure["depth_stats"]
            },
            "top_level_directories": [],
            "sample_files": [],
            "file_types": {},
            "large_directories": []
        }
        
        # 顶级目录
        top_dirs = [d for d in structure["directories"] if d["depth"] == 0]
        summary["top_level_directories"] = [d["name"] for d in top_dirs[:20]]
        
        # 示例文件（限制数量）
        sample_files = structure["files"][:max_items]
        summary["sample_files"] = [f["name"] for f in sample_files]
        
        # 文件类型统计
        for file_item in structure["files"]:
            name = file_item["name"]
            if '.' in name:
                ext = name.split('.')[-1].lower()
                summary["file_types"][ext] = summary["file_types"].get(ext, 0) + 1
        
        # 按文件类型排序，取前10
        summary["file_types"] = dict(sorted(
            summary["file_types"].items(), 
            key=lambda x: x[1], 
            reverse=True
        )[:10])
        
        return summary
    
    def get_directory_content(self, directory_path: str, max_depth: int = 2) -> Dict[str, Any]:
        """获取特定目录的内容（模拟，基于完整树）"""
        tree_text = self.get_full_tree()
        if not tree_text:
            return {"error": "无法获取文件树"}
        
        lines = tree_text.strip().split('\n')
        directory_content = {
            "path": directory_path,
            "subdirectories": [],
            "files": [],
            "total_items": 0
        }
        
        in_target_dir = False
        target_depth = None
        
        for line in lines:
            if not line.strip():
                continue
            
            depth = (len(line) - len(line.lstrip())) // 2
            content = line.strip()
            
            # 检查是否是目标目录
            if content == f"{directory_path}/D" or content == directory_path:
                in_target_dir = True
                target_depth = depth
                continue
            
            # 如果在目标目录中
            if in_target_dir:
                # 如果深度回到目标深度或更浅，说明已经离开目标目录
                if depth <= target_depth:
                    break
                
                # 如果深度超过限制，跳过
                if depth > target_depth + max_depth:
                    continue
                
                # 添加内容
                if content.endswith('/D'):
                    name = content[:-2]
                    directory_content["subdirectories"].append(name)
                elif content.endswith('/F'):
                    name = content[:-2]
                    directory_content["files"].append(name)
                
                directory_content["total_items"] += 1
        
        return directory_content
    
    def search_files_by_pattern(self, pattern: str, limit: int = 20) -> List[str]:
        """在文件树中搜索匹配模式的文件"""
        tree_text = self.get_full_tree()
        if not tree_text:
            return []
        
        lines = tree_text.strip().split('\n')
        matches = []
        
        for line in lines:
            content = line.strip()
            if content.endswith('/F'):
                filename = content[:-2]
                if pattern.lower() in filename.lower():
                    matches.append(filename)
                    if len(matches) >= limit:
                        break
        
        return matches

def main():
    """演示智能GetTree处理"""
    handler = SmartGetTreeHandler("http://us-agent.supermicro.com:8080/api/mcp?owner=openbmc&name=openbmc")
    
    print("🚀 智能文件树处理演示")
    print("=" * 60)
    
    # 1. 获取摘要
    print("\n1️⃣ 获取文件树摘要")
    print("-" * 30)
    summary = handler.get_tree_summary(max_items=30)
    
    if "error" not in summary:
        stats = summary["statistics"]
        print(f"📊 统计信息:")
        print(f"   • 总目录数: {stats['total_directories']:,}")
        print(f"   • 总文件数: {stats['total_files']:,}")
        print(f"   • 最大深度: {stats['max_depth']}")
        
        print(f"\n📁 顶级目录 (前10个):")
        for i, dir_name in enumerate(summary["top_level_directories"][:10], 1):
            print(f"   {i:2d}. {dir_name}")
        
        print(f"\n📄 文件类型分布 (前5个):")
        for ext, count in list(summary["file_types"].items())[:5]:
            print(f"   • .{ext}: {count:,} 个文件")
    
    # 2. 搜索特定文件
    print(f"\n2️⃣ 搜索README文件")
    print("-" * 30)
    readme_files = handler.search_files_by_pattern("readme", limit=10)
    for i, file_path in enumerate(readme_files, 1):
        print(f"   {i:2d}. {file_path}")
    
    # 3. 获取特定目录内容
    print(f"\n3️⃣ 获取meta-phosphor目录内容")
    print("-" * 30)
    dir_content = handler.get_directory_content("meta-phosphor", max_depth=1)
    if "error" not in dir_content:
        print(f"📁 子目录 (前10个):")
        for i, subdir in enumerate(dir_content["subdirectories"][:10], 1):
            print(f"   {i:2d}. {subdir}")
        
        print(f"\n📄 文件 (前10个):")
        for i, file_name in enumerate(dir_content["files"][:10], 1):
            print(f"   {i:2d}. {file_name}")

if __name__ == "__main__":
    main()
