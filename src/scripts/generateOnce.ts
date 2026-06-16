import { loadConfig } from "../config/env";
import { pool } from "../db/pool";
import { queryManyFromFile, queryOneFromFile } from "../db/sqlRunner";
import { generatePostContent } from "../services/contentGenerator";
import { chooseTopic, pickPlannedTopic } from "../services/contentPlan";
import { logOpenAiUsage } from "../services/openAiQuota";
import { shouldSkipGenerateForExistingPost, type ExistingPostForJob } from "../services/postDuplicateGuard";
import { generatePostImages, shouldContinueAfterImageFailure, type GeneratedImage } from "../services/postImageGenerator";
import { getVietnamDateString } from "../utils/dateTime";

type JobRow = { id: string };
type TopicRow = { id: string; name: string };
type PostRow = { id: string };

export type GenerateOnceResult =
  | {
      status: "skipped";
      reason: string;
      jobId: string;
      postId: string;
      approvalStatus: string;
    }
  | {
      status: "generated";
      jobId: string;
      topicId: number | null;
      plannedDayNo: number | null;
      chosenTopicName: string;
      postId: string;
      approvalMode: "auto_approved" | "draft";
      providerUsed: string;
      fallbackUsed: boolean;
      imageCount: number;
      imageError: string | null;
    };

export async function runGenerateOnce(): Promise<GenerateOnceResult> {
  const cfg = loadConfig();
  const now = new Date();
  const runDate = getVietnamDateString(now);

  const job = await queryOneFromFile<JobRow>("001_create_daily_job.sql", { run_date: runDate });
  const planned = await pickPlannedTopic(now);
  const fallbackTopic = planned ? null : await queryOneFromFile<TopicRow>("002_pick_weighted_topic.sql");
  const chosenTopic = chooseTopic(planned, fallbackTopic);
  const chosenTopicName = chosenTopic.topicName;
  const chosenTopicId = chosenTopic.topicId;

  try {
    const existingPosts = await queryManyFromFile<ExistingPostForJob>("033_get_existing_post_for_job.sql", {
      job_id: Number(job.id),
    });
    const existingPost = existingPosts[0] ?? null;
    if (existingPost && shouldSkipGenerateForExistingPost(existingPost)) {
      const result: GenerateOnceResult = {
        status: "skipped",
        reason: "Existing post already generated for job",
        jobId: job.id,
        postId: existingPost.id,
        approvalStatus: existingPost.approval_status,
      };
      console.log(JSON.stringify({ ...result, skipped: true, existingPostId: existingPost.id }, null, 2));
      return result;
    }

    await queryOneFromFile("003_mark_job_generating.sql", { job_id: Number(job.id) });

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
    let imageErrorMessage: string | null = null;
    let images: GeneratedImage[] = [];
    try {
      images = await generatePostImages({
        topicName: chosenTopicName,
        postContent: [generated.content.title, generated.content.body, generated.content.cta].filter(Boolean).join("\n\n"),
        seedDate: runDate,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown image generation error";
      if (!shouldContinueAfterImageFailure(cfg.imageFailureMode)) {
        throw err;
      }
      imageErrorMessage = message;
      console.warn(`image generation failed; continuing text-only: ${message}`);
    }
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

    const result: GenerateOnceResult = {
      status: "generated",
      jobId: job.id,
      topicId: chosenTopicId,
      plannedDayNo: chosenTopic.plannedDayNo,
      chosenTopicName,
      postId: post.id,
      approvalMode: cfg.autoApprove ? "auto_approved" : "draft",
      providerUsed: generated.providerUsed,
      fallbackUsed: generated.fallbackUsed,
      imageCount: images.length,
      imageError: imageErrorMessage,
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
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

if (require.main === module) {
  runGenerateOnce()
    .catch((err) => {
      console.error("generate:once failed", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
