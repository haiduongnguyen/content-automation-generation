import type { ReelScene } from "./types";
import type { ReelScriptResult } from "./reelScriptGenerator";

export type ReelScenePlanInput = {
  reelId: number;
  script: ReelScriptResult;
  targetDurationSeconds: number;
};

export interface ReelScenePlanner {
  plan(input: ReelScenePlanInput): Promise<ReelScene[]>;
}
