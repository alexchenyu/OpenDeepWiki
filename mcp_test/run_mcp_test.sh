#!/bin/bash

# OpenBMC MCP Interface Test Runner
# Installs dependencies and runs the MCP test program

echo "🔧 Setting up OpenBMC MCP Test Environment..."

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed"
    exit 1
fi

# Install required packages using uv if available, otherwise pip
if command -v uv &> /dev/null; then
    echo "📦 Installing dependencies with uv..."
    uv pip install requests
else
    echo "📦 Installing dependencies with pip..."
    pip3 install requests
fi

# Make the test script executable
chmod +x mcp_test.py

echo "✅ Setup complete!"
echo ""
echo "🚀 Running MCP Interface Tests..."
echo "📡 Target: http://us-agent.supermicro.com:8080/api/mcp?owner=openbmc&name=openbmc"
echo ""

# Run the test program
python3 mcp_test.py

# Capture exit code
exit_code=$?

echo ""
if [ $exit_code -eq 0 ]; then
    echo "🎉 All tests completed successfully!"
else
    echo "⚠️  Some tests failed. Check mcp_test_report.json for details."
fi

exit $exit_code
