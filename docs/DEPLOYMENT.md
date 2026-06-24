# Deployment

This project uses Docker Compose as the production runtime path:

```text
PostgreSQL db
migrate one-shot container
scheduler loop
worker loop
```

The current release path builds the app image on the server from this repository. A prebuilt GHCR image can be added later after CI is stable.
For tagged releases, `docker-compose.release.yml` can run a prebuilt GHCR image instead of building from source on the server.

## 1. Server Prerequisites

- Docker Engine with Docker Compose plugin
- Git access to this repository
- A `.env.server` file created from `.env.server.example`
- Facebook/OpenAI/provider secrets available only on the server

Do not commit `.env`, `.env.server`, logs, or generated `storage/` artifacts.

## 2. Prepare Environment

Create `.env.server` from the template:

```bash
cp .env.server.example .env.server
```

Set at minimum:

```env
PGDATABASE=content_automation
PGUSER=content_user
PGPASSWORD=replace_with_strong_password
PUBLISH_ENABLED=false
IMAGE_GENERATION_ENABLED=false
REPORT_EMAIL_ENABLED=false
```

Keep `PUBLISH_ENABLED=false` for the first server boot. Enable real publishing only after migrations, job execution, and review flow are confirmed.

## 3. Start Or Update

Build and start the runtime:

```bash
docker compose --env-file .env.server up -d --build
```

The source-build compose tags the built app image as `APP_IMAGE_LOCAL`, defaulting to `content_automation_content_creator:local`.

Runtime data is bind-mounted under `/data/docker/content_creator`:

```text
POSTGRES_DATA_DIR=/data/docker/content_creator/postgres_data -> /var/lib/postgresql/data
APP_STORAGE_DIR=/data/docker/content_creator/app_storage -> /app/storage/jobs
VIDEO_STORAGE_DIR=/data/content_automation_videos/AI_post_facebook -> /app/media/reels
```

Reel records should store relative media keys such as `reels/123/render/final.mp4`.
Application code resolves those keys from `MEDIA_STORAGE_ROOT=/app/media`; absolute host paths must not be stored in PostgreSQL.

Container names default to `db_content_creator`, `migrate_content_creator`, `scheduler_content_creator`, and `worker_content_creator`.

Run from a published image instead of building on the server:

```bash
APP_IMAGE=ghcr.io/haiduongnguyen/content-automation-generation-content_creator:v1.0.0 \
docker compose -f docker-compose.release.yml --env-file .env.server up -d
```

Check service state:

```bash
docker compose --env-file .env.server ps
```

The scheduler reads `DAILY_PIPELINE_TIMES`, defaulting to:

```env
DAILY_PIPELINE_TIMES=09:00,21:00
```

Those times create separate `morning_09` and `evening_21` jobs for the same Vietnam calendar date. Topic auto-generation is enabled by default with `TOPIC_MODE=auto_approve_generated` and avoids recent topics/posts using `TOPIC_DUPLICATE_LOOKBACK_DAYS=60`.

If `PUBLISH_ENABLED=true`, each completed approved slot can publish a real Facebook post.

Inspect logs:

```bash
docker compose --env-file .env.server logs -f scheduler worker
```

Validate Compose config with the safe example env:

```bash
APP_ENV_FILE=.env.server.example docker compose --env-file .env.server.example config
```

Run CI-equivalent checks before deployment:

```bash
npm run build
npm test
```

Run DB integration tests only against a dedicated test database:

```bash
TEST_INTEGRATION_DB=true \
TEST_PGHOST=localhost \
TEST_PGPORT=5432 \
TEST_PGDATABASE=content_automation_test \
TEST_PGUSER=postgres \
TEST_PGPASSWORD=postgres \
npm run test:integration
```

The integration suite includes a full safe-mode worker pipeline test with mocked text generation and no real Facebook/OpenAI calls.

Run migrations manually if needed:

```bash
docker compose --env-file .env.server run --rm migrate
```

## 4. Common Operations

Restart the scheduler and worker:

```bash
docker compose --env-file .env.server restart scheduler worker
```

Run one worker claim manually:

```bash
docker compose --env-file .env.server run --rm worker node dist/scripts/workerOnce.js
```

List jobs:

```bash
docker compose --env-file .env.server run --rm worker node dist/scripts/jobsList.js
```

Show one job:

```bash
docker compose --env-file .env.server run --rm worker node dist/scripts/jobsShow.js --id 123
```

Retry one failed job:

```bash
docker compose --env-file .env.server run --rm worker node dist/scripts/jobsRetry.js --id 123
```

Review pending posts:

```bash
docker compose --env-file .env.server run --rm worker node dist/scripts/postsReview.js
```

Approve one post:

```bash
docker compose --env-file .env.server run --rm worker node dist/scripts/postsApprove.js --id 456
```

The admin review UI supports simple token auth. Enable it before exposing the UI beyond localhost:

```env
ADMIN_AUTH_ENABLED=true
ADMIN_TOKEN=replace_with_long_random_token
```

Even with token auth enabled, prefer a private network, VPN, or SSH tunnel for server access.

## 5. Backup And Restore

Create a database backup from the `db` container:

```bash
docker compose --env-file .env.server exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql
```

Restore into the Compose database:

```bash
cat backup.sql | docker compose --env-file .env.server exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

Generated job artifacts are written under `storage/jobs` outside Docker and `/app/storage/jobs` inside Docker. Docker Compose persists those files in `APP_STORAGE_DIR`.

## 6. Rollback

For the current build-from-source deployment path:

```bash
git fetch origin
git checkout <known-good-commit>
docker compose --env-file .env.server up -d --build
```

For image-based rollback:

```bash
APP_IMAGE=ghcr.io/haiduongnguyen/content-automation-generation-content_creator:<known-good-tag> \
docker compose -f docker-compose.release.yml --env-file .env.server up -d
```

If migrations changed the database schema, restore from a backup when the previous app version cannot run against the newer schema.

## 7. Stop

Stop app containers while keeping database data:

```bash
docker compose --env-file .env.server down
```

Remove containers and the PostgreSQL volume only when you intentionally want to delete local server data:

```bash
docker compose --env-file .env.server down -v
```
