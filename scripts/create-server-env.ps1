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
Set-Default $envValues "ARTIFACT_ROOT" "storage/jobs"
Set-Default $envValues "APP_IMAGE_LOCAL" "content_automation_content_creator:local"
Set-Default $envValues "APP_IMAGE" "ghcr.io/haiduongnguyen/content-automation-generation-content_creator:latest"
Set-Default $envValues "POSTGRES_DATA_DIR" "/data/docker/content_creator/postgres_data"
Set-Default $envValues "APP_STORAGE_DIR" "/data/docker/content_creator/app_storage"
Set-Default $envValues "DB_CONTAINER_NAME" "db_content_creator"
Set-Default $envValues "MIGRATE_CONTAINER_NAME" "migrate_content_creator"
Set-Default $envValues "SCHEDULER_CONTAINER_NAME" "scheduler_content_creator"
Set-Default $envValues "WORKER_CONTAINER_NAME" "worker_content_creator"
Set-Default $envValues "ADMIN_HOST" "127.0.0.1"
Set-Default $envValues "ADMIN_PORT" "3000"
Set-Default $envValues "ADMIN_AUTH_ENABLED" "false"
Set-Default $envValues "ADMIN_TOKEN" ""
Set-Default $envValues "DAILY_PIPELINE_TIMES" "09:00,21:00"
Set-Default $envValues "SCHEDULER_POLL_SECONDS" "60"
Set-Default $envValues "WORKER_POLL_SECONDS" "30"
Set-Default $envValues "RETRY_FAILED_SECONDS" "3600"
Set-Default $envValues "GEMINI_MODEL" "gemini-2.5-flash"
Set-Default $envValues "GEMINI_IMAGE_MODEL" "gemini-3.1-flash-image"
Set-Default $envValues "TEXT_PROVIDER" "gemini_first"
Set-Default $envValues "TEXT_FALLBACK_PROVIDER" "openai"
Set-Default $envValues "OLLAMA_BASE_URL" "http://localhost:11434/v1"
Set-Default $envValues "IMAGE_PROVIDER" "gemini_first"
Set-Default $envValues "IMAGE_FALLBACK_PROVIDER" "openai"
Set-Default $envValues "TOPIC_MODE" "auto_approve_generated"
Set-Default $envValues "TOPIC_DUPLICATE_LOOKBACK_DAYS" "60"
Set-Default $envValues "OPENAI_DAILY_MAX_REQUESTS" "20"
Set-Default $envValues "OPENAI_DAILY_BUDGET_USD" "1.0"
Set-Default $envValues "OPENAI_EST_COST_PER_REQUEST_USD" "0.02"
Set-Default $envValues "IMAGE_GENERATION_ENABLED" "false"
Set-Default $envValues "IMAGE_FAILURE_MODE" "continue_text_only"
Set-Default $envValues "PUBLISH_ENABLED" "false"

$orderedKeys = @(
  "TZ",
  "ARTIFACT_ROOT",
  "APP_IMAGE_LOCAL",
  "APP_IMAGE",
  "POSTGRES_DATA_DIR",
  "APP_STORAGE_DIR",
  "DB_CONTAINER_NAME",
  "MIGRATE_CONTAINER_NAME",
  "SCHEDULER_CONTAINER_NAME",
  "WORKER_CONTAINER_NAME",
  "ADMIN_HOST",
  "ADMIN_PORT",
  "ADMIN_AUTH_ENABLED",
  "ADMIN_TOKEN",
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "DAILY_PIPELINE_TIMES",
  "SCHEDULER_POLL_SECONDS",
  "WORKER_POLL_SECONDS",
  "RETRY_FAILED_SECONDS",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "PROMPT_VERSION",
  "GEMINI_API",
  "GEMINI_MODEL",
  "GEMINI_IMAGE_MODEL",
  "GEMINI_PROJECT_NAME",
  "GEMINI_PROJECT_NUMBER",
  "TEXT_PROVIDER",
  "TEXT_FALLBACK_PROVIDER",
  "TEXT_OPENAI_COMPATIBLE_BASE_URL",
  "TEXT_OPENAI_COMPATIBLE_MODEL",
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "IMAGE_PROVIDER",
  "IMAGE_FALLBACK_PROVIDER",
  "TOPIC_MODE",
  "TOPIC_DUPLICATE_LOOKBACK_DAYS",
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
