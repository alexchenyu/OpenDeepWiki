#!/usr/bin/env python3
"""
OpenBMC MCP Interface Test Program
Tests the MCP (Management Control Protocol) interface for openbmc/openbmc repository
"""

import json
import requests
import time
import re
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum

class TestStatus(Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    SKIP = "SKIP"

@dataclass
class TestResult:
    name: str
    status: TestStatus
    message: str
    response_data: Optional[Dict[str, Any]] = None
    execution_time: float = 0.0

class MCPTester:
    """Test client for OpenBMC MCP interface"""
    
    def __init__(self, base_url: str, timeout: int = 120):
        self.base_url = base_url
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': '*/*',  # Match curl's default
            'User-Agent': 'OpenBMC-MCP-Tester/1.0'
        })
        self.test_results: List[TestResult] = []
    
    def _parse_sse_response(self, response_text: str) -> Dict[str, Any]:
        """Parse Server-Sent Events response"""
        lines = response_text.strip().split('\n')
        data_line = None
        
        for line in lines:
            if line.startswith('data: '):
                data_line = line[6:]  # Remove 'data: ' prefix
                break
        
        if data_line:
            try:
                return json.loads(data_line)
            except json.JSONDecodeError as e:
                return {"error": f"Failed to parse JSON: {str(e)}", "raw_data": data_line}
        
        return {"error": "No data found in SSE response", "raw_response": response_text}
    
    def _make_mcp_request(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Make MCP JSON-RPC request with SSE response handling"""
        payload = {
            "jsonrpc": "2.0",
            "id": int(time.time() * 1000),
            "method": method,
            "params": params
        }
        
        response = self.session.post(
            self.base_url,
            json=payload,
            timeout=self.timeout,
            stream=True  # Important for SSE
        )
        response.raise_for_status()
        
        # Parse SSE response
        return self._parse_sse_response(response.text)
    
    def test_read_file_from_line_async(self, file_path: str, start_line: int = 0, 
                                     end_line: int = 10, test_name: str = None) -> TestResult:
        """Test ReadFileFromLineAsync operation"""
        if test_name is None:
            test_name = f"ReadFileFromLineAsync({file_path})"
        
        start_time = time.time()
        
        try:
            params = {
                "filePath": file_path,
                "startLine": start_line,
                "endLine": end_line
            }
            
            # Use tools/call format for MCP tool invocation
            response = self._make_mcp_request("tools/call", {
                "name": "openbmcopenbmc-ReadFileFromLineAsync", 
                "arguments": params
            })
            execution_time = time.time() - start_time
            
            if "error" in response:
                return TestResult(
                    name=test_name,
                    status=TestStatus.FAIL,
                    message=f"MCP Error: {response['error']}",
                    response_data=response,
                    execution_time=execution_time
                )
            
            if "result" in response:
                result_data = response["result"]
                if isinstance(result_data, str) and result_data.strip():
                    return TestResult(
                        name=test_name,
                        status=TestStatus.PASS,
                        message=f"Successfully read {len(result_data)} characters from {file_path}",
                        response_data=response,
                        execution_time=execution_time
                    )
                elif isinstance(result_data, dict):
                    return TestResult(
                        name=test_name,
                        status=TestStatus.PASS,
                        message=f"Successfully got structured data from {file_path}",
                        response_data=response,
                        execution_time=execution_time
                    )
                else:
                    return TestResult(
                        name=test_name,
                        status=TestStatus.FAIL,
                        message=f"Empty or invalid response from {file_path}",
                        response_data=response,
                        execution_time=execution_time
                    )
            
            return TestResult(
                name=test_name,
                status=TestStatus.FAIL,
                message="No result or error in response",
                response_data=response,
                execution_time=execution_time
            )
            
        except requests.exceptions.Timeout:
            return TestResult(
                name=test_name,
                status=TestStatus.FAIL,
                message=f"Request timeout after {self.timeout}s",
                execution_time=time.time() - start_time
            )
        except requests.exceptions.RequestException as e:
            return TestResult(
                name=test_name,
                status=TestStatus.FAIL,
                message=f"Request failed: {str(e)}",
                execution_time=time.time() - start_time
            )
        except Exception as e:
            return TestResult(
                name=test_name,
                status=TestStatus.FAIL,
                message=f"Unexpected error: {str(e)}",
                execution_time=time.time() - start_time
            )
    
    def get_available_tools(self) -> Dict[str, Any]:
        """Get list of available tools from MCP server"""
        try:
            response = self._make_mcp_request("tools/list", {})
            if "result" in response and "tools" in response["result"]:
                return response["result"]["tools"]
            return []
        except Exception:
            return []
    
    def test_method_discovery(self) -> TestResult:
        """Test method discovery to find correct method names"""
        start_time = time.time()
        
        # Get available tools
        available_tools = self.get_available_tools()
        
        if available_tools:
            tool_names = [tool.get("name", "Unknown") for tool in available_tools]
            print(f"   📋 Found {len(tool_names)} available tools:")
            for tool in available_tools:
                name = tool.get("name", "Unknown")
                desc = tool.get("description", "No description")[:60] + "..."
                print(f"      • {name}: {desc}")
            
            execution_time = time.time() - start_time
            return TestResult(
                name="Method Discovery",
                status=TestStatus.PASS,
                message=f"Found {len(tool_names)} tools: {', '.join(tool_names)}",
                response_data={"available_tools": available_tools},
                execution_time=execution_time
            )
        else:
            execution_time = time.time() - start_time
            return TestResult(
                name="Method Discovery",
                status=TestStatus.FAIL, 
                message="No tools found or failed to get tool list",
                execution_time=execution_time
            )
    
    def test_get_tree(self) -> TestResult:
        """Test GetTree operation"""
        start_time = time.time()
        
        try:
            # Use tools/call format for MCP tool invocation
            response = self._make_mcp_request("tools/call", {
                "name": "openbmcopenbmc-GetTree",
                "arguments": {}
            })
            execution_time = time.time() - start_time
            
            if "error" in response:
                return TestResult(
                    name="GetTree",
                    status=TestStatus.FAIL,
                    message=f"MCP Error: {response['error']}",
                    response_data=response,
                    execution_time=execution_time
                )
            
            if "result" in response and response["result"]:
                return TestResult(
                    name="GetTree",
                    status=TestStatus.PASS,
                    message=f"Successfully retrieved file tree with {len(str(response['result']))} characters",
                    response_data=response,
                    execution_time=execution_time
                )
            
            return TestResult(
                name="GetTree",
                status=TestStatus.FAIL,
                message="Empty tree response",
                response_data=response,
                execution_time=execution_time
            )
            
        except Exception as e:
            return TestResult(
                name="GetTree",
                status=TestStatus.FAIL,
                message=f"Error: {str(e)}",
                execution_time=time.time() - start_time
            )
    
    def test_search_operation(self, query: str, limit: int = 3, test_name: str = None) -> TestResult:
        """Test Search operation"""
        if test_name is None:
            test_name = f"Search({query})"
        
        start_time = time.time()
        
        try:
            params = {
                "query": query,
                "limit": limit,
                "minRelevance": 0.3
            }
            
            # Use tools/call format for MCP tool invocation
            response = self._make_mcp_request("tools/call", {
                "name": "openbmcopenbmc-Search", 
                "arguments": params
            })
            execution_time = time.time() - start_time
            
            if "error" in response:
                return TestResult(
                    name=test_name,
                    status=TestStatus.FAIL,
                    message=f"MCP Error: {response['error']}",
                    response_data=response,
                    execution_time=execution_time
                )
            
            if "result" in response:
                result_data = response["result"]
                if isinstance(result_data, dict) and "content" in result_data:
                    content = result_data["content"]
                    if isinstance(content, list) and len(content) > 0:
                        text_content = content[0].get("text", "")
                        try:
                            import json
                            search_results = json.loads(text_content)
                            results_count = len(search_results.get("results", []))
                            return TestResult(
                                name=test_name,
                                status=TestStatus.PASS,
                                message=f"Search completed successfully, found {results_count} results",
                                response_data=response,
                                execution_time=execution_time
                            )
                        except json.JSONDecodeError:
                            return TestResult(
                                name=test_name,
                                status=TestStatus.PASS,
                                message=f"Search completed, got text response: {text_content[:100]}...",
                                response_data=response,
                                execution_time=execution_time
                            )
                    else:
                        return TestResult(
                            name=test_name,
                            status=TestStatus.PASS,
                            message="Search completed but returned empty results",
                            response_data=response,
                            execution_time=execution_time
                        )
                else:
                    return TestResult(
                        name=test_name,
                        status=TestStatus.PASS,
                        message=f"Search completed with result type: {type(result_data)}",
                        response_data=response,
                        execution_time=execution_time
                    )
            
            return TestResult(
                name=test_name,
                status=TestStatus.FAIL,
                message="No result or error in response",
                response_data=response,
                execution_time=execution_time
            )
            
        except Exception as e:
            return TestResult(
                name=test_name,
                status=TestStatus.FAIL,
                message=f"Error: {str(e)}",
                execution_time=time.time() - start_time
            )
    
    def test_generate_document(self, question: str, test_name: str = None) -> TestResult:
        """Test GenerateDocument operation"""
        if test_name is None:
            test_name = f"GenerateDocument({question[:30]}...)"
        
        start_time = time.time()
        
        try:
            params = {"question": question}
            
            # Use tools/call format for MCP tool invocation
            response = self._make_mcp_request("tools/call", {
                "name": "openbmcopenbmc_GenerateDocument", 
                "arguments": params
            })
            execution_time = time.time() - start_time
            
            if "error" in response:
                return TestResult(
                    name=test_name,
                    status=TestStatus.FAIL,
                    message=f"MCP Error: {response['error']}",
                    response_data=response,
                    execution_time=execution_time
                )
            
            if "result" in response and response["result"]:
                result_data = response["result"]
                if isinstance(result_data, dict) and "content" in result_data:
                    content = result_data["content"]
                    if isinstance(content, list) and len(content) > 0:
                        text_content = content[0].get("text", "")
                        return TestResult(
                            name=test_name,
                            status=TestStatus.PASS,
                            message=f"Documentation generated successfully, {len(text_content)} characters",
                            response_data=response,
                            execution_time=execution_time
                        )
                
                return TestResult(
                    name=test_name,
                    status=TestStatus.PASS,
                    message=f"Documentation generated with result type: {type(result_data)}",
                    response_data=response,
                    execution_time=execution_time
                )
            
            return TestResult(
                name=test_name,
                status=TestStatus.FAIL,
                message="Empty documentation response",
                response_data=response,
                execution_time=execution_time
            )
            
        except Exception as e:
            return TestResult(
                name=test_name,
                status=TestStatus.FAIL,
                message=f"Error: {str(e)}",
                execution_time=time.time() - start_time
            )
    
    def run_comprehensive_test_suite(self) -> List[TestResult]:
        """Run comprehensive test suite"""
        print("🚀 Starting OpenBMC MCP Interface Test Suite")
        print(f"📡 Target URL: {self.base_url}")
        print(f"⏱️  Timeout: {self.timeout}s")
        print("-" * 60)
        
        # Test file paths to try (common OpenBMC files)
        test_files = [
            # Root level files  
            ("README.md", 0, 50),
            ("LICENSE", 0, 20),
            ("MAINTAINERS", 0, 30),
            
            # Configuration files
            ("meta-openembedded/meta-oe/conf/layer.conf", 0, 20),
            ("poky/meta/conf/bitbake.conf", 0, 30),
            
            # Build files
            ("meta-openembedded/meta-oe/recipes-connectivity/libmbim/libmbim_1.30.0.bb", 0, 15),
            ("poky/meta/recipes-kernel/linux/linux-yocto-common.inc", 0, 25),
            
            # Documentation
            ("meta-phosphor/README.md", 0, 40),
            ("docs/README.md", 0, 30),
            
            # Source files
            ("meta-phosphor/recipes-phosphor/interfaces/bmcweb_git.bb", 0, 20),
            ("meta-phosphor/classes/phosphor-dbus-service.bbclass", 0, 25),
        ]
        
        # 0. Test method discovery first
        print("0️⃣  Discovering available methods...")
        discovery_result = self.test_method_discovery()
        self.test_results.append(discovery_result)
        self._print_test_result(discovery_result)
        
        # 1. Test GetTree operation
        print("1️⃣  Testing GetTree operation...")
        tree_result = self.test_get_tree()
        self.test_results.append(tree_result)
        self._print_test_result(tree_result)
        
        # 2. Test Search operation
        print("\n2️⃣  Testing Search operation...")
        search_queries = [
            "OpenBMC README documentation",
            "configuration files",
            "build system"
        ]
        
        for query in search_queries:
            search_result = self.test_search_operation(query, limit=2)
            self.test_results.append(search_result)
            self._print_test_result(search_result)
        
        # 3. Test GenerateDocument operation  
        print("\n3️⃣  Testing GenerateDocument operation...")
        doc_questions = [
            "What is OpenBMC?",
            "How to build OpenBMC?"
        ]
        
        for question in doc_questions:
            doc_result = self.test_generate_document(question)
            self.test_results.append(doc_result)
            self._print_test_result(doc_result)
        
        # 4. Test ReadFileFromLineAsync operation (even though it's failing)
        print("\n4️⃣  Testing ReadFileFromLineAsync operation...")
        for file_path, start_line, end_line in test_files:
            result = self.test_read_file_from_line_async(file_path, start_line, end_line)
            self.test_results.append(result)
            self._print_test_result(result)
        
        # 5. Test edge cases
        print("\n5️⃣  Testing edge cases...")
        
        # Test with invalid file path
        invalid_result = self.test_read_file_from_line_async(
            "/nonexistent/file.txt", 0, 10, "Invalid file path test"
        )
        self.test_results.append(invalid_result)
        self._print_test_result(invalid_result)
        
        # Test with large line range
        large_range_result = self.test_read_file_from_line_async(
            "README.md", 0, 1000, "Large line range test"
        )
        self.test_results.append(large_range_result)
        self._print_test_result(large_range_result)
        
        # Test with negative line numbers
        negative_result = self.test_read_file_from_line_async(
            "README.md", -1, 5, "Negative line numbers test"
        )
        self.test_results.append(negative_result)
        self._print_test_result(negative_result)
        
        return self.test_results
    
    def _print_test_result(self, result: TestResult):
        """Print formatted test result"""
        status_emoji = {
            TestStatus.PASS: "✅",
            TestStatus.FAIL: "❌", 
            TestStatus.SKIP: "⏭️"
        }
        
        print(f"{status_emoji[result.status]} {result.name}")
        print(f"   📝 {result.message}")
        print(f"   ⏱️  Execution time: {result.execution_time:.3f}s")
        
        if result.response_data and result.status == TestStatus.PASS:
            if "result" in result.response_data:
                result_preview = str(result.response_data["result"])[:100]
                if len(result_preview) == 100:
                    result_preview += "..."
                print(f"   📄 Preview: {result_preview}")
        print()
    
    def generate_test_report(self) -> Dict[str, Any]:
        """Generate comprehensive test report"""
        total_tests = len(self.test_results)
        passed_tests = sum(1 for r in self.test_results if r.status == TestStatus.PASS)
        failed_tests = sum(1 for r in self.test_results if r.status == TestStatus.FAIL)
        skipped_tests = sum(1 for r in self.test_results if r.status == TestStatus.SKIP)
        
        total_time = sum(r.execution_time for r in self.test_results)
        avg_time = total_time / total_tests if total_tests > 0 else 0
        
        report = {
            "summary": {
                "total_tests": total_tests,
                "passed": passed_tests,
                "failed": failed_tests,
                "skipped": skipped_tests,
                "success_rate": (passed_tests / total_tests * 100) if total_tests > 0 else 0,
                "total_execution_time": total_time,
                "average_execution_time": avg_time
            },
            "test_details": [
                {
                    "name": r.name,
                    "status": r.status.value,
                    "message": r.message,
                    "execution_time": r.execution_time,
                    "has_response_data": r.response_data is not None
                }
                for r in self.test_results
            ]
        }
        
        return report
    
    def print_summary(self):
        """Print test summary"""
        report = self.generate_test_report()
        summary = report["summary"]
        
        print("=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        print(f"🧪 Total Tests: {summary['total_tests']}")
        print(f"✅ Passed: {summary['passed']}")
        print(f"❌ Failed: {summary['failed']}")
        print(f"⏭️  Skipped: {summary['skipped']}")
        print(f"📈 Success Rate: {summary['success_rate']:.1f}%")
        print(f"⏱️  Total Time: {summary['total_execution_time']:.3f}s")
        print(f"⏱️  Average Time: {summary['average_execution_time']:.3f}s")
        print("=" * 60)

def main():
    """Main function to run MCP tests"""
    # MCP configuration from your settings
    mcp_config = {
        "type": "streamable-http",
        "url": "http://us-agent.supermicro.com:8080/api/mcp?owner=openbmc&name=openbmc",
        "timeout": 120,
        "alwaysAllow": ["openbmcopenbmc-ReadFileFromLineAsync"]
    }
    
    # Initialize tester
    tester = MCPTester(mcp_config["url"], mcp_config["timeout"])
    
    try:
        # Run comprehensive test suite
        results = tester.run_comprehensive_test_suite()
        
        # Print summary
        tester.print_summary()
        
        # Save detailed report
        report = tester.generate_test_report()
        with open("mcp_test_report.json", "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        
        print(f"📄 Detailed report saved to: mcp_test_report.json")
        
        # Exit with appropriate code
        failed_count = report["summary"]["failed"]
        if failed_count > 0:
            print(f"\n⚠️  {failed_count} tests failed. Check the report for details.")
            return 1
        else:
            print(f"\n🎉 All tests passed successfully!")
            return 0
            
    except KeyboardInterrupt:
        print("\n⏹️  Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n💥 Fatal error: {str(e)}")
        return 1

if __name__ == "__main__":
    exit(main())
