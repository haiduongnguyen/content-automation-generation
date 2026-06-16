# Project Knowledge And Status

Last updated: 2026-06-16

## 1. Project Goal

This project is a local-first content automation system for a Facebook Page focused on:

- math foundations
- AI / Machine Learning / Data Science education
- Vietnamese students and beginners

Main business goal:

- generate one educational post per day
- save the generated content into PostgreSQL
- publish the post to Facebook automatically
- keep a content plan so the learning flow is logical, not random
- optionally send a daily report by email

## 2. Current Product Shape

The project now has one primary orchestration direction:

1. Node.js/TypeScript app logic
2. PostgreSQL-backed queue state
3. Docker Compose `scheduler` and `worker` services for server runtime

Windows Task Scheduler remains a local development fallback.

## 3. High-Level Architecture

```text
content_plan / topics
        |
        v
generateOnce.ts
  -> choose topic
  -> generate text (Gemini first, OpenAI fallback)
  -> optionally generate image
  -> save post into PostgreSQL
        |
        v
publishOnce.ts
  -> read approved post
  -> upload images to Facebook if present
  -> publish feed post
  -> save publish_attempts
  -> skip external publish when PUBLISH_ENABLED=false
        |
        v
dailyReportEmail.ts
  -> summarize run status
  -> send report email
```

Queue/worker path:

```text
enqueueDailyJob.ts
  -> create an idempotent daily_content row in pipeline_jobs

workerOnce.ts
  -> claim one queued pipeline job
  -> write pipeline_job_events
  -> run daily pipeline
  -> mark completed/failed

retryFailedJobs.ts
  -> find failed jobs with attempts remaining
  -> requeue them
  -> write requeued events
```

Current status:

- implemented for `daily_content`
- verified locally with safe mode
- writes worker events plus step-level events for generate, publish, and report
- failed jobs can be requeued with `npm run retry:failed`

## 4. Main Folders

### Root

- `src/`: application code
- `sql/`: SQL migrations and SQL query files
- `scripts/`: PowerShell helper scripts for local Windows runtime
- `tests/`: test files
- `docs/`: project docs
- `logs/`: local runtime logs

### Source Code

- `src/config/`: env loading and runtime config
- `src/db/`: PostgreSQL pool and SQL runner
- `src/services/`: generation, planning, publishing, quota, token health
- `src/scripts/`: executable app entrypoints
- `src/utils/`: date/time helpers

## 5. Important Runtime Entry Points

### `src/scripts/generateOnce.ts`

Purpose:

- create one daily content job
- pick topic from `content_plan` first
- fallback to weighted `topics` if needed
- skip generation when the daily job already has a post
- generate post text
- save draft post
- generate and save post image(s)
- auto-approve if enabled

Current status:

- implemented
- working for text generation
- image generation depends on OpenAI image billing/quota
- currently still a sensitive point operationally

### `src/scripts/publishOnce.ts`

Purpose:

- find one approved or auto-approved post that has not been published yet
- upload attached images if any
- publish to Facebook Page
- store success/failure in `publish_attempts`

Current status:

- implemented
- verified working against the real Facebook Page
- supports `PUBLISH_ENABLED=false` safe mode for pipeline testing without posting

### `src/scripts/dailyReportEmail.ts`

Purpose:

- compile daily summary
- send email report

Current status:

- implemented
- depends on valid SMTP/App Password setup
- should be considered environment-dependent, not guaranteed unless SMTP credentials are valid

### `src/scripts/generateTopicPlan.ts`

Purpose:

- generate a draft long-term topic plan from a broad theme
- save it into review tables, not directly into active production plan

Current status:

- implemented
- safe review flow exists

### `src/scripts/importContentPlanCsv.ts`

Purpose:

- import reviewed plan into active `content_plan`
- assign real `plan_date`

Current status:

- implemented
- this is the active production planning path

### `src/scripts/checkFbToken.ts`

Purpose:

- check Facebook token health / debug token state

Current status:

- implemented
- useful for operations and troubleshooting

## 6. Main Services

### `src/services/contentGenerator.ts`

Responsibilities:

- build the educational Facebook prompt
- call Gemini first if configured
- fallback to OpenAI if Gemini fails or returns invalid JSON
- normalize and validate returned JSON content

Current status:

- implemented
- production-critical
- working

Notes:

- prompt is now aligned to the Facebook-post style, not a blog/paper style
- target audience is Vietnamese high-school students, university tech students, and AI/Data beginners

### `src/services/postImageGenerator.ts`

Responsibilities:

- build image prompt from topic + generated content
- generate supporting image assets for posts

Current status:

- implemented
- operationally fragile because it relies on OpenAI image billing
- previous production gap was caused here when billing hard limit was reached

### `src/services/contentPlan.ts`

Responsibilities:

- resolve the topic for today
- prefer exact `plan_date`
- fallback by `day_no`

Current status:

- implemented
- active in production flow

### `src/services/openAiQuota.ts`

Responsibilities:

- keep OpenAI usage within configured daily limits

Current status:

- implemented
- useful mainly for text generation safeguards

### `src/services/publishMessage.ts`

Responsibilities:

- format final Facebook post text
- put the title first
- render title as `**UPPERCASE**`

Current status:

- implemented
- active in production flow

## 7. Database Model

### Core tables

#### `content_jobs`

Tracks daily job state.

Used for:

- queued
- generating
- generated
- posted
- failed

#### `posts`

Stores generated content.

Important fields:

- `job_id`
- `topic_id`
- `title`
- `body`
- `cta`
- `hashtags`
- `approval_status`
- `provider_used`
- `fallback_used`

#### `publish_attempts`

Stores Facebook publish results.

Used for:

- success history
- failure history
- platform post id tracking

#### `post_images`

Stores generated image payloads.

Used for:

- image prompt archive
- base64 image storage
- publish attachment lookup

#### `content_plan`

The active production content roadmap.

Important fields:

- `day_no`
- `plan_date`
- `topic`
- `key_notes`
- `is_active`

This is the table that decides what topic is posted each day.

#### `topics`

Legacy weighted fallback topic list.

Used only if no active `content_plan` match is found.

#### `plan_batches`

Stores metadata for generated draft topic-plan batches.

#### `topic_plan_draft`

Stores reviewable draft topics before moving into production `content_plan`.

#### `pipeline_jobs`

Stores durable app-level pipeline jobs for the newer queue/worker path.

Important fields:

- `job_type`
- `run_date`
- `status`
- `attempt_count`
- `max_attempts`
- `locked_at`
- `locked_by`
- `payload`
- `error_message`

#### `pipeline_job_events`

Stores event history for `pipeline_jobs`.

Used for:

- worker start/completion/failure trace
- future dashboard/CLI inspection
- retry/debug visibility

## 8. Current Scheduling Model

### Option A: Docker server runtime

Recommended server path.

Target flow:

1. `docker compose --env-file .env.server up -d --build`
2. `migrate` applies schema/migrations
3. `scheduler` enqueues daily jobs
4. `worker` claims queued jobs
5. queue events are written to `pipeline_job_events`

Current status:

- Dockerfile exists
- docker-compose exists
- `.env.server` can be generated from the existing local `.env` through `scripts/create-server-env.ps1`
- scheduler loop exists
- worker loop exists
- safe defaults are documented in `.env.server.example`

### Option B: Node scripts directly

Local development fallback.

Target flow:

1. Windows Task Scheduler at 21:00
2. `scripts/run-daily-19h.ps1`
3. `npm run daily:pipeline`
4. generate post
5. publish approved/auto-approved post
6. send daily email report inside the same pipeline if `REPORT_EMAIL_ENABLED=true`

Current status:

- `daily:pipeline` exists
- scheduler installer creates one daily task
- local runtime does not need Docker if PostgreSQL and env vars are already available

Important operational limitation:

- because this runs locally, it is not cloud-reliable
- if the machine is off or asleep, no scheduled post will happen

## 9. Startup / Local Operations Status

### Docker startup

Purpose:

- start PostgreSQL, migration, scheduler, and worker services
- keep scheduling and retry logic in the app deployment
- avoid dependency on a logged-in desktop session

Current status:

- `docker-compose.yml` defines `db`, `migrate`, `scheduler`, and `worker`
- `.env.server.example` documents safe server defaults
- `scripts/create-server-env.ps1` can generate `.env.server` from local `.env`

### Windows Task Scheduler

Purpose:

- run `npm run daily:pipeline` at 21:00 for local development or laptop runtime

Current status:

- available as a local fallback
- not recommended as the long-term production scheduler if a server is available

## 10. Prompt / Content Strategy Status

The content prompt has already been shifted away from:

- SME/business-owner audience
- long-form academic blog style

It is now aligned to:

- Facebook-native reading behavior
- Vietnamese language
- short paragraphs
- intuition first
- direct AI/ML relevance
- mobile readability

Current status:

- production-ready baseline
- likely needs iterative content refinement, but the direction is correct

## 11. Image Strategy Status

Current implemented strategy:

- use generated post content to build image prompt
- educational style
- light beige background, dark text direction was discussed
- one image per day based on date-driven role selection

Current operational reality:

- image generation is the weakest production component
- OpenAI image cost/billing issues previously blocked daily posts
- backlog had to be manually recovered when image generation failed

Recommended interpretation:

- text posting is stable
- image posting is conditionally stable

## 12. Topic Planning Status

### Active plan source

Active production topic selection comes from `content_plan`.

### Duplicate status

As of 2026-06-16:

- no exact duplicate topic rows found in active `content_plan`
- no exact duplicate rows found in legacy `topics`

Important nuance:

- some neighboring topics are conceptually close
- this may feel repetitive even if the stored topic text is not duplicated

### 30-day roadmap status

- active
- date-based
- currently extends into July 2026
- content flow moves from statistics into Python/data tooling and then into ML fundamentals

## 13. Facebook Publishing Status

Current status:

- verified working with the current Page token
- missing backlog posts from early/mid June 2026 were republished successfully
- all jobs from 2026-06-03 through 2026-06-16 are now marked posted

Known operational risks:

- token expiry / wrong token type
- Page permission changes
- Facebook API version/token policy changes

## 14. Email Report Status

Feature exists for:

- sending daily execution summary
- operational observability

Current status:

- code exists
- behavior depends on SMTP credentials and environment setup
- should be considered operationally useful but environment-sensitive

## 15. Test Coverage

Current tests exist for:

- SQL loader
- SQL runner
- content generator parsing and behavior
- publish message formatting
- OpenAI quota logic
- content plan day resolution
- Facebook token health
- post image prompt behavior
- Facebook publish payload helpers
- topic plan JSON validation

Important note:

- tests are mostly unit-level
- there is no full end-to-end automated integration test against real Facebook and real email

## 16. Known Issues / Operational Lessons

### 1. Local runtime dependency

If the local computer is off or asleep, local scheduled posting will not happen. Use Docker on a server for better reliability.

### 2. Image generation can block the pipeline

Historically this happened when OpenAI image billing hit the hard limit.

### 3. UTC vs Vietnam date interpretation

Some database timestamps appear shifted because of UTC storage vs local Vietnam interpretation.

### 4. Old scheduler artifacts may exist outside the repo

Old Windows scheduled tasks or startup shortcuts from earlier iterations may still exist on the machine.
They should be checked on the host before production use.

## 17. Current Overall Status By Component

### Core app code

Status: working

### PostgreSQL schema and persistence

Status: working

### Content plan system

Status: working

### Gemini-first text generation

Status: working

### OpenAI fallback text generation

Status: working

### Facebook Page publishing

Status: working

### Image generation

Status: partially stable, billing-sensitive

### Daily email report

Status: implemented, environment-dependent

### Windows Task Scheduler

Status: local fallback

## 18. Recommended Next Improvements

1. Make image generation failure non-fatal so text-only posting can continue.
2. Add a retry/backfill utility for missing days.
3. Add semantic duplicate detection for topic plans before activation.
4. Add one operational dashboard/report view for job health.
5. Keep Docker Compose scheduler/worker as the production runtime path.
6. If reliability matters, run the Docker stack on a VPS.

## 19. Files Most Important To Understand First

- `README.md`
- `docs/PROJECT_KNOWLEDGE_STATUS.md`
- `src/scripts/generateOnce.ts`
- `src/scripts/publishOnce.ts`
- `src/scripts/dailyReportEmail.ts`
- `src/services/contentGenerator.ts`
- `src/services/contentPlan.ts`
- `src/services/postImageGenerator.ts`
- `sql/016_create_content_plan.sql`
- `sql/017_add_plan_date_to_content_plan.sql`
- `sql/018_create_post_images.sql`
- `sql/025_add_provider_tracking_to_posts.sql`

## 20. Final Summary

This project has moved beyond MVP idea stage and is already a working local content automation system.

What is solid:

- topic planning
- post text generation
- database storage
- Facebook publishing

What still needs operational hardening:

- image generation failure handling
- autostart reliability
- local-machine dependency
- SMTP/runtime observability
