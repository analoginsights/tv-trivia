#!/bin/bash

# Start dev server in background
echo "🚀 Starting development server..."
npm run dev > /tmp/dev-server.log 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
echo "⏳ Waiting for server to start..."
sleep 5

# Check if server is running
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "❌ Server failed to start. Check logs:"
    cat /tmp/dev-server.log
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo "✅ Server is running!"
echo ""

# Run tests
echo "🧪 Running API tests..."
npm run test:api

# Capture test result
TEST_RESULT=$?

# Kill server
echo ""
echo "🛑 Stopping server..."
kill $SERVER_PID 2>/dev/null

# Return test result
exit $TEST_RESULT