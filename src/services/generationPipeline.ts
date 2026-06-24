import { loadConfig } from "../config/env";
import { pool } from "../db/pool";
import { queryManyFromFile, queryOneFromFile } from "../db/sqlRunner";
import { generatePostContent, type GeneratedContentResult } from "./contentGenerator";
import { chooseTopic, pickPlannedTopic, type ChosenTopic } from "./contentPlan";
import { logOpenAiUsage } from "./openAiQuota";
import {
  shouldResumeGenerateForExistingPost,
  shouldSkipGenerateForExistingPost,
  type ExistingPostForJob,
} from "./postDuplicateGuard";
import { generatePostImages, shouldContinueAfterImageFailure, type GeneratedImage } from "./postImageGenerator";
import { getVietnamDateString } from "../utils/dateTime";

type JobRow = { id: string; scheduled_slot?: string };
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

export type GenerationContext = {
  runDate: string;
  scheduledSlot: string;
  now: Date;
  job: JobRow;
  chosenTopic: ChosenTopic;
  existingPost: ExistingPostForJob | null;
  generated?: GeneratedContentResult;
  post?: PostRow;
  images: GeneratedImage[];
  existingImageCount: number;
  resumedExistingDraft: boolean;
  imageErrorMessage: string | null;
};

export function dateFromRunDate(runDate: string): Date {
  return new Date(`${runDate}T12:00:00+07:00`);
}

export function buildGeneratedPostContentText(content: GeneratedContentResult["content"]): string {
  return [content.title, content.body, content.cta].filter(Boolean).join("\n\n");
}

export function summarizeImagesForArtifact(images: GeneratedImage[]): Array<Record<string, unknown>> {
  return images.map((image) => ({
    role: image.role,
    prompt: image.prompt,
    mimeType: image.mimeType,
    b64Bytes: Buffer.byteLength(image.b64Data, "base64"),
  }));
}

export function buildSkippedGenerateResult(
  context: GenerationContext,
  existingPost: ExistingPostForJob
): Extract<GenerateOnceResult, { status: "skipped" }> {
  return {
    status: "skipped",
    reason: "Existing post already generated for job",
    jobId: context.job.id,
    postId: existingPost.id,
    approvalStatus: existingPost.approval_status,
  };
}

export function buildGeneratedGenerateResult(context: GenerationContext): Extract<GenerateOnceResult, { status: "generated" }> {
  if (!context.generated || !context.post) {
    throw new Error("Cannot build generated result before text generation and draft persistence complete.");
  }
  const cfg = loadConfig();
  return {
    status: "generated",
    jobId: context.job.id,
    topicId: context.chosenTopic.topicId,
    plannedDayNo: context.chosenTopic.plannedDayNo,
    chosenTopicName: context.chosenTopic.topicName,
    postId: context.post.id,
    approvalMode: cfg.autoApprove ? "auto_approved" : "draft",
    providerUsed: context.generated.providerUsed,
    fallbackUsed: context.generated.fallbackUsed,
    imageCount: context.existingImageCount || context.images.length,
    imageError: context.imageErrorMessage,
  };
}

export async function prepareGenerationContext(options: { runDate?: string; scheduledSlot?: string } = {}): Promise<GenerationContext> {
  const now = options.runDate ? dateFromRunDate(options.runDate) : new Date();
  const runDate = options.runDate ?? getVietnamDateString(now);
  const scheduledSlot = options.scheduledSlot ?? "default";
  const job = await queryOneFromFile<JobRow>("001_create_daily_job.sql", { run_date: runDate, scheduled_slot: scheduledSlot });
  const planned = await pickPlannedTopic(now, scheduledSlot);
  const fallbackTopic = planned ? null : await queryOneFromFile<TopicRow>("002_pick_weighted_topic.sql");
  const chosenTopic = chooseTopic(planned, fallbackTopic);
  if (!planned) {
    console.warn(
      JSON.stringify({
        warning: "quarterly_topic_missing",
        runDate,
        scheduledSlot,
        fallbackTopic: chosenTopic.topicName,
      })
    );
  }
  const existingPosts = await queryManyFromFile<ExistingPostForJob>("033_get_existing_post_for_job.sql", {
    job_id: Number(job.id),
  });
  const existingPost = existingPosts[0] ?? null;
  const resumedExistingDraft = shouldResumeGenerateForExistingPost(existingPost);
  const context: GenerationContext = {
    runDate,
    scheduledSlot,
    now,
    job,
    chosenTopic,
    existingPost,
    images: [],
    existingImageCount: Number(existingPost?.image_count ?? 0),
    resumedExistingDraft,
    imageErrorMessage: null,
  };

  if (resumedExistingDraft && existingPost) {
    const hashtags = Array.isArray(existingPost.hashtags)
      ? existingPost.hashtags.map((value) => String(value))
      : [];
    context.generated = {
      content: {
        title: existingPost.title ?? "",
        body: existingPost.body,
        cta: existingPost.cta ?? "",
        hashtags,
      },
      providerUsed: existingPost.provider_used ?? "existing_post",
      fallbackUsed: existingPost.fallback_used,
      providerMetadata: { resumedExistingDraft: true },
    };
    context.post = { id: existingPost.id };
  }

  return context;
}

export function shouldSkipGenerationForExistingPost(context: GenerationContext): boolean {
  return shouldSkipGenerateForExistingPost(context.existingPost);
}

export async function markGenerationJobGenerating(context: GenerationContext): Promise<void> {
  await queryOneFromFile("003_mark_job_generating.sql", { job_id: Number(context.job.id) });
}

export async function generateTextForContext(context: GenerationContext): Promise<GeneratedContentResult> {
  if (context.resumedExistingDraft && context.generated) {
    return context.generated;
  }
  const generated = await generatePostContent(
    context.chosenTopic.topicName,
    `post_text:job:${context.job.id}:${context.chosenTopic.topicName}`
  );
  context.generated = generated;
  if (generated.providerUsed === "openai") {
    await logOpenAiUsage({ topicName: context.chosenTopic.topicName, status: "success" });
  }
  return generated;
}

export async function persistPostDraftForContext(context: GenerationContext): Promise<PostRow> {
  if (context.resumedExistingDraft && context.post) {
    return context.post;
  }
  if (!context.generated) {
    throw new Error("Cannot persist post draft before text generation completes.");
  }
  const cfg = loadConfig();
  const post = await queryOneFromFile<PostRow>("004_insert_post_draft.sql", {
    job_id: Number(context.job.id),
    topic_id: context.chosenTopic.topicId,
    title: context.generated.content.title,
    body: context.generated.content.body,
    cta: context.generated.content.cta,
    hashtags_json: JSON.stringify(context.generated.content.hashtags),
    tone: "practical",
    model_name: cfg.openAiModel,
    prompt_version: cfg.promptVersion,
    provider_used: context.generated.providerUsed,
    fallback_used: context.generated.fallbackUsed,
  });
  context.post = post;
  return post;
}

export async function generateImagesForContext(context: GenerationContext): Promise<GeneratedImage[]> {
  if (!context.generated) {
    throw new Error("Cannot generate images before text generation completes.");
  }
  const cfg = loadConfig();
  if (context.existingImageCount > 0) {
    return [];
  }
  try {
    const images = await generatePostImages({
      topicName: context.chosenTopic.topicName,
      postContent: buildGeneratedPostContentText(context.generated.content),
      seedDate: `${context.runDate}:${context.scheduledSlot}`,
      operationKey: `post_image:job:${context.job.id}:${context.runDate}:${context.scheduledSlot}`,
    });
    context.images = images;
    return images;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown image generation error";
    if (!shouldContinueAfterImageFailure(cfg.imageFailureMode)) {
      throw err;
    }
    context.imageErrorMessage = message;
    context.images = [];
    console.warn(`image generation failed; continuing text-only: ${message}`);
    return [];
  }
}

export async function persistImagesForContext(context: GenerationContext): Promise<void> {
  if (!context.post) {
    throw new Error("Cannot persist post images before post draft persistence completes.");
  }
  for (const image of context.images) {
    await queryOneFromFile("019_insert_post_image.sql", {
      post_id: Number(context.post.id),
      image_role: image.role,
      prompt: image.prompt,
      mime_type: image.mimeType,
      image_b64: image.b64Data,
    });
  }
}

export async function applyAutoApprovalForContext(context: GenerationContext): Promise<"auto_approved" | "draft"> {
  if (!context.post) {
    throw new Error("Cannot apply approval before post draft persistence completes.");
  }
  const cfg = loadConfig();
  if (cfg.autoApprove) {
    await pool.query("UPDATE posts SET approval_status='auto_approved' WHERE id=$1", [Number(context.post.id)]);
    return "auto_approved";
  }
  return "draft";
}

export async function markGenerationJobGenerated(context: GenerationContext): Promise<void> {
  await queryOneFromFile("005_mark_job_generated.sql", { job_id: Number(context.job.id) });
}

export async function markGenerationJobFailed(context: GenerationContext, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Unknown generate error";
  if (
    !loadConfig().geminiApiKey &&
    !message.includes("daily request cap") &&
    !message.includes("daily budget") &&
    !message.includes("quota blocked")
  ) {
    await logOpenAiUsage({ topicName: context.chosenTopic.topicName, status: "failed", errorMessage: message });
  }
  await queryOneFromFile("011_mark_job_failed.sql", {
    job_id: Number(context.job.id),
    error_message: message,
  });
}

export async function runGenerationPipeline(options: { runDate?: string; scheduledSlot?: string } = {}): Promise<GenerateOnceResult> {
  const context = await prepareGenerationContext(options);
  try {
    if (context.existingPost && shouldSkipGenerationForExistingPost(context)) {
      return buildSkippedGenerateResult(context, context.existingPost);
    }

    await markGenerationJobGenerating(context);
    await generateTextForContext(context);
    await persistPostDraftForContext(context);
    await generateImagesForContext(context);
    await persistImagesForContext(context);
    await applyAutoApprovalForContext(context);
    await markGenerationJobGenerated(context);
    return buildGeneratedGenerateResult(context);
  } catch (err) {
    await markGenerationJobFailed(context, err);
    throw err;
  }
}
