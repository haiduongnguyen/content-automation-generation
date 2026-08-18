import { loadConfig } from "../config/env";
import { ensureJobArtifactDir, writeArtifactBestEffort, writeJsonArtifact, writeTextArtifactBestEffort } from "./artifacts";
import { buildPostTextOperationKey, buildTextGenerationPrompts } from "./contentGenerator";
import {
  applyAutoApprovalForContext,
  buildGeneratedGenerateResult,
  buildSkippedGenerateResult,
  generateImagesForContext,
  generateTextForContext,
  markGenerationJobFailed,
  markGenerationJobGenerated,
  markGenerationJobGenerating,
  persistImagesForContext,
  persistPostDraftForContext,
  prepareGenerationContext,
  shouldSkipGenerationForExistingPost,
  summarizeImagesForArtifact,
  type GenerateOnceResult,
  type GenerationContext,
} from "./generationPipeline";
import { insertPipelineJobEvent } from "./pipelineJobs";
import { logError, logInfo } from "./logger";
import { runDailyReportEmail } from "../scripts/dailyReportEmail";
import { runPublishOnce, type PublishOnceResult } from "../scripts/publishOnce";
import { runPublishReel } from "../scripts/publishReel";
import { runReelPrototype } from "./reels/reelPrototype";
import { getReelByPostId } from "./reels/reelRepository";

export type PipelineStepName =
  | "plan_topic"
  | "generate_text"
  | "generate_image"
  | "approve_or_wait"
  | "publish"
  | "reel"
  | "report";

export type PipelineStepStatus = "completed" | "skipped" | "failed";
export type PipelineSource = "daily_pipeline" | "worker" | "manual";

export type PipelineStepResult = {
  step: PipelineStepName;
  status: PipelineStepStatus;
  message?: string;
  payload?: Record<string, unknown>;
};

export type PipelineContext = {
  jobId?: number;
  runDate: string;
  scheduledSlot: string;
  source: PipelineSource;
  dryRun?: boolean;
  state?: Record<string, unknown>;
};

export type PipelineStep = {
  name: PipelineStepName;
  run(context: PipelineContext): Promise<PipelineStepResult>;
};

export type PipelineEvent = {
  eventType: string;
  message: string;
  payload: Record<string, unknown>;
};

export function buildPipelineEvent(args: PipelineStepResult): PipelineEvent {
  return {
    eventType: `${args.step}_${args.status}`,
    message: args.message ?? `${args.step} ${args.status}`,
    payload: args.payload ?? {},
  };
}

export async function recordPipelineStepEvent(context: PipelineContext, result: PipelineStepResult): Promise<void> {
  if (!context.jobId) {
    return;
  }
  const event = buildPipelineEvent(result);
  await insertPipelineJobEvent({
    jobId: context.jobId,
    eventType: event.eventType,
    message: event.message,
    payload: event.payload,
  });
}

export async function runPipelineSteps(context: PipelineContext, steps: PipelineStep[]): Promise<PipelineStepResult[]> {
  const results: PipelineStepResult[] = [];

  if (context.jobId) {
    try {
      await ensureJobArtifactDir(context.jobId);
      await writeJsonArtifact(context.jobId, "manifest.json", {
        jobId: context.jobId,
        runDate: context.runDate,
        scheduledSlot: context.scheduledSlot,
        source: context.source,
        steps: steps.map((step) => step.name),
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown artifact initialization error";
      console.warn(`artifact initialization skipped: ${message}`);
    }
  }

  for (const step of steps) {
    const startedAt = Date.now();
    try {
      const result = await step.run(context);
      const resultWithDuration: PipelineStepResult = {
        ...result,
        payload: { ...(result.payload ?? {}), durationMs: Date.now() - startedAt },
      };
      results.push(resultWithDuration);
      await recordPipelineStepEvent(context, resultWithDuration);
      await writeArtifactBestEffort(context.jobId, `steps/${step.name}.json`, {
        ...resultWithDuration,
        recordedAt: new Date().toISOString(),
      });
      logInfo("pipeline step completed", {
        step: step.name,
        status: resultWithDuration.status,
        runDate: context.runDate,
        scheduledSlot: context.scheduledSlot,
        source: context.source,
        durationMs: resultWithDuration.payload?.durationMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown pipeline step error";
      const failedResult: PipelineStepResult = {
        step: step.name,
        status: "failed",
        message,
        payload: { source: context.source, runDate: context.runDate, scheduledSlot: context.scheduledSlot, durationMs: Date.now() - startedAt },
      };
      results.push(failedResult);
      await recordPipelineStepEvent(context, failedResult);
      await writeArtifactBestEffort(context.jobId, `steps/${step.name}.json`, {
        ...failedResult,
        recordedAt: new Date().toISOString(),
      });
      logError("pipeline step failed", {
        step: step.name,
        runDate: context.runDate,
        scheduledSlot: context.scheduledSlot,
        source: context.source,
        durationMs: failedResult.payload?.durationMs,
        errorMessage: message,
      });
      throw err;
    }
  }

  return results;
}

export function getDailyPipelineSteps(args: { reportEmailEnabled: boolean; reelsEnabled?: boolean }): PipelineStepName[] {
  const steps: PipelineStepName[] = [
    "plan_topic",
    "generate_text",
    "generate_image",
    "approve_or_wait",
    "publish",
  ];
  if (args.reelsEnabled) {
    steps.push("reel");
  }
  if (args.reportEmailEnabled) {
    steps.push("report");
  }
  return steps;
}

function getGenerateResult(context: PipelineContext): GenerateOnceResult | null {
  return (context.state?.generateResult as GenerateOnceResult | undefined) ?? null;
}

function getGenerationContext(context: PipelineContext): GenerationContext | null {
  return (context.state?.generationContext as GenerationContext | undefined) ?? null;
}

function toPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function getPipelinePostId(context: PipelineContext): number | null {
  const publishResult = context.state?.publishResult as PublishOnceResult | undefined;
  if (publishResult && (publishResult.status === "published" || publishResult.status === "already_published")) {
    const postId = Number(publishResult.postId);
    return Number.isFinite(postId) ? postId : null;
  }
  const generateResult = getGenerateResult(context);
  if (generateResult && (generateResult.status === "generated" || generateResult.status === "skipped")) {
    const postId = Number(generateResult.postId);
    return Number.isFinite(postId) ? postId : null;
  }
  return null;
}

export function createDailyPipelineSteps(args: { reportEmailEnabled: boolean; reelsEnabled?: boolean }): PipelineStep[] {
  const stepNames = getDailyPipelineSteps(args);
  const stepsByName: Record<PipelineStepName, PipelineStep> = {
    plan_topic: {
      name: "plan_topic",
      async run(context) {
        const generationContext = await prepareGenerationContext({ runDate: context.runDate, scheduledSlot: context.scheduledSlot });
        context.state = { ...(context.state ?? {}), generationContext };
        await writeArtifactBestEffort(context.jobId, "generation/topic.json", {
          runDate: context.runDate,
          scheduledSlot: context.scheduledSlot,
          source: context.source,
          contentJobId: generationContext.job.id,
          topic: generationContext.chosenTopic,
          existingPostId: generationContext.existingPost?.id ?? null,
        });
        return {
          step: "plan_topic",
          status: "completed",
          message:
            generationContext.chosenTopic.topicSource === "fallback_topics"
              ? `Quarterly topic missing; using static fallback ${generationContext.chosenTopic.topicName}`
              : `Resolved topic ${generationContext.chosenTopic.topicName}`,
          payload: {
            runDate: context.runDate,
            scheduledSlot: context.scheduledSlot,
            source: context.source,
            jobId: generationContext.job.id,
            topicId: generationContext.chosenTopic.topicId,
            plannedDayNo: generationContext.chosenTopic.plannedDayNo,
            chosenTopicName: generationContext.chosenTopic.topicName,
            topicSource: generationContext.chosenTopic.topicSource,
            quarterlyTopicMissing: generationContext.chosenTopic.topicSource === "fallback_topics",
            existingPostId: generationContext.existingPost?.id ?? null,
          },
        };
      },
    },
    generate_text: {
      name: "generate_text",
      async run(context) {
        const generationContext =
          getGenerationContext(context) ?? (await prepareGenerationContext({ runDate: context.runDate, scheduledSlot: context.scheduledSlot }));
        context.state = { ...(context.state ?? {}), generationContext };

        if (generationContext.existingPost && shouldSkipGenerationForExistingPost(generationContext)) {
          const result = buildSkippedGenerateResult(generationContext, generationContext.existingPost);
          context.state = { ...(context.state ?? {}), generateResult: result };
          return {
            step: "generate_text",
            status: "skipped",
            message: `Generate skipped for existing post ${result.postId}`,
            payload: toPayload(result),
          };
        }

        try {
          await markGenerationJobGenerating(generationContext);
          await generateTextForContext(generationContext);
          await persistPostDraftForContext(generationContext);
          const prompts = buildTextGenerationPrompts(
            generationContext.chosenTopic.topicName,
            buildPostTextOperationKey(generationContext.job.id, generationContext.chosenTopic.topicName)
          );
          await writeTextArtifactBestEffort(context.jobId, "generation/text_system_prompt.txt", prompts.systemPrompt);
          await writeTextArtifactBestEffort(context.jobId, "generation/text_user_prompt.txt", prompts.userPrompt);
          await writeArtifactBestEffort(context.jobId, "generation/parsed_content.json", generationContext.generated?.content);
          await writeArtifactBestEffort(context.jobId, "generation/text_provider_result.json", {
            providerUsed: generationContext.generated?.providerUsed ?? null,
            fallbackUsed: generationContext.generated?.fallbackUsed ?? null,
            providerMetadata: generationContext.generated?.providerMetadata ?? null,
            postId: generationContext.post?.id ?? null,
          });
        } catch (err) {
          await markGenerationJobFailed(generationContext, err);
          throw err;
        }

        return {
          step: "generate_text",
          status: "completed",
          message: generationContext.resumedExistingDraft
            ? `Resumed existing draft ${generationContext.post?.id}`
            : `Generated post text for draft ${generationContext.post?.id}`,
          payload: {
            jobId: generationContext.job.id,
            postId: generationContext.post?.id ?? null,
            topicId: generationContext.chosenTopic.topicId,
            plannedDayNo: generationContext.chosenTopic.plannedDayNo,
            chosenTopicName: generationContext.chosenTopic.topicName,
            providerUsed: generationContext.generated?.providerUsed ?? null,
            fallbackUsed: generationContext.generated?.fallbackUsed ?? null,
            providerMetadata: generationContext.generated?.providerMetadata ?? null,
            resumedExistingDraft: generationContext.resumedExistingDraft,
          },
        };
      },
    },
    generate_image: {
      name: "generate_image",
      async run(context) {
        const result = getGenerateResult(context);
        if (result?.status === "skipped") {
          return {
            step: "generate_image",
            status: "skipped",
            message: "Image generation skipped because text generation was skipped",
            payload: toPayload(result),
          };
        }
        const generationContext = getGenerationContext(context);
        if (!generationContext) {
          return {
            step: "generate_image",
            status: "skipped",
            message: "Image generation skipped because generation context is missing",
          };
        }

        try {
          if (generationContext.existingImageCount === 0) {
            await generateImagesForContext(generationContext);
            await persistImagesForContext(generationContext);
          }
          const imageSummary = summarizeImagesForArtifact(generationContext.images);
          const firstPrompt = typeof imageSummary[0]?.prompt === "string" ? imageSummary[0].prompt : "";
          if (firstPrompt) {
            await writeTextArtifactBestEffort(context.jobId, "generation/image_prompt.txt", firstPrompt);
          }
          await writeArtifactBestEffort(context.jobId, "generation/image_results.json", {
            postId: generationContext.post?.id ?? null,
            imageCount: generationContext.images.length,
            images: imageSummary,
          });
        } catch (err) {
          await markGenerationJobFailed(generationContext, err);
          throw err;
        }

        if (generationContext.imageErrorMessage) {
          await writeArtifactBestEffort(context.jobId, "generation/image_error.json", {
            postId: generationContext.post?.id ?? null,
            imageError: generationContext.imageErrorMessage,
          });
          return {
            step: "generate_image",
            status: "skipped",
            message: generationContext.imageErrorMessage,
            payload: {
              jobId: generationContext.job.id,
              postId: generationContext.post?.id ?? null,
              imageError: generationContext.imageErrorMessage,
            },
          };
        }
        return {
          step: "generate_image",
          status: generationContext.images.length > 0 || generationContext.existingImageCount > 0 ? "completed" : "skipped",
          message:
            generationContext.existingImageCount > 0
              ? `Reused ${generationContext.existingImageCount} existing image(s) for post ${generationContext.post?.id}`
              : generationContext.images.length > 0
              ? `Generated ${generationContext.images.length} image(s) for post ${generationContext.post?.id}`
              : "Image generation disabled or returned no images",
          payload: {
            jobId: generationContext.job.id,
            postId: generationContext.post?.id ?? null,
            imageCount: generationContext.existingImageCount || generationContext.images.length,
            imageRoles: generationContext.images.map((image) => image.role),
            reusedExistingImages: generationContext.existingImageCount > 0,
          },
        };
      },
    },
    approve_or_wait: {
      name: "approve_or_wait",
      async run(context) {
        const result = getGenerateResult(context);
        const generationContext = getGenerationContext(context);
        if (!result && !generationContext) {
          return {
            step: "approve_or_wait",
            status: "skipped",
            message: "No generated post result available",
          };
        }
        if (result?.status === "skipped") {
          const approved = ["approved", "auto_approved"].includes(result.approvalStatus);
          return {
            step: "approve_or_wait",
            status: approved ? "completed" : "skipped",
            message: approved
              ? `Existing post ${result.postId} is ${result.approvalStatus}`
              : `Existing post ${result.postId} awaits approval`,
            payload: toPayload(result),
          };
        }
        if (!generationContext) {
          return {
            step: "approve_or_wait",
            status: "skipped",
            message: "No generation context available",
            payload: toPayload(result),
          };
        }

        try {
          await applyAutoApprovalForContext(generationContext);
          await markGenerationJobGenerated(generationContext);
        } catch (err) {
          await markGenerationJobFailed(generationContext, err);
          throw err;
        }

        const completedResult = buildGeneratedGenerateResult(generationContext);
        context.state = { ...(context.state ?? {}), generateResult: completedResult };
        return {
          step: "approve_or_wait",
          status: completedResult.approvalMode === "auto_approved" ? "completed" : "skipped",
          message:
            completedResult.approvalMode === "auto_approved"
              ? `Post ${completedResult.postId} auto-approved`
              : `Post ${completedResult.postId} created as draft and awaits approval`,
          payload: toPayload(completedResult),
        };
      },
    },
    publish: {
      name: "publish",
      async run(context) {
        const generateResult = getGenerateResult(context);
        const postId =
          generateResult && (generateResult.status === "generated" || generateResult.status === "skipped")
            ? Number(generateResult.postId)
            : undefined;
        const result: PublishOnceResult = Number.isFinite(postId) ? await runPublishOnce({ postId: postId as number }) : await runPublishOnce();
        context.state = { ...(context.state ?? {}), publishResult: result };
        if (result.status === "published") {
          return {
            step: "publish",
            status: "completed",
            message: `Published post ${result.postId}`,
            payload: toPayload(result),
          };
        }
        if (result.status === "already_published") {
          return {
            step: "publish",
            status: "completed",
            message: `Post ${result.postId} already published; continuing to Reel step`,
            payload: toPayload(result),
          };
        }
        return {
          step: "publish",
          status: "skipped",
          message: result.reason,
          payload: toPayload(result),
        };
      },
    },
    reel: {
      name: "reel",
      async run(context) {
        const postId = getPipelinePostId(context);
        if (!postId) {
          return {
            step: "reel",
            status: "skipped",
            message: "Reel skipped because no pipeline post was resolved",
            payload: {},
          };
        }

        const existingReel = await getReelByPostId(postId);
        if (existingReel?.status === "published" && existingReel.platform_reel_id) {
          const alreadyPublished = await runPublishReel(postId);
          await writeArtifactBestEffort(context.jobId, "reel/published.json", alreadyPublished);
          return {
            step: "reel",
            status: "completed",
            message: `Reel already published for post ${postId}`,
            payload: toPayload(alreadyPublished),
          };
        }

        const rendered = await runReelPrototype(postId);
        await writeArtifactBestEffort(context.jobId, "reel/rendered.json", rendered);
        const published = await runPublishReel(postId);
        await writeArtifactBestEffort(context.jobId, "reel/published.json", published);

        return {
          step: "reel",
          status: "completed",
          message: `Rendered and published Reel for post ${postId}`,
          payload: toPayload(published),
        };
      },
    },
    report: {
      name: "report",
      async run() {
        const result = await runDailyReportEmail();
        if (result.status === "sent") {
          return {
            step: "report",
            status: "completed",
            message: `Sent report to ${result.to}`,
            payload: toPayload(result),
          };
        }
        return {
          step: "report",
          status: "skipped",
          message: result.reason,
          payload: toPayload(result),
        };
      },
    },
  };

  return stepNames.map((name) => stepsByName[name]);
}

export function createDefaultDailyPipelineSteps(): PipelineStep[] {
  const cfg = loadConfig();
  return createDailyPipelineSteps({ reportEmailEnabled: cfg.reportEmailEnabled, reelsEnabled: cfg.reelsEnabled });
}
