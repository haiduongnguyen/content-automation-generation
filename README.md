# Content Automation MVP

Automate daily educational content generation, Facebook publishing, and daily email reporting.

## Tech stack
- Node.js + TypeScript
- PostgreSQL
- OpenAI API (`responses` + image generation)
- Facebook Graph API (Page post)
- Windows Task Scheduler (optional)

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

Current scheduler script creates:
- daily pipeline task at `19:00`
- report task at `20:30`

Logs:
- `logs/daily-19h.log`
- `logs/report.log`

## 6) Topic plan workflow
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

## 7) Email reporting config
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

## 8) Project scripts
- `generate:once`: create one daily post
- `publish:once`: publish one queued post to Facebook
- `report:email`: send one daily report email
- `import:plan`: import plan CSV into `content_plan`
- `plan:generate`: generate draft topics from a broad theme
- `check:fb-token`: inspect token validity/expiry
- `schedule:install`: install Windows scheduled tasks

## 9) Notes
- Image generation model currently supports `1024x1024`, `1024x1536`, `1536x1024`, `auto`.
- Current logic generates **1 image/day**, randomly selected role by date.
- If report email runs but nothing arrives, check `logs/report.log` first.
