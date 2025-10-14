MCP Setting for roo code global MCP
```json
{
  "mcpServers": {
    "CKB": {
      "type": "streamable-http",
      "url": "http://us-agent.supermicro.com:8080/api/mcp?owner=openbmc&name=openbmc",
      "disabled": false,
      "alwaysAllow": [
        "openbmcopenbmc-ReadFileFromLineAsync"
      ],
      "timeout": 120
    }
  }
}
```