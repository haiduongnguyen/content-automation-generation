$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$dailyPipelineScript = Join-Path $PSScriptRoot "run-daily-19h.ps1"
$reportScript = Join-Path $PSScriptRoot "run-report.ps1"

$dailyTaskName = "ContentAutomation-Daily19h"
$reportTaskName = "ContentAutomation-Report2030"
$oldGenerateTaskName = "ContentAutomation-GenerateDaily"
$oldPublishTaskName = "ContentAutomation-PublishEvery15Min"

$dailyCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$dailyPipelineScript`""
$reportCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$reportScript`""

New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot "logs") | Out-Null

schtasks /Create /F /SC DAILY /ST 19:00 /TN $dailyTaskName /TR $dailyCmd | Out-Null
schtasks /Create /F /SC DAILY /ST 20:30 /TN $reportTaskName /TR $reportCmd | Out-Null

cmd /c "schtasks /Delete /TN $oldGenerateTaskName /F >nul 2>nul" | Out-Null
cmd /c "schtasks /Delete /TN $oldPublishTaskName /F >nul 2>nul" | Out-Null

Write-Output "Installed tasks:"
schtasks /Query /TN $dailyTaskName /FO LIST
schtasks /Query /TN $reportTaskName /FO LIST
