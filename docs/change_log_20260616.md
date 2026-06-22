# Change Log 2026-06-16

## Context

After reviewing MoneyPrinterTurbo, the useful direction for this project is not to copy its video-specific code, but to adopt several product and architecture patterns:

- step-based long-running pipeline
- provider abstraction
- operational task visibility
- task artifacts for debugging
- strict input/config validation
- safer deployment packaging
- review/dashboard workflow

Current project direction remains:

```text
scheduler = clock
PostgreSQL = source of truth
Node.js/TypeScript = business logic
Docker scheduler/worker = server runtime
```

## Overall Plan

### 1. Pipeline Step Abstraction

Refactor the daily content flow into explicit pipeline steps.

Implementation status:

- implemented as a compatibility refactor
- direct daily pipeline and worker execution now use the same step runner
- `generate_text` still calls the existing `runGenerateOnce` flow
- `plan_topic` and `generate_image` are currently logical step/event boundaries derived around the existing generate flow
- deeper physical separation of topic planning, text generation, and image generation should happen after provider registry work

Goal:

- make the daily pipeline easier to inspect, test, retry, and partially rerun
- keep current behavior working while moving orchestration out of ad hoc scripts
- make worker execution and direct local execution use the same step runner

Planned shape:

```text
plan_topic
generate_text
generate_image
approve_or_wait
publish
report
```

Proposed TypeScript shape:

```ts
type PipelineStepName =
  | "plan_topic"
  | "generate_text"
  | "generate_image"
  | "approve_or_wait"
  | "publish"
  | "report";

type PipelineStepStatus = "completed" | "skipped" | "failed";

type PipelineStepResult = {
  step: PipelineStepName;
  status: PipelineStepStatus;
  message?: string;
  payload?: Record<string, unknown>;
};

type PipelineContext = {
  jobId?: number;
  runDate: string;
  source: "daily_pipeline" | "worker" | "manual";
  dryRun?: boolean;
};

type PipelineStep = {
  name: PipelineStepName;
  run(context: PipelineContext): Promise<PipelineStepResult>;
};
```

Important design rule:

- each step should own one job-sized responsibility
- each step returns structured metadata instead of relying only on console logs
- failure should stop later dependent steps unless the step explicitly supports non-fatal failure
- image generation remains non-fatal when `IMAGE_FAILURE_MODE=continue_text_only`

Expected file-level changes:

- `src/services/dailyPipeline.ts`
  - introduce `PipelineContext`, `PipelineStep`, and `PipelineStepResult`
  - add `runPipelineSteps(context, steps)` as the shared runner
  - move event-type naming into one helper
- `src/scripts/runDailyPipeline.ts`
  - become a thin wrapper around the shared runner
  - pass source as `daily_pipeline`
- `src/scripts/workerOnce.ts`
  - call the same shared runner instead of manually sequencing generate/publish/report behavior
  - pass `jobId`, `runDate`, and source as `worker`
- `src/scripts/generateOnce.ts`
  - keep existing script behavior for now
  - expose reusable service-level functions only if needed by pipeline steps
- `src/scripts/publishOnce.ts`
  - keep existing script behavior for now
  - expose reusable service-level functions only if needed by pipeline steps
- `src/scripts/dailyReportEmail.ts`
  - keep existing script behavior for now
  - expose reusable report function if the step needs cleaner reuse
- `src/services/pipelineJobs.ts`
  - reuse existing `insertPipelineJobEvent`
  - avoid schema changes unless current event payload cannot represent step results
- `tests/daily-pipeline.test.ts`
  - add tests for step ordering, skip behavior, failure behavior, and event payload shape
- `tests/pipeline-jobs.test.ts`
  - add/adjust tests only if event helper behavior changes

Implementation sequence:

1. Add shared pipeline types and step runner in `src/services/dailyPipeline.ts`.
2. Wrap current generate/publish/report calls into step functions with minimal behavior change.
3. Add event recording around each step when `context.jobId` is present.
4. Update `runDailyPipeline.ts` to call the new runner.
5. Update `workerOnce.ts` to call the same runner.
6. Keep old single-purpose commands working:
   - `npm run generate:once`
   - `npm run publish:once`
   - `npm run report:email`
7. Add tests for:
   - default step list
   - report step included only when report email is enabled
   - failed step stops later dependent steps
   - skipped step records a `*_skipped` result
   - worker context writes job events

Event naming plan:

```text
plan_topic_completed
generate_text_completed
generate_image_completed
generate_image_skipped
approve_or_wait_completed
approve_or_wait_skipped
publish_completed
publish_skipped
report_completed
report_skipped
```

Failure event naming:

```text
{step_name}_failed
```

Non-goals for this phase:

- do not introduce provider registry yet
- do not create dashboard yet
- do not add artifact storage yet
- do not change database schema unless strictly required
- do not rewrite content generation prompts in this phase

Acceptance criteria:

- `npm run daily:pipeline` still works
- `npm run enqueue:daily && npm run worker:once` still works
- worker path and direct daily pipeline path use the same step runner
- `pipeline_job_events` contains one structured event per completed/skipped/failed step when run by worker
- existing tests pass
- new pipeline step tests cover ordering, skip, failure, and event naming

### 2. Provider Registry

Refactor text/image generation provider logic behind clear interfaces.

Implementation status:

- implemented as a compatibility refactor
- text provider registry now resolves `gemini_first`, `gemini`, `openai`, `openai_compatible`, and `ollama`
- image provider registry now resolves `openai` and `disabled`
- current Gemini-first/OpenAI-fallback behavior is preserved as the default
- OpenAI text quota guard remains active through the OpenAI text provider
- `contentGenerator` still owns prompt construction and generated content parsing/validation
- `postImageGenerator` still owns image prompt construction, role selection, and image failure policy
- OpenAI-compatible/Ollama support is structurally present, but should be operationally tested before production use

Goal:

- separate provider-specific API code from content/business logic
- keep current Gemini-first/OpenAI-fallback behavior working
- make future providers easier to add, especially Ollama or other OpenAI-compatible gateways
- make provider failures easier to log, test, and classify
- prepare for lower-cost/local generation experiments without disturbing the pipeline

Current problem:

- `src/services/contentGenerator.ts` currently owns prompt construction, provider selection, provider calls, fallback logic, parsing, and validation
- `src/services/postImageGenerator.ts` currently owns image prompt construction, OpenAI image API calls, failure policy behavior, and response normalization
- provider details are coupled to generation services, so adding a provider risks touching production-critical content logic
- provider failure metadata is not standardized across text and image generation

Target design:

Planned shape:

```text
TextProvider
  - gemini
  - openai
  - openai_compatible later
  - ollama later

ImageProvider
  - openai
  - disabled
  - local/provider-specific later
```

Proposed TypeScript shape:

```ts
type ProviderKind = "text" | "image";

type ProviderResult<T> = {
  provider: string;
  model: string;
  output: T;
  raw?: unknown;
  metadata?: Record<string, unknown>;
};

type ProviderError = {
  provider: string;
  model?: string;
  retryable: boolean;
  code?: string;
  message: string;
  raw?: unknown;
};

type TextProviderRequest = {
  topicName: string;
  prompt: string;
  responseFormat: "json";
};

type TextProvider = {
  name: string;
  model: string;
  generate(request: TextProviderRequest): Promise<ProviderResult<string>>;
};

type ImageProviderRequest = {
  topicName: string;
  postContent: string;
  prompt: string;
  seedDate: string;
  role: string;
};

type ImageProvider = {
  name: string;
  model: string;
  generate(request: ImageProviderRequest): Promise<ProviderResult<GeneratedImage[]>>;
};
```

Provider selection config:

```env
TEXT_PROVIDER=gemini_first
TEXT_FALLBACK_PROVIDER=openai
TEXT_OPENAI_COMPATIBLE_BASE_URL=
TEXT_OPENAI_COMPATIBLE_MODEL=

IMAGE_PROVIDER=openai
IMAGE_GENERATION_ENABLED=false
IMAGE_FAILURE_MODE=continue_text_only

OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1:8b
```

Expected file-level changes:

- `src/config/env.ts`
  - add provider config fields with backward-compatible defaults
  - preserve current `GEMINI_API`, `OPENAI_API_KEY`, `OPENAI_MODEL`
  - add optional OpenAI-compatible/Ollama config without making it required
- `src/services/providers/types.ts`
  - define shared provider request/result/error types
- `src/services/providers/text/openAiTextProvider.ts`
  - move OpenAI text API call here
  - normalize OpenAI response into provider result
- `src/services/providers/text/geminiTextProvider.ts`
  - move Gemini API call here
  - normalize Gemini response into provider result
- `src/services/providers/text/geminiFirstTextProvider.ts`
  - compose Gemini primary + OpenAI fallback
  - preserve existing fallback behavior and `fallbackUsed`
- `src/services/providers/text/openAiCompatibleTextProvider.ts`
  - planned but optional in first implementation
  - should support Ollama/OpenRouter/other compatible APIs later
- `src/services/providers/image/openAiImageProvider.ts`
  - move OpenAI image API call here
  - normalize image response into `GeneratedImage[]`
- `src/services/providers/image/disabledImageProvider.ts`
  - return empty image list with a clear skipped metadata payload
- `src/services/providers/registry.ts`
  - resolve configured text and image providers
  - centralize provider selection and validation
- `src/services/contentGenerator.ts`
  - keep prompt construction and generated content parsing/validation here
  - call text provider registry instead of direct Gemini/OpenAI functions
- `src/services/postImageGenerator.ts`
  - keep image prompt construction and image failure policy here
  - call image provider registry instead of direct OpenAI image function
- `tests/content-generator.test.ts`
  - update tests to use injectable/mock text provider where useful
  - keep tests for Gemini-first/OpenAI-fallback behavior
- `tests/post-image-generator.test.ts`
  - update tests for disabled image provider and OpenAI image normalization
- new tests:
  - `tests/provider-registry.test.ts`
  - `tests/text-providers.test.ts`
  - `tests/image-providers.test.ts`

Implementation sequence:

1. Add provider type definitions without changing behavior.
2. Extract OpenAI text API call into `openAiTextProvider`.
3. Extract Gemini text API call into `geminiTextProvider`.
4. Add `geminiFirstTextProvider` that preserves current primary/fallback behavior.
5. Update `contentGenerator.ts` to call the text provider abstraction.
6. Extract OpenAI image API call into `openAiImageProvider`.
7. Add `disabledImageProvider`.
8. Update `postImageGenerator.ts` to call the image provider abstraction.
9. Add provider config fields with defaults matching current behavior.
10. Add tests around registry selection, fallback, disabled image behavior, and provider error normalization.

Fallback behavior:

```text
TEXT_PROVIDER=gemini_first
  -> use Gemini when GEMINI_API exists
  -> fallback to OpenAI when Gemini fails or returns invalid JSON
  -> use OpenAI directly when GEMINI_API is missing
```

Image behavior:

```text
IMAGE_GENERATION_ENABLED=false
  -> use disabled image provider
  -> return []
  -> generate_image step records skipped

IMAGE_GENERATION_ENABLED=true
  -> use configured image provider
  -> if provider fails:
       fail job when IMAGE_FAILURE_MODE=fail_job
       continue text-only when IMAGE_FAILURE_MODE=continue_text_only
```

Provider error normalization:

- missing API key should be classified as non-retryable
- invalid response shape should be non-retryable for that specific response, but useful for fallback
- network timeout should be retryable
- rate limit/quota should be retryable only if another key/provider can be tried later
- billing hard limit should be non-retryable until configuration/billing changes

Expected changes:

- avoid provider-specific code leaking into pipeline scripts
- keep Gemini-first/OpenAI-fallback behavior available
- make provider choice explicit through config/env
- normalize provider responses in one place
- add provider-level error metadata for debugging and retry decisions

Non-goals for this phase:

- do not add dashboard
- do not add artifact storage yet
- do not change Facebook publishing provider
- do not rewrite prompt style
- do not require Ollama to be installed
- do not add a DB credential store yet
- do not change public generated post schema unless required

Acceptance criteria:

- existing `npm run generate:once` behavior remains compatible
- Gemini-first/OpenAI-fallback still works
- OpenAI-only generation still works when Gemini is not configured
- image disabled mode returns no images without calling an external image API
- image failure mode still controls fail vs continue-text-only behavior
- provider registry tests cover default provider selection
- content/image generator tests pass with mocked provider behavior
- `npm run build` passes
- `npm test` passes

### 3. Operational CLI

Add CLI commands to inspect and operate the queue without manual SQL.

Implementation status:

- implemented first CLI pass
- added job list/show/retry commands
- added post review/approve commands
- added date-range backfill enqueue command
- backfill only enqueues `daily_content` jobs and still relies on worker execution
- CLI output is human-readable by default
- JSON output flag and reject command are still later enhancements

Goal:

- make daily operations possible from terminal without touching SQL directly
- provide a practical review/retry/backfill workflow before building a dashboard
- expose enough job/post state to debug failed automation quickly
- keep all commands using the same service layer as scheduler/worker

Current problem:

- `pipeline_jobs` and `pipeline_job_events` already exist, but inspection is mostly manual SQL
- approving posts still requires direct DB updates
- retry exists only as a broad failed-job requeue command
- missing-day recovery/backfill is still not ergonomic
- operational status is spread across console logs, DB tables, and optional emails

Planned commands:

```bash
npm run jobs:list
npm run jobs:show -- --id <job_id>
npm run jobs:retry -- --id <job_id>
npm run posts:review
npm run posts:approve -- --id <post_id>
npm run posts:reject -- --id <post_id> --reason "..."
npm run backfill -- --from YYYY-MM-DD --to YYYY-MM-DD
```

Command behavior:

```text
jobs:list
  -> show recent pipeline jobs, newest first
  -> filter by status/job_type/date later

jobs:show
  -> show one job row
  -> show ordered job events
  -> show related content job/post if available

jobs:retry
  -> requeue one failed job if attempts remain
  -> write a retry event
  -> refuse retry if job is not failed or attempts are exhausted

posts:review
  -> list draft/pending posts
  -> include title, topic/date, approval_status, image count

posts:approve
  -> set approval_status='approved'
  -> write a simple audit event if available

posts:reject
  -> set approval_status='rejected' only if schema supports it
  -> otherwise defer to future schema change

backfill
  -> enqueue daily_content jobs for a date range
  -> do not directly generate/publish inside the command
  -> rely on worker to process queued jobs
```

Expected file-level changes:

- `src/services/operations/jobs.ts`
  - query recent jobs
  - query one job with events
  - retry one failed job
  - format job status data for CLI
- `src/services/operations/posts.ts`
  - list reviewable posts
  - approve post
  - optionally reject post if schema supports it
- `src/services/operations/backfill.ts`
  - validate date ranges
  - enqueue idempotent `daily_content` jobs for each date
  - return summary of created/existing jobs
- `src/scripts/jobsList.ts`
  - CLI entrypoint for `jobs:list`
- `src/scripts/jobsShow.ts`
  - CLI entrypoint for `jobs:show`
- `src/scripts/jobsRetry.ts`
  - CLI entrypoint for `jobs:retry`
- `src/scripts/postsReview.ts`
  - CLI entrypoint for `posts:review`
- `src/scripts/postsApprove.ts`
  - CLI entrypoint for `posts:approve`
- `src/scripts/backfillJobs.ts`
  - CLI entrypoint for `backfill`
- `package.json`
  - add npm scripts for the new CLI commands
- `sql/`
  - add query files only if the service cannot reuse simple inline SQL cleanly
- `tests/`
  - add focused tests for date range parsing, retry eligibility, and formatting helpers

Implementation sequence:

1. Add small argument parsing helpers using built-in `process.argv`.
2. Implement job listing/showing services.
3. Add `jobs:list` and `jobs:show`.
4. Implement single-job retry service using existing `requeuePipelineJob`.
5. Add `jobs:retry`.
6. Implement `posts:review` and `posts:approve`.
7. Implement backfill date range validation and enqueue loop.
8. Add tests for pure helpers and retry/backfill rules.
9. Update README with operational examples.

Output style:

```text
human-readable table by default
JSON output later with --json
exit code 0 for successful no-op
exit code 1 for invalid command/input
```

Expected changes:

- list recent jobs and statuses
- show job events and errors
- retry failed jobs intentionally
- review pending posts without opening SQL manually
- backfill missing dates in a controlled way

Non-goals for this phase:

- do not build web UI yet
- do not add authentication
- do not add complex terminal UI
- do not mutate provider config
- do not auto-publish rejected/draft posts
- do not bypass worker for backfill execution

Acceptance criteria:

- `npm run jobs:list` shows recent jobs
- `npm run jobs:show -- --id <job_id>` shows events for a job
- `npm run jobs:retry -- --id <job_id>` requeues one eligible failed job
- `npm run posts:review` lists draft/reviewable posts
- `npm run posts:approve -- --id <post_id>` approves one post
- `npm run backfill -- --from YYYY-MM-DD --to YYYY-MM-DD` enqueues idempotent jobs
- invalid arguments fail clearly
- `npm run build` passes
- `npm test` passes

### 4. Job Artifact Storage

Add a lightweight artifact layer for debugging generated content.

Implementation status:

- implemented first artifact pass
- added path-safe artifact helper with JSON/text/binary writers
- added recursive secret redaction for artifact JSON
- pipeline jobs with `jobId` now create `manifest.json`
- each pipeline step now writes a best-effort `steps/{step_name}.json`
- `storage/` is ignored by Git and Docker build context
- deeper prompt/image/publish artifacts remain planned for a later pass

Goal:

- make provider prompts, normalized outputs, and publish payloads easy to inspect
- keep PostgreSQL as source of truth while adding human-readable debug files
- prepare for rerun comparison and future dashboard/download links
- avoid losing important provider context when a job fails

Current problem:

- DB stores final post/image data, but not every intermediate prompt/response in a readable form
- console logs are not durable enough for debugging production failures
- provider output/failure can be hard to reconstruct after a job completes
- generated images are stored in DB base64, which is not pleasant for manual inspection

Planned shape:

```text
storage/jobs/{job_id}/
  prompt.json
  generated-post.json
  image-prompt.txt
  publish-payload.json
  report.json
```

Expanded shape:

```text
storage/jobs/{job_id}/
  manifest.json
  plan-topic.json
  text/
    prompt.txt
    provider-result.json
    normalized-post.json
  image/
    prompt.txt
    provider-result.json
    image-1.png
  publish/
    message.txt
    payload.json
    response.json
  report/
    report.json
```

Artifact rules:

- artifacts are debug copies, not the source of truth
- artifacts must not contain API keys, SMTP credentials, access tokens, or raw env dumps
- artifact writes should be best-effort and should not break publishing unless explicitly configured later
- each artifact should include `jobId`, `runDate`, `step`, and timestamp when practical

Expected file-level changes:

- `src/services/artifacts.ts`
  - resolve artifact paths under `storage/jobs`
  - create job directories
  - write JSON/text/binary files safely
  - redact known sensitive keys
- `src/services/dailyPipeline.ts`
  - pass artifact context to steps
  - optionally write step-level result artifacts
- `src/services/contentGenerator.ts`
  - write prompt and normalized post artifact through injected/artifact helper
  - avoid provider secret leakage
- `src/services/postImageGenerator.ts`
  - write image prompt and generated image files when enabled
- `src/services/facebookPublish.ts` or `src/scripts/publishOnce.ts`
  - write publish message/payload/response artifacts
- `.gitignore`
  - add `storage/`
- `.dockerignore`
  - ensure local generated storage is not sent to image build context
- tests:
  - `tests/artifacts.test.ts`

Implementation sequence:

1. Add `storage/` to `.gitignore` and `.dockerignore`.
2. Implement artifact path resolution with directory traversal protection.
3. Implement `writeJsonArtifact`, `writeTextArtifact`, and `writeBinaryArtifact`.
4. Add redaction helper for common secret key names.
5. Add artifact context to pipeline context.
6. Write basic manifest per job.
7. Add text generation artifacts.
8. Add image artifacts.
9. Add publish artifacts.
10. Add tests for path safety, redaction, and file writing.

Expected changes:

- persist prompts and normalized provider responses
- keep DB as source of truth, but use files for readable debug artifacts
- make reruns easier to compare
- avoid storing secrets in artifacts
- add `.gitignore` coverage for generated storage files

Non-goals for this phase:

- do not move DB data into files
- do not expose artifacts over HTTP yet
- do not build a file browser
- do not store `.env` or full provider raw headers
- do not require artifacts for successful pipeline completion

Acceptance criteria:

- each worker job creates `storage/jobs/{job_id}/manifest.json`
- text generation writes prompt and normalized output artifacts
- image generation writes prompt and generated image files when images exist
- publish step writes message/payload/response artifacts when applicable
- sensitive fields are redacted in JSON artifacts
- artifact write failures are logged but do not break the job by default
- `npm run build` passes
- `npm test` passes

### 5. Validation And Guardrails

Tighten validation around generated content, config, and runtime parameters.

Implementation status:

- implemented first validation pass
- generated content validation now lives in a shared helper
- generated content now enforces title/body/cta/hashtag bounds before DB insert
- publish message guard now rejects empty or oversized Facebook messages before API calls
- date range validation exists for backfill CLI
- provider/config enum validation exists in env parsing for provider fields
- deeper config cross-field validation remains planned

Goal:

- prevent malformed provider output from entering production tables
- control cost by limiting prompt/input sizes
- make unsafe or invalid runtime config fail early
- reduce accidental Facebook publishing mistakes
- prepare for dashboard/API inputs later

Current problem:

- generated content is parsed and validated, but constraints can be stricter and more explicit
- env validation exists, but provider-specific config will become more complex
- CLI/backfill inputs need date/range validation
- image prompt and publish message size limits should be explicit
- Facebook publish safety depends on correct env and approval state

Validation targets:

```text
generated post
  - title required
  - body required
  - cta optional but bounded
  - hashtags array length bounded
  - no empty hashtag strings

topic plan
  - unique day_no
  - bounded topic/key_notes length
  - date validity

config
  - schedule HH:mm
  - retry seconds positive
  - provider names from allowed enum
  - image failure mode enum
  - publish safe mode explicit

CLI
  - numeric ids
  - valid date ranges
  - bounded backfill range

publish
  - approval_status must be approved/auto_approved
  - publish target must be active
  - message length below Facebook practical limit
```

Expected file-level changes:

- `src/services/validation/generatedContent.ts`
  - validate generated post content shape and limits
- `src/services/validation/config.ts`
  - validate provider/scheduler/publish config rules that exceed basic env parsing
- `src/services/validation/dateRange.ts`
  - parse and validate date ranges for backfill/CLI
- `src/services/validation/publish.ts`
  - validate publish payload readiness
- `src/services/contentGenerator.ts`
  - replace inline validation with shared validation helper where useful
- `src/services/topicPlanGenerator.ts`
  - reuse topic plan validation helper if helpful
- `src/config/env.ts`
  - keep parsing, delegate cross-field rules to validation helpers where practical
- tests:
  - `tests/generated-content-validation.test.ts`
  - `tests/config-validation.test.ts`
  - `tests/date-range-validation.test.ts`

Implementation sequence:

1. Define constants for content limits.
2. Extract generated post validation helper.
3. Replace duplicated validation in content generator with helper.
4. Add config enum validation for provider fields introduced in phase 2.
5. Add date-range validation for CLI/backfill.
6. Add publish payload readiness checks.
7. Add tests for valid/invalid content, config, and date ranges.
8. Update docs with operational failure messages.

Expected changes:

- validate post JSON shape more strictly
- enforce body/title/hashtag limits
- cap prompt lengths to control cost
- validate schedule time and retry config
- validate image prompt and image generation options
- add tests for invalid provider output and invalid config

Non-goals for this phase:

- do not add moderation/classification service
- do not block all subjective quality issues
- do not rewrite prompts
- do not introduce external validation libraries unless needed
- do not add dashboard validation UI yet

Acceptance criteria:

- invalid generated JSON fails before DB insert
- too-long prompt/input is rejected or clamped according to documented rule
- invalid provider/image/schedule config fails with clear error
- invalid backfill range fails before enqueueing jobs
- publish readiness checks prevent unsafe publish attempts
- validation tests cover representative bad inputs
- `npm run build` passes
- `npm test` passes

### 6. Dashboard / Review Surface

Add a small review surface after the CLI is stable.

Implementation status:

- implemented first local admin surface
- added built-in Node HTTP admin server without adding frontend dependencies
- admin UI lists jobs, shows job details/events, reviews draft posts, approves posts, and retries eligible failed jobs
- admin server binds to `ADMIN_HOST` / `ADMIN_PORT`, defaulting to `127.0.0.1:3000`
- UI clearly displays `PUBLISH_ENABLED`
- route tests are still minimal; service tests cover the underlying operations

Goal:

- make manual post review practical without SQL
- provide a simple operational view of jobs, events, errors, and pending approvals
- reuse CLI/service logic instead of duplicating business rules
- keep first version local/admin-only and intentionally small

Current problem:

- approving/reviewing content through SQL is friction-heavy
- daily job status is not easily visible at a glance
- failures are visible in DB/logs but not in a friendly workflow
- editing drafts before publish is not ergonomic

Possible first version:

```text
local web UI
  - jobs list
  - job event detail
  - pending post review
  - approve/reject/edit
  - retry failed job
```

Suggested implementation shape:

```text
Express/Fastify local admin app
  GET  /health
  GET  /jobs
  GET  /jobs/:id
  POST /jobs/:id/retry
  GET  /posts/review
  GET  /posts/:id
  POST /posts/:id/approve
  POST /posts/:id/update
```

Frontend shape:

```text
server-rendered HTML first
  - low complexity
  - no build pipeline required
  - enough for internal review

React/Vite later only if UI grows
```

Expected file-level changes:

- `src/server/adminApp.ts`
  - local admin HTTP server
  - route handlers call operation services
- `src/scripts/adminServer.ts`
  - npm entrypoint to start the admin server
- `src/services/operations/*`
  - reuse CLI operation services from phase 3
- `src/views/` or inline templates
  - lightweight HTML views if server-rendered approach is used
- `package.json`
  - add `admin:dev` / `admin:start` scripts
- `.env.example`
  - add admin port/bind config
- tests:
  - service tests first
  - route tests only if app framework makes them cheap

Security posture for first version:

- bind to `127.0.0.1` by default
- do not expose publicly without reverse proxy/auth
- no secrets rendered in UI
- destructive actions use POST
- require explicit confirmation for retry/publish-adjacent actions

Expected changes:

- reuse the same services as CLI/scripts
- avoid duplicating business logic in the UI
- make manual approval practical
- expose publish-safe-mode status clearly

Non-goals for this phase:

- do not build a marketing site
- do not expose public internet UI by default
- do not add multi-user roles yet
- do not add OAuth/login unless deployment requires it
- do not replace CLI
- do not add complex analytics dashboards yet

Acceptance criteria:

- local admin server starts with one npm command
- user can list jobs and inspect events
- user can review pending posts
- user can approve a post
- user can retry an eligible failed job
- UI clearly shows `PUBLISH_ENABLED` state
- server binds locally by default
- `npm run build` passes
- `npm test` passes

### 7. Docker Release And CI

Harden the server deployment path.

Implementation status:

- implemented first CI pass with GitHub Actions build/test workflow
- added deployment docs for current build-from-source Docker Compose path
- documented server startup, logs, common job operations, backup/restore, stop, and rollback basics
- made Compose `env_file` overrideable via `APP_ENV_FILE` so config validation can use safe example env files
- verified local build/test, safe Compose config rendering, and Docker image build
- kept GHCR image publishing and release compose as a later step after CI is proven stable

Goal:

- make server deployment repeatable
- catch build/test regressions before merge
- prepare for prebuilt Docker images later
- keep secrets out of build context and repository
- document production startup, logs, backup, and rollback basics

Current problem:

- Docker Compose exists and works as a local/server build path
- no CI workflow is currently documented for build/test
- no prebuilt image release path exists yet
- operational docs can be clearer for first server deployment
- database backup/restore procedure is not yet documented

Expected changes:

- keep `docker-compose.yml` for local/server build
- add a release compose file later if prebuilt image publishing is added
- add GitHub Actions for build/test
- optionally publish image to GHCR
- document production startup and log inspection
- keep `.env` and `.env.server` out of image/build context

Planned CI workflow:

```text
on pull_request / push
  - checkout
  - setup node
  - npm ci
  - npm run build
  - npm test
```

Planned Docker release workflow later:

```text
on tag or manual dispatch
  - build image
  - push ghcr.io/<owner>/<repo>:<tag>
  - push ghcr.io/<owner>/<repo>:latest
```

Expected file-level changes:

- `.github/workflows/ci.yml`
  - run build/test
- `.github/workflows/docker.yml`
  - optional later, build/push GHCR image
- `docker-compose.release.yml`
  - optional later, use prebuilt image instead of local build
- `README.md`
  - clarify local build vs release deployment
  - add log inspection and common operations
- `docs/DEPLOYMENT.md`
  - server setup
  - `.env.server` setup
  - Docker commands
  - backup/restore notes
  - rollback notes
- `.dockerignore`
  - keep secrets/generated files out of build context

Implementation sequence:

1. Add CI workflow for build/test.
2. Verify CI uses Node version compatible with Dockerfile.
3. Add deployment doc for current build-from-source compose path.
4. Add backup/restore notes for PostgreSQL volume/data.
5. Add release compose only when image publishing is introduced.
6. Add GHCR image workflow only after CI is green and repo secrets/permissions are confirmed.

Deployment commands to document:

```bash
docker compose --env-file .env.server up -d --build
docker compose --env-file .env.server logs -f scheduler worker
docker compose --env-file .env.server ps
docker compose --env-file .env.server down
```

Database backup commands to document:

```bash
docker compose --env-file .env.server exec db pg_dump -U "$PGUSER" "$PGDATABASE" > backup.sql
```

Non-goals for this phase:

- do not introduce Kubernetes
- do not require GHCR until CI is stable
- do not move secrets into GitHub Actions unless needed for integration tests
- do not run real Facebook/OpenAI calls in CI
- do not add production monitoring stack yet

Acceptance criteria:

- GitHub Actions CI runs build/test on PRs
- Docker build path remains working
- deployment docs explain first server startup
- docs explain logs, restart, backup, and rollback basics
- `.env` and `.env.server` remain ignored
- no real API secrets are required for CI
- `npm run build` passes locally
- `npm test` passes locally

## Priority

Recommended implementation order:

1. Pipeline step abstraction
2. Operational CLI
3. Provider registry
4. Job artifact storage
5. Validation and guardrails
6. Dashboard/review surface
7. Docker release and CI

Reason:

- step abstraction and CLI improve reliability/debugging immediately
- provider registry reduces future cost and API lock-in
- artifacts and validation make failures easier to understand
- dashboard and release automation are more useful once the internal workflow is stable

## Loop C Hardening Plan

Loop C turns the first compatibility pass into a stronger production-oriented foundation.

### C1. Physically Split Generate Pipeline Services

Implementation status:

- implemented first service-boundary pass
- added `src/services/generationPipeline.ts` with separate generation actions for job/topic resolution, duplicate guard, text generation, draft persistence, image generation, image persistence, approval, and job status updates
- reduced `src/scripts/generateOnce.ts` to a thin wrapper around the generation service while preserving the CLI result shape
- updated `src/services/dailyPipeline.ts` so `plan_topic`, `generate_text`, `generate_image`, and `approve_or_wait` call generation boundaries directly instead of treating `runGenerateOnce` as one opaque operation
- added focused unit tests for generation result shaping and date/content helpers
- DB-backed lifecycle coverage is intentionally left for C2 integration tests

Current issue:

- `dailyPipeline` has logical steps, but `generate_text` still calls `runGenerateOnce`
- topic selection, duplicate guard, text generation, draft persistence, image generation, image persistence, and auto-approval still live in one script-sized function
- step artifacts cannot yet capture precise prompt/text/image boundaries because those boundaries are hidden inside `runGenerateOnce`

Target shape:

```text
prepare_generation_job
resolve_generation_topic
guard_duplicate_post
generate_post_text
persist_post_draft
generate_post_images
persist_post_images
apply_auto_approval
mark_generation_done
```

Expected changes:

- add `src/services/generationPipeline.ts`
  - expose small functions for each generation action
  - return structured results that pipeline steps can store in `context.state`
  - keep DB writes in service layer, not script layer
- reduce `src/scripts/generateOnce.ts` to a thin CLI wrapper
- update `src/services/dailyPipeline.ts`
  - make `plan_topic` actually resolve/create job and topic
  - make `generate_text` call text generation + draft persistence
  - make `generate_image` call image generation + image persistence
  - make `approve_or_wait` own auto-approval/wait decision
- keep old command behavior:
  - `npm run generate:once`
  - `npm run daily:pipeline`
  - worker execution
- add focused tests around the new service functions and step state transitions

Non-goals:

- do not rewrite prompts
- do not change DB schema unless a hard blocker appears
- do not change provider selection behavior

Acceptance criteria:

- physical generation boundaries exist outside scripts
- pipeline steps no longer treat generation as one opaque function
- duplicate protection still prevents same-day duplicate posts
- image failure mode still works
- build/test pass

### C2. Add Database Integration Tests

Implementation status:

- implemented opt-in first pass
- added `tests/integration/db-lifecycle.integration.test.ts`
- added `npm run test:integration`
- integration test applies migrations and verifies pipeline job enqueue/claim/event/fail/requeue plus content job duplicate guard against a real Postgres database
- added a full safe-mode worker pipeline integration test that mocks Gemini, disables image generation, keeps publishing disabled, and verifies pipeline completion/events/post creation
- normal `npm test` remains DB-free; integration tests require `TEST_INTEGRATION_DB=true` and dedicated test DB env vars
- documented the command in README and deployment docs

Current issue:

- most coverage is unit/service-level
- schema, migrations, job claim/retry, duplicate guard, and approve/publish state transitions are not verified against a real Postgres instance in CI

Target shape:

```text
integration test db
  apply migrations
  enqueue daily job
  claim worker job
  insert draft
  approve draft
  retry failed job
  verify duplicate guard
```

Expected changes:

- add integration test setup that uses `TEST_DATABASE_URL` or individual `TEST_PG*` env vars
- keep integration tests opt-in locally at first, e.g. `npm run test:integration`
- add CI Postgres service only after the local integration test path is stable
- avoid real OpenAI/Facebook calls by using DB/service seams or safe fixtures

Non-goals:

- do not require Docker for normal `npm test`
- do not call external APIs in integration tests

Acceptance criteria:

- one command can run DB integration tests
- migrations apply in a clean test DB
- core job lifecycle works against Postgres

### C3. Deepen Job Artifacts

Implementation status:

- implemented first deep artifact pass
- text prompt construction is now reusable through `buildTextGenerationPrompts`
- pipeline writes `generation/topic.json`, `generation/text_system_prompt.txt`, `generation/text_user_prompt.txt`, `generation/parsed_content.json`, and `generation/text_provider_result.json`
- image step writes `generation/image_prompt.txt`, `generation/image_results.json`, and `generation/image_error.json` when applicable
- image artifact summaries intentionally omit raw `b64Data` and store only metadata plus decoded byte size
- publish artifacts still use the existing step result artifact; a full publish payload preview should wait for a publish service split

Current issue:

- artifacts currently store manifest and step result summaries
- prompt, parsed provider response, image prompt, image metadata, and publish payload preview are not captured consistently

Target artifact layout:

```text
storage/jobs/<jobId>/
  manifest.json
  steps/
    plan_topic.json
    generate_text.json
    generate_image.json
    approve_or_wait.json
    publish.json
  generation/
    topic.json
    text_prompt.txt
    text_provider_response.json
    parsed_content.json
    image_prompt.txt
    image_results.json
  publish/
    payload_preview.json
```

Expected changes:

- add artifact writer calls at service boundaries created in C1
- redact provider keys, page tokens, SMTP secrets, and raw auth headers
- store raw provider responses only when available and reasonably sized
- add size guard so artifacts do not accidentally store huge image blobs

Non-goals:

- do not store base64 image payloads in artifact files by default
- do not make artifacts required for successful pipeline completion

Acceptance criteria:

- failed AI/publish runs leave enough artifact context to debug without rerunning
- artifacts remain best-effort and redacted
- build/test pass

### C4. Add Admin UI Auth

Implementation status:

- implemented simple token auth first pass
- added `ADMIN_AUTH_ENABLED` and `ADMIN_TOKEN` env fields to examples and server env generation
- `/health` remains public
- `/login` accepts admin token and sets an `HttpOnly` cookie
- admin routes accept either `Authorization: Bearer <token>` or `admin_token` cookie when auth is enabled
- deployment docs now recommend token auth plus private network/VPN/SSH tunnel for access
- added tests for auth disabled, bearer token auth, and cookie auth

Current issue:

- admin UI is useful but unauthenticated
- docs currently warn to run it only behind private access

Target shape:

```text
ADMIN_AUTH_ENABLED=true
ADMIN_TOKEN=<long random token>
```

Expected changes:

- add env config for admin auth
- require token for all admin HTML routes except `/health`
- support token via cookie after login form or `Authorization: Bearer`
- keep default bind host as `127.0.0.1`
- update deployment docs for SSH tunnel/private network usage
- add route tests for unauthorized/authorized access

Non-goals:

- do not add user accounts or OAuth
- do not add external auth provider

Acceptance criteria:

- admin UI is protected when auth is enabled
- health check remains usable
- tests cover auth decisions

### C5. Harden Provider Fallback

Implementation status:

- implemented first provider hardening pass
- added `ProviderError` with provider/model/code/retryable/status/latency metadata
- added `fetchWithTimeout` controlled by optional `PROVIDER_TIMEOUT_MS`
- OpenAI, Gemini, and OpenAI-compatible text providers now classify HTTP, missing-output, config, and network failures
- provider results include latency metadata
- `gemini_first` records fallback chain and failed attempt metadata
- text provider metadata is included in generation artifacts
- added tests for provider error metadata and latency metadata

Current issue:

- provider fallback exists, but error classification, timeout, retry/backoff, and latency metadata are still thin
- failures are not yet consistently labeled retryable/non-retryable

Target shape:

```text
ProviderError
  provider
  code
  retryable
  statusCode?
  latencyMs
  causeMessage
```

Expected changes:

- add shared provider error helpers
- add timeout wrapper for fetch-based providers
- classify common errors:
  - invalid config/key: non-retryable
  - rate limit/quota: retryable or fallback-eligible
  - malformed JSON: fallback-eligible for text
  - network timeout: retryable/fallback-eligible
- include provider latency and fallback chain in generation result payloads
- add tests for fallback behavior and error metadata

Non-goals:

- do not add a third-party retry library unless code becomes messy
- do not hide hard validation failures behind fallback forever

Acceptance criteria:

- provider errors are structured
- fallback decisions are testable
- generation results expose provider chain metadata

### C6. Add Release Image Path

Implementation status:

- implemented first release image path
- added `.github/workflows/docker.yml` to publish GHCR images on version tags or manual dispatch
- added `docker-compose.release.yml` override using `APP_IMAGE`
- deployment docs now distinguish source-build deployment from image-pull deployment
- rollback by image tag is documented

Current issue:

- server currently builds image from source
- rollback works by checking out commits, but tagged image rollback would be cleaner

Target shape:

```text
.github/workflows/docker.yml
docker-compose.release.yml
ghcr.io/<owner>/<repo>:<tag>
ghcr.io/<owner>/<repo>:latest
```

Expected changes:

- add Docker publish workflow for manual dispatch and tags
- add release compose file using prebuilt image
- document image tags, pull, start, and rollback
- keep source-build compose as local/dev path

Non-goals:

- do not require GHCR for local development
- do not publish images until repo permissions are confirmed

Acceptance criteria:

- release image workflow is present and documented
- deployment docs distinguish source-build vs image-pull deployment
- rollback by image tag is documented

### C7. Add Lightweight Observability

Implementation status:

- implemented lightweight observability first pass
- added structured JSON logger helper
- pipeline step results, events, and step artifacts now include `durationMs`
- pipeline runner logs structured step completion/failure records
- added `getOperationalHealthSummary` service for queue/running/completed/failed counts and recent failed jobs
- admin UI now links to `/health/summary`
- no external monitoring stack added

Current issue:

- logs and events exist, but they are not yet consistently structured
- step durations and provider latency are not summarized in one place
- daily health signal is still manual/log-based

Target shape:

```text
structured logs
step duration metrics in pipeline event payloads
provider latency metadata
/health summary
optional daily health email summary
```

Expected changes:

- add small structured logger helper
- add duration measurement to `runPipelineSteps`
- include duration in step events and artifacts
- add health summary service for queued/failed/recent jobs
- expose admin health view or JSON endpoint
- optionally include health summary in report email

Non-goals:

- do not add Prometheus/Grafana yet
- do not add external monitoring SaaS integration yet

Acceptance criteria:

- step durations are visible in events/artifacts
- failures are easier to scan in logs
- health endpoint/report gives a quick operational summary

### Loop C Execution Order

1. C1 physically split generate pipeline services
2. C3 deepen artifacts, because it benefits from C1 boundaries
3. C5 harden provider fallback, because artifacts can then record better provider metadata
4. C4 add admin auth before exposing more admin views
5. C2 add DB integration tests once core service boundaries are cleaner
6. C7 add lightweight observability using the now-stable events/services
7. C6 add release image path after CI/repo permissions are settled

## 2026-06-17 Follow-up: Gemini Image-first Publishing Path

Implementation status:

- implemented Gemini image provider using `GEMINI_IMAGE_MODEL`
- added `IMAGE_PROVIDER=gemini_first` as the default image provider
- added `IMAGE_FALLBACK_PROVIDER=openai` for optional OpenAI image fallback
- kept Facebook publish flow unchanged after image persistence: generated images are saved to `post_images`, uploaded as unpublished Facebook photos, then attached to the feed post
- relaxed config validation so OpenAI credentials are only required when OpenAI provider/fallback is enabled
- added tests for Gemini image response parsing, image provider registry, and Gemini-only config

Verified:

- `npm run build` passed
- `npm test` passed, 95 tests
- Docker image rebuilt successfully
- one-off Docker generation test for `2026-06-19` used Gemini text, generated 1 Gemini image, persisted it to `post_images`, and did not publish to Facebook
- test data for `2026-06-19` was cleaned from DB after verification

## 2026-06-17 Follow-up: Two Daily Slots and Flexible Topics

Implementation status:

- added scheduled slots so one date can have independent `morning_09` and `evening_21` jobs
- changed scheduler config to `DAILY_PIPELINE_TIMES=09:00,21:00`
- added `scheduled_slot` to `pipeline_jobs`, `content_jobs`, and `content_plan`
- added content pillars as controlled rails for generated topics
- added `TOPIC_MODE=auto_approve_generated`
- added `TOPIC_DUPLICATE_LOOKBACK_DAYS=60`
- if a slot has no active manual topic, Gemini generates a new topic from the selected pillar and recent topic/post history
- admin and CLI job/post lists now show scheduled slot

Topic generation prompt policy:

- strict JSON object only
- Vietnamese topic and key notes
- include run date, slot, pillar, and recent topics/posts
- explicitly avoid duplicates in the configured 60-day lookback window

## 2026-06-21 Reliability Follow-up

Implementation status:

- retries now resume persisted draft text instead of skipping the remaining generation steps
- retries reuse existing post images and generate images only when they are missing
- `.env` and `.env.server` permissions are restricted to owner read/write
- topic history now includes the full configured 60-day window ordered by recent activity
- generated topics are normalized and similarity-checked; Gemini gets up to three attempts to produce a distinct topic
- manual post approval now enqueues a dedicated `publish` pipeline job
- worker supports targeted `publish` jobs through `payload.postId`
- scheduler dispatches each date/slot once per process instead of updating the same completed job every poll

Verified:

- TypeScript build passed
- unit tests passed, 104 tests
- PostgreSQL integration tests passed, 2 tests

## 2026-06-21 Gemini Cost Optimization

Implementation status:

- daily pipeline no longer calls Gemini to generate a missing topic
- quarterly topic planning generates two slots per day in 14-day batches
- scheduler creates the current-quarter backfill and the next quarter 15 days before it starts
- missing quarterly slots use the static weighted topic fallback and emit a warning
- Gemini text/image calls use a request-hash operation key, advisory lock, persisted result cache, and at most two attempts per operation
- failed operations can create a bounded retry generation while completed sibling operations remain cached
- `gemini_first` now uses only the configured Gemini model before OpenAI fallback
- Gemini `usageMetadata` is stored by `quarterly_topic`, `post_text`, and `post_image`
- daily report includes operation count, attempts, cache hits, repeated operations, and token usage
- image prompt and full post context remain unchanged

Runtime rollout:

- Q2 backfill activated 18 topics for June 22-30, 2026
- Q3 activated 184 topics for July 1 through September 30, 2026
- Q3 semantic duplicate scan found 0 collisions at threshold `0.75`
- quarterly generation completed with 9 successful operations, 10 attempts, and 9 cache hits during recovery

Verified:

- TypeScript build passed
- unit tests passed, 111 tests
- PostgreSQL integration tests passed, 2 tests
- Docker migrations applied successfully
- scheduler, worker, and PostgreSQL containers are healthy
