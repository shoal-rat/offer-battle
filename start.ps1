$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Error "需要 Node.js 24 或更新版本。"; exit 1 }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Write-Error "未找到 npm，请重新安装 Node.js。"; exit 1 }
& node -e 'if (Number(process.versions.node.split(".")[0]) < 24) { console.error("需要 Node.js 24 或更新版本；当前为 " + process.version); process.exit(1); }'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& node scripts/bootstrap.mjs @args
exit $LASTEXITCODE
