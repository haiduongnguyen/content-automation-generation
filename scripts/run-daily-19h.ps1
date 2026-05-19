$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$npmCmd = "C:\nvm4w\nodejs\npm.cmd"

$logDir = Join-Path $projectRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "daily-19h.log"

"[$(Get-Date -Format s)] START daily pipeline (generate + publish)" | Out-File -FilePath $logFile -Append -Encoding utf8
& $npmCmd run generate:once *>> $logFile
& $npmCmd run publish:once *>> $logFile
"[$(Get-Date -Format s)] END daily pipeline" | Out-File -FilePath $logFile -Append -Encoding utf8

