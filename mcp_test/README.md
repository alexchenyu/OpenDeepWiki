# OpenBMC MCP Interface Test Program

This program tests the MCP (Management Control Protocol) interface for the openbmc/openbmc repository.

## Quick Start

```bash
# Run the complete test suite
./run_mcp_test.sh
```

Or run manually:

```bash
# Install dependencies
uv pip install requests  # or pip3 install requests

# Run tests
python3 mcp_test.py
```

## Configuration

The test program uses the following MCP configuration:

```json
{
  "type": "streamable-http",
  "url": "http://us-agent.supermicro.com:8080/api/mcp?owner=openbmc&name=openbmc",
  "timeout": 120,
  "alwaysAllow": ["openbmcopenbmc-ReadFileFromLineAsync"]
}
```

## Test Coverage

The program tests:

1. **GetTree Operation** - Retrieves the file system structure
2. **ReadFileFromLineAsync Operation** - Tests file reading with various files:
   - Root documentation files (README.md, LICENSE, MAINTAINERS)
   - Configuration files (layer.conf, bitbake.conf)
   - Build recipes (.bb files)
   - Source files (.bbclass files)
3. **Edge Cases**:
   - Invalid file paths
   - Large line ranges
   - Negative line numbers

## Output

The program generates:
- Real-time test results with emojis and timing
- Comprehensive summary statistics
- Detailed JSON report (`mcp_test_report.json`)

## Test Results Format

Each test returns:
- ✅ PASS - Operation succeeded
- ❌ FAIL - Operation failed with error details
- ⏭️ SKIP - Test was skipped

## Example Output

```
🚀 Starting OpenBMC MCP Interface Test Suite
📡 Target URL: http://us-agent.supermicro.com:8080/api/mcp...
⏱️  Timeout: 120s
------------------------------------------------------------

1️⃣  Testing GetTree operation...
✅ GetTree
   📝 Successfully retrieved file tree with 15420 characters
   ⏱️  Execution time: 0.245s

2️⃣  Testing ReadFileFromLineAsync operation...
✅ ReadFileFromLineAsync(README.md)
   📝 Successfully read 2840 characters from README.md
   ⏱️  Execution time: 0.156s
   📄 Preview: # OpenBMC

The OpenBMC project can be described as a Linux distribution for embedded...
```

## Error Handling

The program handles:
- Network timeouts and connection errors
- MCP protocol errors (JSON-RPC error responses)
- Invalid file paths and parameters
- Malformed responses

## Dependencies

- Python 3.6+
- `requests` library for HTTP communication