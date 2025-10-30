#!/bin/bash

set -e

echo "🔧 Completing the OAuth + HTTP-Stream merge..."
echo ""

cd /home/user/Documents/mcp-framework

# Add resolved files
echo "📝 Adding resolved files..."
git add .gitignore
git add src/transports/sse/server.ts  
git add package-lock.json

# Check status
echo ""
echo "📊 Current status:"
git status

# Commit the merge
echo ""
echo "✅ Committing merge..."
git commit -m "Merge OAuth 2.1 implementation with http-stream transport

- Resolved conflicts in .gitignore, package-lock.json, and sse/server.ts
- Kept OAuth provider and methods (handleProtectedResourceMetadata, handleOAuthCallback)
- Integrated PING_SSE_MESSAGE from remote
- Merged both OAuth and http-stream features"

echo ""
echo "🏗️  Building project..."
npm run build

echo ""
echo "🎉 Merge complete! Both OAuth and http-stream are now available."
echo ""
echo "Next steps:"
echo "1. Test with: npm start"
echo "2. Check available transports in src/core/MCPServer.ts"
echo "3. Update visa-proto to use http-stream if needed"

