#!/usr/bin/env python3
"""
简化版MCP测试 - 按功能分组显示结果
"""

import json
import requests
import time
from typing import Dict, Any, List

class SimpleMCPTester:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'User-Agent': 'OpenBMC-MCP-Tester/1.0'
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
        
        # Parse SSE response
        lines = response.text.strip().split('\n')
        for line in lines:
            if line.startswith('data: '):
                try:
                    return json.loads(line[6:])
                except json.JSONDecodeError:
                    return {"error": f"Failed to parse JSON: {line[6:]}"}
        
        return {"error": "No data found in SSE response"}
    
    def test_functionality(self):
        """Test each MCP functionality once"""
        print("🚀 OpenBMC MCP 功能测试")
        print("=" * 50)
        
        results = {}
        
        # 1. 测试工具发现
        print("\n1️⃣ 测试工具发现...")
        try:
            response = self._make_mcp_request("tools/list", {})
            if "result" in response and "tools" in response["result"]:
                tools = response["result"]["tools"]
                print(f"✅ 成功发现 {len(tools)} 个工具")
                for tool in tools:
                    print(f"   • {tool.get('name', 'Unknown')}")
                results["工具发现"] = "✅ 成功"
            else:
                print("❌ 工具发现失败")
                results["工具发现"] = "❌ 失败"
        except Exception as e:
            print(f"❌ 工具发现出错: {str(e)}")
            results["工具发现"] = "❌ 错误"
        
        # 2. 测试GetTree
        print("\n2️⃣ 测试文件树获取...")
        try:
            response = self._make_mcp_request("tools/call", {
                "name": "openbmcopenbmc-GetTree",
                "arguments": {}
            })
            if "result" in response:
                content = str(response["result"])
                print(f"✅ 成功获取文件树 ({len(content)} 字符)")
                results["文件树获取"] = "✅ 成功"
            else:
                print(f"❌ 文件树获取失败: {response.get('error', 'Unknown error')}")
                results["文件树获取"] = "❌ 失败"
        except Exception as e:
            print(f"❌ 文件树获取出错: {str(e)}")
            results["文件树获取"] = "❌ 错误"
        
        # 3. 测试搜索
        print("\n3️⃣ 测试搜索功能...")
        try:
            response = self._make_mcp_request("tools/call", {
                "name": "openbmcopenbmc-Search",
                "arguments": {"query": "README", "limit": 2}
            })
            if "result" in response:
                print("✅ 搜索功能正常工作")
                results["搜索功能"] = "✅ 成功"
            else:
                print(f"❌ 搜索失败: {response.get('error', 'Unknown error')}")
                results["搜索功能"] = "❌ 失败"
        except Exception as e:
            print(f"❌ 搜索出错: {str(e)}")
            results["搜索功能"] = "❌ 错误"
        
        # 4. 测试文档生成
        print("\n4️⃣ 测试文档生成...")
        try:
            response = self._make_mcp_request("tools/call", {
                "name": "openbmcopenbmc_GenerateDocument",
                "arguments": {"question": "What is OpenBMC?"}
            })
            if "result" in response:
                result = response["result"]
                if isinstance(result, dict) and "content" in result:
                    content = result["content"][0].get("text", "")
                    print(f"✅ 文档生成成功 ({len(content)} 字符)")
                    results["文档生成"] = "✅ 成功"
                else:
                    print("✅ 文档生成成功")
                    results["文档生成"] = "✅ 成功"
            else:
                print(f"❌ 文档生成失败: {response.get('error', 'Unknown error')}")
                results["文档生成"] = "❌ 失败"
        except Exception as e:
            print(f"❌ 文档生成出错: {str(e)}")
            results["文档生成"] = "❌ 错误"
        
        # 5. 测试文件读取
        print("\n5️⃣ 测试文件读取...")
        try:
            response = self._make_mcp_request("tools/call", {
                "name": "openbmcopenbmc-ReadFileFromLineAsync",
                "arguments": {"filePath": "README.md", "startLine": 0, "endLine": 5}
            })
            if "result" in response:
                print("✅ 文件读取成功")
                results["文件读取"] = "✅ 成功"
            else:
                print(f"❌ 文件读取失败: {response.get('error', 'Unknown error')}")
                results["文件读取"] = "❌ 失败"
        except Exception as e:
            print(f"❌ 文件读取出错: {str(e)}")
            results["文件读取"] = "❌ 错误"
        
        # 总结
        print("\n" + "=" * 50)
        print("📊 功能测试总结")
        print("=" * 50)
        
        success_count = sum(1 for v in results.values() if "✅" in v)
        total_count = len(results)
        
        for func, status in results.items():
            print(f"{status} {func}")
        
        print(f"\n🎯 总体成功率: {success_count}/{total_count} = {success_count/total_count*100:.1f}%")
        
        if success_count >= 3:
            print("\n🎉 您的MCP接口配置成功！大部分功能都正常工作。")
        elif success_count >= 2:
            print("\n⚠️ 您的MCP接口基本配置正确，但有一些功能需要调试。")
        else:
            print("\n❌ 您的MCP接口需要进一步配置。")
        
        return results

def main():
    tester = SimpleMCPTester("http://us-agent.supermicro.com:8080/api/mcp?owner=openbmc&name=openbmc")
    tester.test_functionality()

if __name__ == "__main__":
    main()
