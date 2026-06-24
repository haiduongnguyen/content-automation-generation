# Change Log / Implementation Plan

Last updated: 2026-06-16

## Decision: keep orchestration in app code

Current direction:

- Keep all business logic inside the Node.js/TypeScript app.
- Use a scheduler only as a time trigger.
- Prefer Docker Compose `scheduler` and `worker` services for server runtime.
- Keep Windows Task Scheduler only as a local fallback.

Target principle:

```text
scheduler = clock
app code = business logic, state, retry, logging
database = source of truth
```

## Why this change

The project has moved beyond a simple no-code or command-trigger flow:

- text generation has provider fallback logic
- image generation has billing/quota risk
- Facebook publishing needs durable failure logging
- missing-day recovery/backfill is needed
- job status should be inspectable and retryable

Keeping this logic in code makes the project easier to test, refactor, inspect, and operate.

## Target architecture

Short-term architecture:

```text
Windows Task Scheduler
        |
        v
npm run daily:pipeline
        |
        v
generate text
        |
        v
generate image if enabled
        |
        v
save post / image / status to PostgreSQL
        |
        v
publish approved or auto-approved post
        |
        v
write logs / report
```

Longer-term architecture inspired by MoneyPrinter:

```text
Windows Task Scheduler / cron / systemd
        |
        v
npm run enqueue:daily
        |
        v
pipeline_jobs
        |
        v
worker
  -> claim queued job
  -> write pipeline_job_events
  -> generate text
  -> generate image optional
  -> publish
  -> mark completed/failed
```

## Phase 0: documentation and review

Status: completed

Scope:

- Record this migration plan in docs.
- Let the project owner review before code changes.
- Do not change runtime behavior yet.

Acceptance criteria:

- This file exists.
- Plan is clear enough to approve, reject, or edit.

## Phase 1: stabilize current code before architecture changes

Status: implemented

Tasks:

- Fix `npm run build` by correcting `tsconfig.json` include/exclude behavior.
- Ensure build output does not pollute `tests/`.
- Keep current `npm test` passing.
- Review `.gitignore` so `dist/` and generated JS/d.ts files are ignored if they are not intended to be committed.

Reason:

Architecture refactor should start from a clean build baseline.

Acceptance criteria:

- `npm run build` passes.
- `npm test` passes.
- No new generated artifacts appear in source/test folders after build.

## Phase 2: make image generation safe

Status: completed

Tasks:

- Add env config:
  - `IMAGE_GENERATION_ENABLED`
  - `IMAGE_FAILURE_MODE`
- Supported image failure modes:
  - `fail_job`
  - `continue_text_only`
- Default recommendation:
  - `IMAGE_GENERATION_ENABLED=false` or `IMAGE_FAILURE_MODE=continue_text_only`
- If image generation fails:
  - save/log the error
  - keep the generated text post
  - continue publishing text-only when allowed

Reason:

OpenAI image billing/quota has previously blocked the pipeline. Text posting should remain reliable even if image generation fails.

Acceptance criteria:

- A failed image request no longer destroys the whole daily content flow when `continue_text_only` is enabled.
- Failure is visible in logs or DB event records.
- Existing image generation can still be enabled explicitly.

## Phase 3: create `daily:pipeline`

Status: completed

Tasks:

- Add a new script entrypoint:
  - `src/scripts/runDailyPipeline.ts`
- Add npm script:
  - `daily:pipeline`
- Pipeline should:
  - create/generate today's post
  - optionally generate image
  - auto-approve if configured
  - publish once
  - optionally run report email if configured
- Reuse existing services instead of duplicating logic.

Reason:

This creates a single command that Windows Task Scheduler can call directly.

Acceptance criteria:

- `npm run daily:pipeline` runs as a standalone app command.
- It produces clear console/log output.
- Existing `generate:once`, `publish:once`, and `report:email` still work.

## Phase 4: add Windows Task Scheduler local fallback

Status: completed

Tasks:

- Create or update a PowerShell scheduler installer for:
  - one daily content pipeline task
  - optional report task if report is not inside `daily:pipeline`
- Keep local scheduling simple for development and laptop runtime.

Reason:

For local laptop runtime, Windows Task Scheduler is enough.

Acceptance criteria:

- Scheduled task calls `npm run daily:pipeline`.
- Docker is not required for this local fallback path.
- Logs are written to a predictable file.

## Phase 4.1: add publish safe mode

Status: completed

Tasks:

- Add `PUBLISH_ENABLED`.
- When disabled, `publish:once` should read the ready post and target, then stop before any Facebook API call.
- Keep the post unposted so the owner can enable publishing later and run again.

Reason:

The owner needs a way to test `daily:pipeline` without accidentally posting to the Facebook Page.

Acceptance criteria:

- `PUBLISH_ENABLED=false` prevents Facebook feed/photo API calls.
- The ready post is not marked posted.
- The skip reason is visible in console/log output.

## Phase 5: introduce DB-backed pipeline jobs

Status: completed

Tasks:

- Add SQL migration for `pipeline_jobs`.
- Add SQL migration for `pipeline_job_events`.
- Add scripts:
  - `enqueueDailyJob.ts`
  - `workerOnce.ts`
  - `retryFailedJobs.ts`
- Add npm scripts:
  - `enqueue:daily`
  - `worker:once`
  - `retry:failed`
- Worker should claim a queued job with locking semantics.

Reason:

This is the MoneyPrinter-style reliability upgrade: durable queue, restart-safe processing, inspectable status, and retry.

Acceptance criteria:

- Daily job creation is idempotent by `job_type` + `run_date`.
- Worker can resume after app/process restart.
- Job events show each major pipeline step.
- Failed jobs can be retried intentionally.

Current implementation notes:

- `pipeline_jobs` and `pipeline_job_events` tables exist.
- `enqueue:daily` creates idempotent daily jobs.
- `worker:once` claims one queued job and writes worker plus step-level events.
- Step-level events currently include examples such as:
  - `generate_completed`
  - `generate_skipped`
  - `publish_completed`
  - `publish_skipped`
  - `report_completed`
  - `report_skipped`
- `retry:failed` requeues failed jobs that still have attempts remaining.
- Backfill commands are still future work.

## Phase 6: add provider abstraction

Status: planned

Tasks:

- Introduce content provider interface.
- Move Gemini/OpenAI calls behind provider implementations.
- Add room for Ollama later.
- Introduce image provider interface.
- Add providers:
  - OpenAI image
  - disabled image
  - ComfyUI later

Potential env design:

```env
TEXT_PROVIDER=gemini_first
TEXT_FALLBACK_PROVIDER=openai
IMAGE_PROVIDER=disabled
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
```

Reason:

Provider abstraction reduces API lock-in, lowers cost over time, and makes local model experiments easier.

Acceptance criteria:

- Business pipeline does not call OpenAI/Gemini directly.
- Provider choice is controlled by env.
- Existing behavior remains available.

## Phase 6.1: Docker server runtime

Status: completed

Tasks:

- Add Dockerfile.
- Add docker-compose services:
  - `db`
  - `migrate`
  - `scheduler`
  - `worker`
- Add `.env.server.example`.
- Add `scripts/create-server-env.ps1` to create `.env.server` from the existing local `.env`.
- Add DB bootstrap migration for core tables.
- Add scheduler and worker loop scripts.
- Keep text generation as Gemini-first, with OpenAI fallback guarded by OpenAI quota checks.

Reason:

The project should run on a server through Docker without Windows Task Scheduler.

Acceptance criteria:

- Docker image builds from source. Pending verification when Docker Desktop/Linux engine is running.
- `migrate` can apply schema/migrations.
- `scheduler` can enqueue jobs from inside a container.
- `worker` can claim queued jobs continuously.

## Phase 7: add operational dashboard or CLI review

Status: planned

Tasks:

- Add a small local review surface:
  - list jobs
  - view job events
  - view draft posts
  - approve/reject/edit
  - publish now
  - retry failed jobs

Implementation options:

- CLI first
- small local web UI later

Reason:

Manual SQL approval is usable but not ergonomic. A review surface makes the tool more practical and teaches full-stack workflow design.

Acceptance criteria:

- Owner can review a post without writing SQL manually.
- Failed jobs are visible.
- Retry is explicit and controlled.

## Immediate recommended next step

Start with Phase 1 and Phase 2:

1. Fix build baseline.
2. Make image generation non-fatal.
3. Add `daily:pipeline`.

This gives the biggest practical improvement with the least architectural risk.

## Open questions before implementation

1. Should `daily:pipeline` publish immediately after generation, or wait a configurable delay?
2. Should report email run inside `daily:pipeline`, or remain a separate scheduled task?
3. Should image generation default to disabled to control cost?
4. Should failed image generation still allow auto-publish text-only by default?
5. Should queue/worker be implemented immediately, or after the simple `daily:pipeline` version proves stable?
