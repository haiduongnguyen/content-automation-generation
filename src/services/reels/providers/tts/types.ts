export type TextToSpeechRequest = {
  text: string;
  language: "vi";
  voice?: string;
};

export type TextToSpeechResult = {
  audio: Buffer;
  mimeType: string;
  provider: string;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
};

export interface TextToSpeechProvider {
  readonly name: string;
  synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResult>;
}
