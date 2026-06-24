# Content Automation MVP

Automate daily educational content generation, Facebook publishing, and optional daily email reporting.

## Tech stack
- Node.js + TypeScript
- PostgreSQL
- OpenAI API (`responses` + image generation)
- Facebook Graph API (Page post)
- Windows Task Scheduler for local scheduling
- Docker Compose scheduler/worker for server runtime

## 1) Prerequisites
- Node.js 20+
- PostgreSQL 14+
- A Facebook Page with valid Page Access Token
- OpenAI API key

## 2) Setup
```bash
npm install
copy .env.example .env
```

Fill `.env`:
- `PG*`: PostgreSQL connection
- `OPENAI_API_KEY`, `OPENAI_MODEL`
- `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`, `FB_GRAPH_VERSION`
- `AUTO_APPROVE=true` if you want auto-publish-ready posts
- `PUBLISH_ENABLED=false` if you want to test the pipeline without posting to Facebook
- `IMAGE_GENERATION_ENABLED=false` if you want text-only posting while controlling image API cost
- `IMAGE_FAILURE_MODE=continue_text_only` if image errors should not block text posting
- SMTP vars if you want report emails

## 3) Database
This project expects an existing `content_automation` schema/tables for the posting flow.

Apply newer migrations added in this repo:
- `sql/018_create_post_images.sql`
- `sql/021_create_plan_batches.sql`
- `sql/022_create_topic_plan_draft.sql`

Example (PowerShell):
```powershell
psql -d content_automation -f sql/018_create_post_images.sql
psql -d content_automation -f sql/021_create_plan_batches.sql
psql -d content_automation -f sql/022_create_topic_plan_draft.sql
```

## 4) Run manually
Run the whole local daily pipeline:
```bash
npm run daily:pipeline
```

Queue the daily pipeline for worker execution:
```bash
npm run enqueue:daily
npm run worker:once
npm run retry:failed
```

Inspect and operate jobs:
```bash
npm run jobs:list
npm run jobs:show -- --id 123
npm run jobs:retry -- --id 123
npm run posts:review
npm run posts:approve -- --id 456
npm run backfill -- --from 2026-06-01 --to 2026-06-03
```

Start local admin review UI:
```bash
npm run admin:dev
```

Optional admin UI auth:
```env
ADMIN_AUTH_ENABLED=true
ADMIN_TOKEN=replace_with_long_random_token
```

Generate one post draft (+ image):
```bash
npm run generate:once
```

Publish one approved/auto-approved post:
```bash
npm run publish:once
```

Send daily report email now:
```bash
npm run report:email
```

Check Facebook token health:
```bash
npm run check:fb-token
```

Run tests:
```bash
npm test
```

Run opt-in PostgreSQL integration tests against a dedicated test database:
```bash
TEST_INTEGRATION_DB=true \
TEST_PGHOST=localhost \
TEST_PGPORT=5432 \
TEST_PGDATABASE=content_automation_test \
TEST_PGUSER=postgres \
TEST_PGPASSWORD=postgres \
npm run test:integration
```

The integration suite includes a full safe-mode worker pipeline test. It mocks Gemini text generation, disables image generation, keeps `PUBLISH_ENABLED=false`, and verifies the worker job completes without calling Facebook.

## 5) Scheduler (Windows)
Install scheduled tasks from script:
```bash
npm run schedule:install
```

Current scheduler script creates one local task:
- `ContentAutomation-Daily21h` at `21:00`

The task calls `scripts/run-daily-19h.ps1`, which runs:
```bash
npm run daily:pipeline
```

`daily:pipeline` runs generate + publish, and sends the report inside the same pipeline when `REPORT_EMAIL_ENABLED=true`.

The installer also removes legacy local tasks for separate generate/publish/report to avoid duplicate runs.

Logs:
- `logs/daily-pipeline.log`
- `logs/report.log` only if `scripts/run-report.ps1` is run manually

## 6) Docker server runtime
Full server deployment notes live in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Create server env from your existing local `.env`:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/create-server-env.ps1
```

This copies existing API/Facebook/SMTP values, changes `PGHOST` to `db`, and adds Docker loop defaults. `.env.server.example` is only a blank template for a fresh server.

Then run:
```bash
docker compose --env-file .env.server up -d --build
```

The source-build compose tags the app image as `APP_IMAGE_LOCAL`, defaulting to `content_automation_content_creator:local`.

Runtime data is bind-mounted under `/data/docker/content_creator`:
- `POSTGRES_DATA_DIR=/data/docker/content_creator/postgres_data`
- `APP_STORAGE_DIR=/data/docker/content_creator/app_storage`

Generated Reel media uses a separate persistent bind mount:
- `VIDEO_STORAGE_DIR=/data/content_automation_videos/AI_post_facebook`
- container path: `/app/media/reels`
- database paths should remain relative, for example `reels/123/render/final.mp4`

The Reel module is scaffolded but disabled until a renderer is implemented:
```env
REELS_ENABLED=false
REEL_RENDER_METHOD=ffmpeg_slideshow
```

Supported renderer names are `ffmpeg_slideshow`, `remotion`, and `hybrid_ai`.

Render and validate a 15-second local prototype from an existing post:
```bash
npm run reels:prototype -- --post-id 11
```

The FFmpeg prototype requires Google Cloud Text-to-Speech credentials through
`TTS_GOOGLE_API_KEY`, `GOOGLE_TTS_CREDENTIALS_JSON`, or `GOOGLE_APPLICATION_CREDENTIALS`. It writes media under
`reels/{post_id}/prototype/` and does not create database records or publish to Facebook.

When FFmpeg is only installed in the application image, run the prototype in Docker:
```bash
docker compose --env-file .env.server run --rm worker node dist/scripts/reelsPrototype.js --post-id 11
```

Container names default to:
- `db_content_creator`
- `migrate_content_creator`
- `scheduler_content_creator`
- `worker_content_creator`

For tagged image releases, use the release override:
```bash
APP_IMAGE=ghcr.io/haiduongnguyen/content-automation-generation-content_creator:v1.0.0 \
docker compose -f docker-compose.release.yml --env-file .env.server up -d
```

Services:
- `db`: PostgreSQL
- `migrate`: applies core schema/migrations and upserts the Facebook publish target from env
- `scheduler`: enqueues scheduled content jobs and requeues retryable failed jobs
- `worker`: continuously claims and runs queued jobs

On a Linux server, this Docker scheduler is the preferred clock. By default it reads `DAILY_PIPELINE_TIMES=09:00,21:00` and enqueues two independent slots per Vietnam day: `morning_09` and `evening_21`. You can also use host `cron` or a `systemd` timer to run `npm run enqueue:daily -- --schedule-time HH:mm`, but the built-in Compose `scheduler` service keeps the scheduling path inside the same deployment and writes retryable jobs to PostgreSQL.

Safe server defaults in `.env.server.example`:
```env
PUBLISH_ENABLED=false
IMAGE_GENERATION_ENABLED=false
IMAGE_FAILURE_MODE=continue_text_only
REPORT_EMAIL_ENABLED=false
```

Inspect logs:
```bash
docker compose --env-file .env.server logs -f scheduler worker
```

Run CI-equivalent checks locally before pushing:
```bash
npm run build
npm test
```

## 7) Topic plan workflow
### Import fixed 30-day CSV plan
```bash
npm run import:plan
```

### Generate draft plan from broad theme
```bash
npx tsx src/scripts/generateTopicPlan.ts --theme "Nen tang Toan cho AI ML" --days 100 --language vi --difficulty beginner --batch-name "Plan 100 days v1"
```

This writes to:
- `plan_batches`
- `topic_plan_draft`

It does **not** overwrite `content_plan` yet (safe review stage).

## 8) Email reporting config
To enable daily report email:
```env
REPORT_EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
REPORT_EMAIL_FROM=your_email@gmail.com
REPORT_EMAIL_TO=receiver@gmail.com
```

Topic planning defaults:
```env
TOPIC_MODE=auto_approve_generated
TOPIC_DUPLICATE_LOOKBACK_DAYS=60
```

If a `content_plan` row already exists for `plan_date + scheduled_slot`, the worker uses it. Otherwise, Gemini generates a slot topic from active content pillars and recent topics/posts from the last 60 days, then stores it in `content_plan`.

## 9) Project scripts
- `daily:pipeline`: run local daily generate + publish + optional report
- `enqueue:daily`: enqueue today's `daily_content` pipeline job, optionally with `--scheduled-slot` or `--schedule-time`
- `worker:once`: claim and run one queued pipeline job
- `retry:failed`: requeue failed pipeline jobs that still have attempts remaining
- `jobs:list`: list recent pipeline jobs
- `jobs:show`: inspect one pipeline job and events
- `jobs:retry`: retry one failed pipeline job
- `posts:review`: list draft posts awaiting approval
- `posts:approve`: approve one draft post
- `backfill`: enqueue daily jobs for a date range
- `admin:dev`: start local admin review UI on `ADMIN_HOST:ADMIN_PORT`
- `admin:start`: start built admin review UI from `dist/`
- `worker:loop`: continuously claim queued jobs
- `scheduler:loop`: enqueue daily jobs and requeue retryable jobs
- `db:migrate`: apply DB bootstrap/migrations
- `generate:once`: create one daily post
- `publish:once`: publish one queued post to Facebook
- `report:email`: send one daily report email
- `import:plan`: import plan CSV into `content_plan`
- `plan:generate`: generate draft topics from a broad theme
- `check:fb-token`: inspect token validity/expiry
- `schedule:install`: install Windows scheduled tasks

## 10) Notes
- Image generation model currently supports `1024x1024`, `1024x1536`, `1536x1024`, `auto`.
- Current logic generates **1 image/post**, randomly selected role by run date and slot.
- `generate:once` skips generation if the scheduled slot job already has a post, preventing accidental duplicate posts for the same job.
- If image generation fails and `IMAGE_FAILURE_MODE=continue_text_only`, the pipeline continues with a text-only post.
- If `PUBLISH_ENABLED=false`, `publish:once` reports the ready post it would publish but does not call Facebook or mark it posted.
- If report email runs but nothing arrives, check `logs/daily-pipeline.log` or `logs/report.log` first.
