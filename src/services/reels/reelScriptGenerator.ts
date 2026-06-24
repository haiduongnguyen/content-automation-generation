export type ReelScriptInput = {
  topic: string;
  postTitle: string;
  postBody: string;
  targetDurationSeconds: number;
  language: "vi";
};

export type ReelScriptResult = {
  title: string;
  hook: string;
  narration: string;
  callToAction: string;
  scenes: ReelScriptScene[];
};

export type ReelScriptScene = {
  id: "hook" | "insight" | "cta";
  targetSeconds: number;
  narration: string;
  caption: string;
};

export interface ReelScriptGenerator {
  generate(input: ReelScriptInput): Promise<ReelScriptResult>;
}
