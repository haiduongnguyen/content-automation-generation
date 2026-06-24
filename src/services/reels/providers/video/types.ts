export type GeneratedVideoRequest = {
  prompt: string;
  aspectRatio: "9:16";
  durationSeconds: number;
  referenceImageKey?: string;
};

export type GeneratedVideoResult = {
  provider: string;
  videoKey: string;
  durationSeconds: number;
  costUsd?: number;
  metadata?: Record<string, unknown>;
};

export interface VideoGenerationProvider {
  readonly name: string;
  generate(request: GeneratedVideoRequest): Promise<GeneratedVideoResult>;
}
