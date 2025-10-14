#!/usr/bin/env python3
"""
测试改进后的GetTree功能
"""

import requests
import json
import sys

class ImprovedGetTreeTester:
    def __init__(self):
        self.url = "http://us-agent.supermicro.com:8080/api/mcp?owner=openbmc&name=openbmc"
        self.headers = {
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'User-Agent': 'Python MCP Tester'
        }

    def _make_mcp_request(self, method, params=None):
        """发送MCP请求"""
        request_data = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or {}
        }
        
        print(f"🔄 发送请求: {method}")
        print(f"📤 参数: {json.dumps(params, indent=2, ensure_ascii=False)}")
        
        try:
            response = requests.post(
                self.url, 
                headers=self.headers, 
                json=request_data,
                stream=True,
                timeout=60
            )
            
            if response.headers.get('Content-Type', '').startswith('text/event-stream'):
                return self._parse_sse_response(response)
            else:
                return response.json()
                
        except Exception as e:
            return {"error": f"请求失败: {str(e)}"}

    def _parse_sse_response(self, response):
        """解析SSE响应"""
        try:
            for line in response.iter_lines(decode_unicode=True):
                if line.startswith('data: '):
                    data = line[6:]  # 去掉 'data: ' 前缀
                    if data.strip():
                        return json.loads(data)
            return {"error": "未收到有效的SSE数据"}
        except Exception as e:
            return {"error": f"解析SSE响应失败: {str(e)}"}

    def test_gettree_with_params(self):
        """测试带参数的GetTree"""
        print("=" * 60)
        print("🧪 测试改进后的GetTree功能")
        print("=" * 60)
        
        test_cases = [
            {
                "name": "默认GetTree（无参数）",
                "params": {
                    "name": "openbmcopenbmc-GetTree",
                    "arguments": {}
                }
            },
            {
                "name": "限制深度为2层",
                "params": {
                    "name": "openbmcopenbmc-GetTree",
                    "arguments": {
                        "maxDepth": 2,
                        "maxItems": 50
                    }
                }
            },
            {
                "name": "只显示目录结构",
                "params": {
                    "name": "openbmcopenbmc-GetTree",
                    "arguments": {
                        "maxDepth": 3,
                        "includeFiles": False,
                        "includeDirs": True
                    }
                }
            },
            {
                "name": "紧凑格式输出",
                "params": {
                    "name": "openbmcopenbmc-GetTree",
                    "arguments": {
                        "outputFormat": "compact",
                        "maxItems": 30
                    }
                }
            },
            {
                "name": "摘要格式输出",
                "params": {
                    "name": "openbmcopenbmc-GetTree",
                    "arguments": {
                        "outputFormat": "summary"
                    }
                }
            },
            {
                "name": "指定根路径",
                "params": {
                    "name": "openbmcopenbmc-GetTree",
                    "arguments": {
                        "rootPath": "meta-",
                        "maxDepth": 2,
                        "maxItems": 20
                    }
                }
            }
        ]
        
        for i, test_case in enumerate(test_cases, 1):
            print(f"\n📋 测试 {i}: {test_case['name']}")
            print("-" * 40)
            
            result = self._make_mcp_request("tools/call", test_case["params"])
            
            if "error" in result:
                print(f"❌ 错误: {result['error']}")
                continue
                
            if "result" in result and "content" in result["result"]:
                content = result["result"]["content"]
                if content and len(content) > 0:
                    text = content[0].get("text", "无内容")
                    print(f"✅ 成功")
                    print(f"📏 输出长度: {len(text)} 字符")
                    
                    # 显示前500个字符作为预览
                    preview = text[:500]
                    if len(text) > 500:
                        preview += "..."
                    print(f"📄 预览:\n{preview}")
                else:
                    print("❌ 无内容返回")
            else:
                print(f"❌ 意外的响应格式: {result}")

    def test_readfile_fixed(self):
        """测试修复后的ReadFileFromLineAsync"""
        print("\n" + "=" * 60)
        print("🧪 测试修复后的ReadFileFromLineAsync功能")
        print("=" * 60)
        
        test_cases = [
            {
                "name": "读取README.md文件",
                "params": {
                    "name": "openbmcopenbmc-ReadFileFromLineAsync",
                    "arguments": {
                        "filePath": "README.md",
                        "startLine": 0,
                        "endLine": 20
                    }
                }
            },
            {
                "name": "读取meta-phosphor目录下的文件",
                "params": {
                    "name": "openbmcopenbmc-ReadFileFromLineAsync", 
                    "arguments": {
                        "filePath": "meta-phosphor/README.md",
                        "startLine": 0,
                        "endLine": 10
                    }
                }
            }
        ]
        
        for i, test_case in enumerate(test_cases, 1):
            print(f"\n📋 测试 {i}: {test_case['name']}")
            print("-" * 40)
            
            result = self._make_mcp_request("tools/call", test_case["params"])
            
            if "error" in result:
                print(f"❌ 错误: {result['error']}")
                continue
                
            if "result" in result and "content" in result["result"]:
                content = result["result"]["content"]
                if content and len(content) > 0:
                    text = content[0].get("text", "无内容")
                    print(f"✅ 成功")
                    print(f"📏 输出长度: {len(text)} 字符")
                    print(f"📄 内容:\n{text}")
                else:
                    print("❌ 无内容返回")
            else:
                print(f"❌ 意外的响应格式: {result}")

def main():
    """主函数"""
    tester = ImprovedGetTreeTester()
    
    print("🚀 OpenDeepWiki MCP 改进功能测试")
    print("=" * 60)
    
    # 测试改进后的GetTree功能
    tester.test_gettree_with_params()
    
    # 测试修复后的ReadFileFromLineAsync
    tester.test_readfile_fixed()
    
    print("\n" + "=" * 60)
    print("🏁 测试完成")

if __name__ == "__main__":
    main()