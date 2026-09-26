#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js。请安装 Node.js 24 或更新版本，然后重试。" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 npm。请重新安装包含 npm 的 Node.js。" >&2
  exit 1
fi
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) { console.error("需要 Node.js 24 或更新版本；当前为 " + process.version); process.exit(1); }'
exec node scripts/bootstrap.mjs "$@"
