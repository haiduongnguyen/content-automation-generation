import type { AppConfig } from "../../../config/env";
import type { ImageProvider, ImageProviderRequest } from "../types";

type OpenAiImageResponse = {
  data?: Array<{
    b64_json?: string;
  }>;
};

export function createOpenAiImageProvider(cfg: AppConfig): ImageProvider {
  return {
    name: "openai",
    model: "gpt-image-1",
    async generate(request: ImageProviderRequest) {
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.openAiApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt: request.prompt,
          size: "1024x1024",
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI image request failed: HTTP ${response.status} ${errText}`);
      }

      const payload = (await response.json()) as OpenAiImageResponse;
      const b64 = payload.data?.[0]?.b64_json;
      if (!b64 || b64.trim() === "") {
        throw new Error("OpenAI image response missing b64_json.");
      }

      return {
        provider: "openai",
        model: "gpt-image-1",
        output: [
          {
            role: request.role,
            prompt: request.prompt,
            mimeType: "image/png",
            b64Data: b64,
          },
        ],
        raw: payload,
      };
    },
  };
}
