#!/bin/bash

set -e  # Exit on error

echo "🔧 Starting OAuth + HTTP-Stream merge process..."
echo ""

cd /home/user/Documents/mcp-framework

# Step 1: Commit OAuth changes
echo "📝 Step 1: Committing OAuth implementation..."
git add -A
git commit -m "feat: Add OAuth 2.1 support with PKCE, RFC 9728, RFC 8707 compliance" || echo "Nothing to commit or already committed"
echo ""

# Step 2: Pull remote changes
echo "🔄 Step 2: Pulling remote changes with http-stream..."
git pull origin main --no-edit

echo ""
echo "✅ Merge complete! Now building..."
echo ""

# Step 3: Build
npm run build

echo ""
echo "🎉 Done! Both OAuth and http-stream are now available."
echo ""
echo "Available transport types:"
echo '  - "stdio"'
echo '  - "sse"'
echo '  - "http-stream" (from remote)'

