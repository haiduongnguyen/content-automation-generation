import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { fetchWithTimeout } from "../../../providers/errors";
import type { TextToSpeechProvider, TextToSpeechRequest, TextToSpeechResult } from "./types";

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

function parseCredentials(): ServiceAccountCredentials | undefined {
  const raw = process.env.GOOGLE_TTS_CREDENTIALS_JSON?.trim();
  if (!raw) {
    return undefined;
  }
  let parsed: ServiceAccountCredentials;
  try {
    parsed = JSON.parse(raw) as ServiceAccountCredentials;
  } catch {
    throw new Error("GOOGLE_TTS_CREDENTIALS_JSON is not valid JSON.");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_TTS_CREDENTIALS_JSON must contain client_email and private_key.");
  }
  parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  return parsed;
}

export function assertGoogleTtsCredentials(): void {
  if (
    !process.env.TTS_GOOGLE_API_KEY?.trim() &&
    !process.env.GOOGLE_TTS_CREDENTIALS_JSON?.trim() &&
    !process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
  ) {
    throw new Error(
      "Missing Google TTS credentials. Set TTS_GOOGLE_API_KEY, GOOGLE_TTS_CREDENTIALS_JSON, or GOOGLE_APPLICATION_CREDENTIALS."
    );
  }
}

function createClient(): TextToSpeechClient {
  const credentials = parseCredentials();
  if (credentials) {
    return new TextToSpeechClient({
      credentials,
      ...(credentials.project_id ? { projectId: credentials.project_id } : {}),
    });
  }
  assertGoogleTtsCredentials();
  return new TextToSpeechClient();
}

function buildAudioConfig(): { audioEncoding: "MP3"; speakingRate?: number } {
  const voiceName = process.env.REEL_TTS_VOICE?.trim() || "";
  if (voiceName.includes("Chirp3-HD")) {
    return { audioEncoding: "MP3" };
  }
  return {
    audioEncoding: "MP3",
    speakingRate: Number(process.env.REEL_TTS_SPEAKING_RATE || "1.15"),
  };
}

async function synthesizeWithApiKey(request: TextToSpeechRequest, apiKey: string): Promise<TextToSpeechResult> {
  const voiceName = process.env.REEL_TTS_VOICE?.trim();
  const response = await fetchWithTimeout(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: request.text },
        voice: {
          languageCode: "vi-VN",
          ...(voiceName ? { name: voiceName } : { ssmlGender: "NEUTRAL" }),
        },
        audioConfig: buildAudioConfig(),
      }),
    }
  );
  const payload = (await response.json()) as {
    audioContent?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.audioContent) {
    throw new Error(`Google TTS request failed: HTTP ${response.status} ${payload.error?.message || "missing audio"}`);
  }
  return {
    audio: Buffer.from(payload.audioContent, "base64"),
    mimeType: "audio/mpeg",
    provider: "google",
    metadata: { authMode: "api_key" },
  };
}

export function createGoogleTextToSpeechProvider(): TextToSpeechProvider {
  return {
    name: "google",
    async synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResult> {
      const apiKey = process.env.TTS_GOOGLE_API_KEY?.trim();
      if (apiKey) {
        return synthesizeWithApiKey(request, apiKey);
      }
      const client = createClient();
      const voiceName = process.env.REEL_TTS_VOICE?.trim();
      const [response] = await client.synthesizeSpeech({
        input: { text: request.text },
        voice: {
          languageCode: "vi-VN",
          ...(voiceName ? { name: voiceName } : { ssmlGender: "NEUTRAL" }),
        },
        audioConfig: buildAudioConfig(),
      });
      if (!response.audioContent) {
        throw new Error("Google TTS response did not contain audio.");
      }
      const audio =
        typeof response.audioContent === "string"
          ? Buffer.from(response.audioContent, "base64")
          : Buffer.from(response.audioContent);
      return {
        audio,
        mimeType: "audio/mpeg",
        provider: "google",
        metadata: { authMode: "service_account" },
      };
    },
  };
}
