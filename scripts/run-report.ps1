$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$npmCmd = "C:\nvm4w\nodejs\npm.cmd"

$logDir = Join-Path $projectRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "report.log"

"[$(Get-Date -Format s)] START report:email" | Out-File -FilePath $logFile -Append -Encoding utf8
& $npmCmd run report:email *>> $logFile
"[$(Get-Date -Format s)] END report:email" | Out-File -FilePath $logFile -Append -Encoding utf8

