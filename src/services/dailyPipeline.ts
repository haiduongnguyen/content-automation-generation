export type DailyPipelineStep = "generate" | "publish" | "report";
export type DailyPipelineEventStatus = "started" | "completed" | "skipped" | "failed";

export type DailyPipelineEvent = {
  eventType: string;
  message: string;
  payload: Record<string, unknown>;
};

export function getDailyPipelineSteps(args: { reportEmailEnabled: boolean }): DailyPipelineStep[] {
  const steps: DailyPipelineStep[] = ["generate", "publish"];
  if (args.reportEmailEnabled) {
    steps.push("report");
  }
  return steps;
}

export function buildDailyPipelineEvent(args: {
  step: DailyPipelineStep | "pipeline";
  status: DailyPipelineEventStatus;
  message: string;
  payload?: Record<string, unknown>;
}): DailyPipelineEvent {
  return {
    eventType: `${args.step}_${args.status}`,
    message: args.message,
    payload: args.payload ?? {},
  };
}
