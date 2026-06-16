$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$npmCmd = (Get-Command npm.cmd -ErrorAction Stop).Source

$logDir = Join-Path $projectRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "daily-pipeline.log"

"[$(Get-Date -Format s)] START daily:pipeline" | Out-File -FilePath $logFile -Append -Encoding utf8
& $npmCmd run daily:pipeline *>> $logFile
"[$(Get-Date -Format s)] END daily pipeline" | Out-File -FilePath $logFile -Append -Encoding utf8
