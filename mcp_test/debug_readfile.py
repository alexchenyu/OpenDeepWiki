#!/usr/bin/env python3
"""
ReadFileFromLineAsync 调试工具
"""

import json
import requests
import time

class ReadFileDebugger:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'User-Agent': 'OpenBMC-MCP-Debugger/1.0'
        })
    
    def _make_mcp_request(self, method: str, params: dict) -> dict:
        """Make MCP JSON-RPC request with SSE response handling"""
        payload = {
            "jsonrpc": "2.0",
            "id": int(time.time() * 1000),
            "method": method,
            "params": params
        }
        
        print(f"📤 发送请求: {json.dumps(payload, indent=2)}")
        
        response = self.session.post(self.base_url, json=payload, timeout=120, stream=True)
        response.raise_for_status()
        
        print(f"📥 HTTP状态: {response.status_code}")
        print(f"📥 响应头: {dict(response.headers)}")
        print(f"📥 原始响应: {response.text}")
        
        # Parse SSE response
        lines = response.text.strip().split('\n')
        for line in lines:
            if line.startswith('data: '):
                try:
                    return json.loads(line[6:])
                except json.JSONDecodeError as e:
                    return {"error": f"JSON解析失败: {str(e)}", "raw_data": line[6:]}
        
        return {"error": "未找到SSE数据", "raw_response": response.text}
    
    def debug_read_file(self):
        """调试文件读取功能"""
        print("🔍 调试 ReadFileFromLineAsync 功能")
        print("=" * 60)
        
        # 测试用例列表
        test_cases = [
            {
                "name": "最小参数测试",
                "args": {"filePath": "README.md"}
            },
            {
                "name": "指定行号测试", 
                "args": {"filePath": "README.md", "startLine": 0, "endLine": 5}
            },
            {
                "name": "绝对路径测试",
                "args": {"filePath": "/README.md"}
            },
            {
                "name": "相对路径测试",
                "args": {"filePath": "./README.md"}
            },
            {
                "name": "LICENSE文件测试",
                "args": {"filePath": "LICENSE"}
            },
            {
                "name": "只读1行测试",
                "args": {"filePath": "README.md", "startLine": 0, "endLine": 0}
            }
        ]
        
        for i, test_case in enumerate(test_cases, 1):
            print(f"\n{i}️⃣ {test_case['name']}")
            print("-" * 40)
            
            try:
                response = self._make_mcp_request("tools/call", {
                    "name": "openbmcopenbmc-ReadFileFromLineAsync",
                    "arguments": test_case["args"]
                })
                
                if "error" in response:
                    print(f"❌ 错误: {response['error']}")
                    
                    # 如果是-32603错误，尝试获取更多信息
                    if isinstance(response['error'], dict) and response['error'].get('code') == -32603:
                        print("💡 这是内部服务器错误，可能的原因:")
                        print("   • 文件路径不存在")
                        print("   • 权限不足")
                        print("   • 服务器端实现问题")
                        print("   • 参数格式问题")
                
                elif "result" in response:
                    result = response["result"]
                    if isinstance(result, dict) and "content" in result:
                        content = result["content"]
                        if isinstance(content, list) and len(content) > 0:
                            text_content = content[0].get("text", "")
                            print(f"✅ 成功读取 {len(text_content)} 字符")
                            if text_content:
                                preview = text_content[:200] + "..." if len(text_content) > 200 else text_content
                                print(f"📄 内容预览: {preview}")
                        else:
                            print("⚠️ 返回了空内容")
                    else:
                        print(f"✅ 成功，但格式异常: {type(result)}")
                else:
                    print("⚠️ 响应中没有result或error")
                    
            except Exception as e:
                print(f"💥 异常: {str(e)}")
            
            print()

def main():
    debugger = ReadFileDebugger("http://us-agent.supermicro.com:8080/api/mcp?owner=openbmc&name=openbmc")
    debugger.debug_read_file()

if __name__ == "__main__":
    main()
