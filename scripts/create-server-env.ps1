param(
  [string]$SourcePath = ".env",
  [string]$DestinationPath = ".env.server"
)

$ErrorActionPreference = "Stop"

function Read-DotEnv([string]$Path) {
  $values = [ordered]@{}
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Source env file not found: $Path"
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "" -or $trimmed.StartsWith("#")) {
      continue
    }

    $idx = $trimmed.IndexOf("=")
    if ($idx -le 0) {
      continue
    }

    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim()
    $values[$key] = $value
  }

  return $values
}

function Set-Default([hashtable]$Values, [string]$Key, [string]$Value) {
  if (-not $Values.Contains($Key) -or [string]::IsNullOrWhiteSpace($Values[$Key])) {
    $Values[$Key] = $Value
  }
}

$envValues = Read-DotEnv $SourcePath

$envValues["PGHOST"] = "db"
Set-Default $envValues "PGPORT" "5432"
Set-Default $envValues "PGDATABASE" "content_automation"
Set-Default $envValues "TZ" "Asia/Ho_Chi_Minh"
Set-Default $envValues "DAILY_PIPELINE_TIME" "21:00"
Set-Default $envValues "SCHEDULER_POLL_SECONDS" "60"
Set-Default $envValues "WORKER_POLL_SECONDS" "30"
Set-Default $envValues "RETRY_FAILED_SECONDS" "3600"
Set-Default $envValues "GEMINI_MODEL" "gemini-2.5-flash"
Set-Default $envValues "OPENAI_DAILY_MAX_REQUESTS" "20"
Set-Default $envValues "OPENAI_DAILY_BUDGET_USD" "1.0"
Set-Default $envValues "OPENAI_EST_COST_PER_REQUEST_USD" "0.02"
Set-Default $envValues "IMAGE_GENERATION_ENABLED" "false"
Set-Default $envValues "IMAGE_FAILURE_MODE" "continue_text_only"
Set-Default $envValues "PUBLISH_ENABLED" "false"

$orderedKeys = @(
  "TZ",
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "DAILY_PIPELINE_TIME",
  "SCHEDULER_POLL_SECONDS",
  "WORKER_POLL_SECONDS",
  "RETRY_FAILED_SECONDS",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "PROMPT_VERSION",
  "GEMINI_API",
  "GEMINI_MODEL",
  "GEMINI_PROJECT_NAME",
  "GEMINI_PROJECT_NUMBER",
  "OPENAI_DAILY_MAX_REQUESTS",
  "OPENAI_DAILY_BUDGET_USD",
  "OPENAI_EST_COST_PER_REQUEST_USD",
  "MAX_RETRY_ATTEMPTS",
  "AUTO_APPROVE",
  "IMAGE_GENERATION_ENABLED",
  "IMAGE_FAILURE_MODE",
  "PUBLISH_ENABLED",
  "PLAN_START_DATE",
  "FB_PAGE_ID",
  "FB_PAGE_NAME",
  "FB_PAGE_ACCESS_TOKEN",
  "FB_GRAPH_VERSION",
  "FB_APP_ID",
  "FB_APP_SECRET",
  "REPORT_EMAIL_ENABLED",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "REPORT_EMAIL_FROM",
  "REPORT_EMAIL_TO"
)

$lines = New-Object System.Collections.Generic.List[string]
foreach ($key in $orderedKeys) {
  if ($envValues.Contains($key)) {
    $lines.Add("$key=$($envValues[$key])")
  }
}

foreach ($key in $envValues.Keys) {
  if ($orderedKeys -notcontains $key) {
    $lines.Add("$key=$($envValues[$key])")
  }
}

Set-Content -LiteralPath $DestinationPath -Value $lines -Encoding utf8
Write-Host "Created $DestinationPath from $SourcePath. Secrets were copied but not printed."
