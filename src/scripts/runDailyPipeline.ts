import { pool } from "../db/pool";
import {
  createDefaultDailyPipelineSteps,
  runPipelineSteps,
  type PipelineContext,
  type PipelineStep,
  type PipelineStepResult,
} from "../services/dailyPipeline";
import { getTodayRunDate } from "../services/pipelineJobs";

export async function runDailyPipeline(options: {
  context?: Partial<PipelineContext>;
  steps?: PipelineStep[];
} = {}): Promise<PipelineStepResult[]> {
  const context: PipelineContext = {
    runDate: options.context?.runDate ?? getTodayRunDate(),
    scheduledSlot: options.context?.scheduledSlot ?? "default",
    source: options.context?.source ?? "daily_pipeline",
    ...(options.context?.jobId ? { jobId: options.context.jobId } : {}),
    ...(options.context?.dryRun ? { dryRun: options.context.dryRun } : {}),
    state: options.context?.state ?? {},
  };
  const steps = options.steps ?? createDefaultDailyPipelineSteps();

  console.log(
    JSON.stringify(
      {
        pipeline: "daily",
        steps: steps.map((step) => step.name),
        status: "started",
        runDate: context.runDate,
        scheduledSlot: context.scheduledSlot,
      },
      null,
      2
    )
  );

  const results = await runPipelineSteps(context, steps);

  console.log(
    JSON.stringify(
      {
        pipeline: "daily",
        steps: steps.map((step) => step.name),
        status: "completed",
        runDate: context.runDate,
        scheduledSlot: context.scheduledSlot,
      },
      null,
      2
    )
  );

  return results;
}

if (require.main === module) {
  runDailyPipeline()
    .catch((err) => {
      console.error("daily:pipeline failed", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
