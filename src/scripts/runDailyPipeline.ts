import { loadConfig } from "../config/env";
import { pool } from "../db/pool";
import { buildDailyPipelineEvent, getDailyPipelineSteps, type DailyPipelineEvent } from "../services/dailyPipeline";
import { runDailyReportEmail } from "./dailyReportEmail";
import { runGenerateOnce } from "./generateOnce";
import { runPublishOnce } from "./publishOnce";

export async function runDailyPipeline(options: {
  onEvent?: (event: DailyPipelineEvent) => Promise<void>;
} = {}): Promise<void> {
  const cfg = loadConfig();
  const steps = getDailyPipelineSteps({ reportEmailEnabled: cfg.reportEmailEnabled });

  console.log(JSON.stringify({ pipeline: "daily", steps, status: "started" }, null, 2));

  const generateResult = await runGenerateOnce();
  await options.onEvent?.(
    buildDailyPipelineEvent({
      step: "generate",
      status: generateResult.status === "skipped" ? "skipped" : "completed",
      message:
        generateResult.status === "skipped"
          ? `Generate skipped for existing post ${generateResult.postId}`
          : `Generated post ${generateResult.postId}`,
      payload: generateResult,
    })
  );

  const publishResult = await runPublishOnce();
  await options.onEvent?.(
    buildDailyPipelineEvent({
      step: "publish",
      status: publishResult.status === "published" ? "completed" : "skipped",
      message:
        publishResult.status === "published"
          ? `Published post ${publishResult.postId}`
          : publishResult.reason,
      payload: publishResult,
    })
  );

  if (steps.includes("report")) {
    const reportResult = await runDailyReportEmail();
    await options.onEvent?.(
      buildDailyPipelineEvent({
        step: "report",
        status: reportResult.status === "sent" ? "completed" : "skipped",
        message:
          reportResult.status === "sent"
            ? `Sent report to ${reportResult.to}`
            : reportResult.reason,
        payload: reportResult,
      })
    );
  } else {
    console.log("REPORT_EMAIL_ENABLED is false. Skip report step.");
    await options.onEvent?.(
      buildDailyPipelineEvent({
        step: "report",
        status: "skipped",
        message: "REPORT_EMAIL_ENABLED is false",
        payload: { status: "skipped", reason: "REPORT_EMAIL_ENABLED is false" },
      })
    );
  }

  console.log(JSON.stringify({ pipeline: "daily", steps, status: "completed" }, null, 2));
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
