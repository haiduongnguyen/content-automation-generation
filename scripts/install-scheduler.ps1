$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$dailyPipelineScript = Join-Path $PSScriptRoot "run-daily-19h.ps1"

$dailyTaskName = "ContentAutomation-Daily21h"
$reportTaskName = "ContentAutomation-Report22h"
$oldGenerateTaskName = "ContentAutomation-GenerateDaily"
$oldPublishTaskName = "ContentAutomation-PublishEvery15Min"

$dailyCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$dailyPipelineScript`""

New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot "logs") | Out-Null

schtasks /Create /F /SC DAILY /ST 21:00 /TN $dailyTaskName /TR $dailyCmd | Out-Null

cmd /c "schtasks /Delete /TN $reportTaskName /F >nul 2>nul" | Out-Null
cmd /c "schtasks /Delete /TN $oldGenerateTaskName /F >nul 2>nul" | Out-Null
cmd /c "schtasks /Delete /TN $oldPublishTaskName /F >nul 2>nul" | Out-Null

Write-Output "Installed tasks:"
schtasks /Query /TN $dailyTaskName /FO LIST
