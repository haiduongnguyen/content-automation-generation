export type ReelRenderMethod = "ffmpeg_slideshow" | "remotion" | "hybrid_ai";

export type ReelStatus =
  | "draft"
  | "planning"
  | "rendering"
  | "rendered"
  | "failed";

export type ReelApprovalStatus = "draft" | "approved" | "auto_approved" | "rejected";

export type ReelScene = {
  id: string;
  type: string;
  durationSeconds: number;
  narration: string;
  caption: string;
  visualPrompt?: string;
  assetKey?: string;
  metadata?: Record<string, unknown>;
};

export type ReelRenderInput = {
  reelId: number;
  title: string;
  script: string;
  scenes: ReelScene[];
  voiceoverKey: string;
  captionsKey?: string;
  outputKey: string;
};

export type ReelRenderResult = {
  method: ReelRenderMethod;
  videoKey: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  fileSizeBytes: number;
  sha256: string;
  metadata?: Record<string, unknown>;
};
