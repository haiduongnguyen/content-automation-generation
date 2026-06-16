Param(
  [string]$ProjectRoot = "C:\Users\ADMIN\Desktop\content-automation-mvp"
)

$ErrorActionPreference = "Stop"

$requiredFiles = @(
  ".env.example",
  "docs\API_PAYLOAD_SAMPLES.md",
  "docs\README_SQL.md",
  "sql\001_create_daily_job.sql",
  "sql\012_get_retry_candidates.sql"
)

$missing = @()
foreach ($f in $requiredFiles) {
  $p = Join-Path $ProjectRoot $f
  if (-not (Test-Path $p)) { $missing += $f }
}

if ($missing.Count -gt 0) {
  Write-Host "Missing files:" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
  exit 1
}

Write-Host "MVP1 file check passed." -ForegroundColor Green
exit 0
