# SQL Pack for n8n MVP1

This folder contains SQL templates for the `content_automation` database.

## Suggested flow order
1. `001_create_daily_job.sql`
2. `002_pick_weighted_topic.sql`
3. `003_mark_job_generating.sql`
4. Generate content with OpenAI
5. `004_insert_post_draft.sql`
6. `005_mark_job_generated.sql`
7. Manual approval in your app/DB (`approval_status = approved`)
8. `006_get_posts_ready_to_publish.sql`
9. `007_get_active_publish_target.sql`
10. Publish to Facebook Graph API
11. `008_log_publish_success.sql` or `009_log_publish_failed.sql`
12. `010_mark_job_posted.sql` or `011_mark_job_failed.sql`
13. Retry workflow with `012_get_retry_candidates.sql`

## Notes
- Parameter syntax uses `:param_name`. Map these in n8n before executing each query.
- Keep approval in MVP1 (no blind auto-post).
- Replace `YOUR_PAGE_ID_1` with your real Page ID in `publish_targets`.
