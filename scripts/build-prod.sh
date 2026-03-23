#!/usr/bin/env bash
set -euo pipefail

echo "==> Building frontend (BASE_PATH=/)"
BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/palpite-stats build

echo "==> Building API server"
pnpm --filter @workspace/api-server build

echo "==> Build complete"
echo "    Frontend: artifacts/palpite-stats/dist/public/"
echo "    Server:   artifacts/api-server/dist/index.cjs"
echo ""
echo "Run in production with:"
echo "    PORT=3000 node artifacts/api-server/dist/index.cjs"
