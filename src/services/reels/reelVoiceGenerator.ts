export type ReelVoiceInput = {
  reelId: number;
  narration: string;
  outputKey: string;
  language: "vi";
};

export type ReelVoiceResult = {
  audioKey: string;
  durationSeconds: number;
  provider: string;
  metadata?: Record<string, unknown>;
};

export interface ReelVoiceGenerator {
  generate(input: ReelVoiceInput): Promise<ReelVoiceResult>;
}
