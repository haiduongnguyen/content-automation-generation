import { loadConfig } from "../config/env";
import { pool } from "../db/pool";
import { queryOneFromFile } from "../db/sqlRunner";
import { generatePostContent } from "../services/contentGenerator";
import { pickPlannedTopic } from "../services/contentPlan";
import { assertOpenAiQuotaAvailable, logOpenAiUsage } from "../services/openAiQuota";
import { generatePostImages } from "../services/postImageGenerator";
import { getVietnamDateString } from "../utils/dateTime";

type JobRow = { id: string };
type TopicRow = { id: string; name: string };
type PostRow = { id: string };

async function run(): Promise<void> {
  const cfg = loadConfig();
  const now = new Date();
  const runDate = getVietnamDateString(now);

  const job = await queryOneFromFile<JobRow>("001_create_daily_job.sql", { run_date: runDate });
  const fallbackTopic = await queryOneFromFile<TopicRow>("002_pick_weighted_topic.sql");
  const planned = await pickPlannedTopic(now);
  const chosenTopicName = planned?.topicName ?? fallbackTopic.name;
  const chosenTopicId = planned ? null : Number(fallbackTopic.id);

  try {
    await queryOneFromFile("003_mark_job_generating.sql", { job_id: Number(job.id) });

    if (!cfg.geminiApiKey) {
      await assertOpenAiQuotaAvailable(chosenTopicName);
    }
    const generated = await generatePostContent(chosenTopicName);
    if (generated.providerUsed === "openai") {
      await logOpenAiUsage({ topicName: chosenTopicName, status: "success" });
    }

    const post = await queryOneFromFile<PostRow>("004_insert_post_draft.sql", {
      job_id: Number(job.id),
      topic_id: chosenTopicId,
      title: generated.content.title,
      body: generated.content.body,
      cta: generated.content.cta,
      hashtags_json: JSON.stringify(generated.content.hashtags),
      tone: "practical",
      model_name: cfg.openAiModel,
      prompt_version: cfg.promptVersion,
      provider_used: generated.providerUsed,
      fallback_used: generated.fallbackUsed,
    });
    const images = await generatePostImages({
      topicName: chosenTopicName,
      postContent: [generated.content.title, generated.content.body, generated.content.cta].filter(Boolean).join("\n\n"),
      seedDate: runDate,
    });
    for (const image of images) {
      await queryOneFromFile("019_insert_post_image.sql", {
        post_id: Number(post.id),
        image_role: image.role,
        prompt: image.prompt,
        mime_type: image.mimeType,
        image_b64: image.b64Data,
      });
    }

    if (cfg.autoApprove) {
      await pool.query("UPDATE posts SET approval_status='auto_approved' WHERE id=$1", [Number(post.id)]);
    }

    await queryOneFromFile("005_mark_job_generated.sql", { job_id: Number(job.id) });

    console.log(
      JSON.stringify(
        {
          jobId: job.id,
          topicId: chosenTopicId,
          plannedDayNo: planned?.dayNo ?? null,
          chosenTopicName,
          postId: post.id,
          approvalMode: cfg.autoApprove ? "auto_approved" : "draft",
          providerUsed: generated.providerUsed,
          fallbackUsed: generated.fallbackUsed,
        },
        null,
        2
      )
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown generate error";
    if (
      !cfg.geminiApiKey &&
      !message.includes("daily request cap") &&
      !message.includes("daily budget") &&
      !message.includes("quota blocked")
    ) {
      await logOpenAiUsage({ topicName: chosenTopicName, status: "failed", errorMessage: message });
    }
    await queryOneFromFile("011_mark_job_failed.sql", {
      job_id: Number(job.id),
      error_message: message,
    });
    throw err;
  }
}

run()
  .catch((err) => {
    console.error("generate:once failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
