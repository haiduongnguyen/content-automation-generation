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
Create server env from your existing local `.env`:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/create-server-env.ps1
```

This copies existing API/Facebook/SMTP values, changes `PGHOST` to `db`, and adds Docker loop defaults. `.env.server.example` is only a blank template for a fresh server.

Then run:
```bash
docker compose --env-file .env.server up -d --build
```

Services:
- `db`: PostgreSQL
- `migrate`: applies core schema/migrations and upserts the Facebook publish target from env
- `scheduler`: enqueues daily jobs and requeues retryable failed jobs
- `worker`: continuously claims and runs queued jobs

On a Linux server, this Docker scheduler is the preferred clock. You can also use host `cron` or a `systemd` timer to run `npm run enqueue:daily`, but the built-in Compose `scheduler` service keeps the scheduling path inside the same deployment and writes retryable jobs to PostgreSQL.

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

## 9) Project scripts
- `daily:pipeline`: run local daily generate + publish + optional report
- `enqueue:daily`: enqueue today's `daily_content` pipeline job
- `worker:once`: claim and run one queued pipeline job
- `retry:failed`: requeue failed pipeline jobs that still have attempts remaining
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
- Current logic generates **1 image/day**, randomly selected role by date.
- `generate:once` skips generation if the daily job already has a post, preventing accidental duplicate posts for the same job.
- If image generation fails and `IMAGE_FAILURE_MODE=continue_text_only`, the pipeline continues with a text-only post.
- If `PUBLISH_ENABLED=false`, `publish:once` reports the ready post it would publish but does not call Facebook or mark it posted.
- If report email runs but nothing arrives, check `logs/daily-pipeline.log` or `logs/report.log` first.
