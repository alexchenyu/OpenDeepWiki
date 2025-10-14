#!/usr/bin/env python3
"""
ReadFileFromLineAsync 替代方案
使用Search工具来获取文件内容
"""

import json
import requests
import time

def alternative_read_file(file_path: str, base_url: str):
    """使用Search工具作为ReadFileFromLineAsync的替代方案"""
    
    session = requests.Session()
    session.headers.update({
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'User-Agent': 'OpenBMC-MCP-Alternative/1.0'
    })
    
    def make_request(method, params):
        payload = {
            "jsonrpc": "2.0",
            "id": int(time.time() * 1000),
            "method": method,
            "params": params
        }
        
        response = session.post(base_url, json=payload, timeout=120, stream=True)
        response.raise_for_status()
        
        lines = response.text.strip().split('\n')
        for line in lines:
            if line.startswith('data: '):
                try:
                    return json.loads(line[6:])
                except json.JSONDecodeError:
                    return {"error": f"JSON解析失败: {line[6:]}"}
        return {"error": "未找到SSE数据"}
    
    print(f"🔄 尝试使用Search工具获取 {file_path} 的内容...")
    
    # 方法1: 搜索文件名
    search_response = make_request("tools/call", {
        "name": "openbmcopenbmc-Search",
        "arguments": {
            "query": f"file:{file_path}",
            "limit": 5,
            "minRelevance": 0.1
        }
    })
    
    if "result" in search_response:
        result = search_response["result"]
        if isinstance(result, dict) and "content" in result:
            content = result["content"][0].get("text", "")
            try:
                search_results = json.loads(content)
                results = search_results.get("results", [])
                if results:
                    print(f"✅ 通过搜索找到了 {len(results)} 个相关结果")
                    for i, result in enumerate(results[:3]):
                        print(f"   {i+1}. {result.get('metadata', {}).get('source', 'Unknown')}")
                else:
                    print("⚠️ 搜索没有找到相关结果")
            except json.JSONDecodeError:
                print(f"✅ 搜索返回了文本内容: {content[:200]}...")
    
    # 方法2: 使用GenerateDocument获取文件信息
    print(f"\n🔄 尝试使用GenerateDocument获取 {file_path} 的信息...")
    
    doc_response = make_request("tools/call", {
        "name": "openbmcopenbmc_GenerateDocument",
        "arguments": {
            "question": f"Show me the content of {file_path} file"
        }
    })
    
    if "result" in doc_response:
        result = doc_response["result"]
        if isinstance(result, dict) and "content" in result:
            content = result["content"][0].get("text", "")
            print(f"✅ 生成了关于 {file_path} 的文档 ({len(content)} 字符)")
            print(f"📄 内容预览:\n{content[:500]}...")
            return content
    
    return None

def main():
    base_url = "http://us-agent.supermicro.com:8080/api/mcp?owner=openbmc&name=openbmc"
    
    # 测试几个文件
    files_to_test = ["README.md", "LICENSE", "MAINTAINERS"]
    
    for file_path in files_to_test:
        print(f"\n{'='*60}")
        print(f"📁 测试文件: {file_path}")
        print('='*60)
        
        content = alternative_read_file(file_path, base_url)
        if content:
            print(f"✅ 成功获取 {file_path} 的信息")
        else:
            print(f"❌ 无法获取 {file_path} 的内容")

if __name__ == "__main__":
    main()
