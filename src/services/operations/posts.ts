import { pool } from "../../db/pool";
import { enqueuePipelineJob } from "../pipelineJobs";

export type ReviewPostRow = {
  id: string;
  job_id: string;
  run_date: string;
  scheduled_slot: string;
  title: string | null;
  approval_status: string;
  provider_used: string | null;
  fallback_used: boolean;
  image_count: string;
  created_at: string;
};

export async function listReviewPosts(limit = 20): Promise<ReviewPostRow[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const result = await pool.query<ReviewPostRow>(
    `
    SELECT p.id, p.job_id, cj.run_date, cj.scheduled_slot, p.title, p.approval_status, p.provider_used, p.fallback_used,
           COUNT(pi.id)::text AS image_count,
           p.created_at
    FROM posts p
    JOIN content_jobs cj ON cj.id = p.job_id
    LEFT JOIN post_images pi ON pi.post_id = p.id
    WHERE p.approval_status = 'draft'
    GROUP BY p.id, cj.run_date, cj.scheduled_slot
    ORDER BY p.created_at DESC
    LIMIT $1
    `,
    [boundedLimit]
  );
  return result.rows;
}

export async function approvePost(postId: number): Promise<ReviewPostRow> {
  const result = await pool.query<ReviewPostRow>(
    `
    WITH updated AS (
      UPDATE posts
      SET approval_status = 'approved',
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, job_id, title, approval_status, provider_used, fallback_used, created_at
    )
    SELECT u.id, u.job_id, cj.run_date, cj.scheduled_slot, u.title, u.approval_status, u.provider_used, u.fallback_used,
           COUNT(pi.id)::text AS image_count,
           u.created_at
    FROM updated u
    JOIN content_jobs cj ON cj.id = u.job_id
    LEFT JOIN post_images pi ON pi.post_id = u.id
    GROUP BY u.id, u.job_id, cj.run_date, cj.scheduled_slot, u.title, u.approval_status, u.provider_used, u.fallback_used, u.created_at
    `,
    [postId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Post not found: ${postId}`);
  }
  await enqueuePipelineJob({
    jobType: "publish",
    runDate: row.run_date,
    scheduledSlot: row.scheduled_slot,
    maxAttempts: 3,
    payload: {
      source: "manual_approval",
      postId: Number(row.id),
    },
  });
  return row;
}
