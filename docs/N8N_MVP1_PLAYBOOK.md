# n8n MVP1 Playbook

## Scope
- Daily content generation
- Save to PostgreSQL
- Manual approval
- Publish to Facebook Page
- Retry failed publish attempts

## Workflow A: Generate Draft Daily
1. `Cron` (daily, 08:00 Asia/Ho_Chi_Minh)
2. `Postgres` -> run `sql/001_create_daily_job.sql`
   - param: `run_date = {{$now.format('yyyy-LL-dd')}}`
3. `Postgres` -> run `sql/002_pick_weighted_topic.sql`
4. `Postgres` -> run `sql/003_mark_job_generating.sql`
   - param: `job_id` from step 2
5. `OpenAI` (chat completion)
   - input: selected topic + tone + constraints
   - output JSON keys: `title`, `body`, `cta`, `hashtags`
6. `Postgres` -> run `sql/004_insert_post_draft.sql`
   - params: `job_id`, `topic_id`, `title`, `body`, `cta`, `hashtags_json`, `tone`, `model_name`, `prompt_version`
7. `Postgres` -> run `sql/005_mark_job_generated.sql`
8. Error branch -> run `sql/011_mark_job_failed.sql`

## Manual Approval Step
- In MVP1, update post rows manually:
```sql
UPDATE posts
SET approval_status='approved'
WHERE id = :post_id;
```

## Workflow B: Publish Approved Posts
1. `Cron` (every 15 min)
2. `Postgres` -> run `sql/006_get_posts_ready_to_publish.sql`
3. `Postgres` -> run `sql/007_get_active_publish_target.sql` with `platform=facebook`
4. `HTTP Request` -> Facebook Graph API publish
5. Success branch:
   - `sql/008_log_publish_success.sql`
   - `sql/010_mark_job_posted.sql`
6. Fail branch:
   - `sql/009_log_publish_failed.sql`
   - optional `sql/011_mark_job_failed.sql`

## Workflow C: Retry Failed Publishes
1. `Cron` (hourly)
2. `Postgres` -> run `sql/012_get_retry_candidates.sql`
   - param: `max_attempts = {{$env.MAX_RETRY_ATTEMPTS || 3}}`
3. Publish again using same Facebook request node
4. Log success/failure with `008` / `009`

## Node Mapping Notes
- Keep n8n SQL parameter mode enabled; map `:param` from prior node JSON.
- Never post if `approval_status` is not approved/auto_approved.
- Keep OpenAI response in strict JSON format to simplify SQL mapping.
