import type { AppConfig } from "../../../config/env";
import { hashProviderRequest, runCachedProviderOperation } from "../../providerOperations";
import { fetchWithTimeout, isRetryableHttpStatus, ProviderError, withLatencyMetadata } from "../errors";
import type { ImageProvider, ImageProviderRequest, ProviderResult } from "../types";
import type { GeneratedImage } from "../../postImageGenerator";

type QwenImagePayload = {
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{
          image?: string;
        }>;
      };
    }>;
  };
  usage?: Record<string, unknown>;
  request_id?: string;
  code?: string;
  message?: string;
};

function imageSizeForQwen(size: string): string {
  if (size === "512x512" || size === "1024x1024") {
    return "1328*1328";
  }
  return size.replace("x", "*");
}

function extractQwenImageUrl(payload: QwenImagePayload): string | null {
  const content = payload.output?.choices?.[0]?.message?.content ?? [];
  for (const part of content) {
    if (part.image && part.image.trim() !== "") {
      return part.image;
    }
  }
  return null;
}

function dataUrlToImage(value: string): { mimeType: string; b64Data: string } | null {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match?.[1] || !match?.[2]) {
    return null;
  }
  return { mimeType: match[1], b64Data: match[2] };
}

async function downloadImageAsBase64(url: string, startedAt: number, provider: string, model: string): Promise<{ mimeType: string; b64Data: string }> {
  const dataUrl = dataUrlToImage(url);
  if (dataUrl) {
    return dataUrl;
  }
  const response = await fetchWithTimeout(url, {});
  if (!response.ok) {
    const errText = await response.text();
    throw new ProviderError({
      provider,
      model,
      code: "image_download_failed",
      message: `${provider} image download failed: HTTP ${response.status} ${errText}`,
      retryable: isRetryableHttpStatus(response.status),
      statusCode: response.status,
      latencyMs: Date.now() - startedAt,
      raw: errText,
    });
  }
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const b64Data = Buffer.from(await response.arrayBuffer()).toString("base64");
  return { mimeType, b64Data };
}

export function createQwenImageProvider(cfg: AppConfig, model = cfg.qwenImageModel): ImageProvider {
  return {
    name: "qwen",
    model,
    async generate(request: ImageProviderRequest): Promise<ProviderResult<GeneratedImage[]>> {
      const baseUrl = cfg.qwenImageBaseUrl.replace(/\/$/, "");
      if (!baseUrl) {
        throw new ProviderError({ provider: "qwen", model, code: "invalid_config", message: "qwen: image base URL is not configured.", retryable: false });
      }
      if (!cfg.qwenApiKey) {
        throw new ProviderError({ provider: "qwen", model, code: "invalid_config", message: "qwen: API key is not configured.", retryable: false });
      }

      const requestBody = {
        model,
        input: {
          messages: [
            {
              role: "user",
              content: [{ text: request.prompt }],
            },
          ],
        },
        parameters: {
          prompt_extend: false,
          n: 1,
          size: imageSizeForQwen(cfg.imageOutputSize),
          negative_prompt: "text, letters, words, numbers, captions, labels, title, watermark, logo, malformed typography, Vietnamese text, English text",
          watermark: false,
        },
      };
      const requestHash = hashProviderRequest(requestBody);

      return runCachedProviderOperation({
        operationKey: request.operationKey ? `${request.operationKey}:${model}:${requestHash}` : undefined,
        operationType: request.operationType,
        provider: "qwen",
        model,
        requestHash,
        maxAttempts: cfg.geminiOperationMaxAttempts || 2,
        execute: async () => {
          const startedAt = Date.now();
          try {
            const response = await fetchWithTimeout(`${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${cfg.qwenApiKey}`,
              },
              body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
              const errText = await response.text();
              throw new ProviderError({
                provider: "qwen",
                model,
                code: "http_error",
                message: `Qwen image request failed: HTTP ${response.status} ${errText}`,
                retryable: isRetryableHttpStatus(response.status),
                statusCode: response.status,
                latencyMs: Date.now() - startedAt,
                raw: errText,
              });
            }

            const payload = (await response.json()) as QwenImagePayload;
            const imageUrl = extractQwenImageUrl(payload);
            if (!imageUrl) {
              throw new ProviderError({
                provider: "qwen",
                model,
                code: "missing_output",
                message: "Qwen image response missing image URL.",
                retryable: false,
                latencyMs: Date.now() - startedAt,
                raw: payload,
              });
            }
            const image = await downloadImageAsBase64(imageUrl, startedAt, "qwen", model);
            return withLatencyMetadata(
              {
                provider: "qwen",
                model,
                output: [
                  {
                    role: request.role,
                    prompt: request.prompt,
                    mimeType: image.mimeType,
                    b64Data: image.b64Data,
                  },
                ],
                raw: payload,
                metadata: { usage: payload.usage ?? null, requestId: payload.request_id ?? null },
              },
              startedAt
            );
          } catch (err) {
            if (err instanceof ProviderError) {
              throw err;
            }
            throw new ProviderError({
              provider: "qwen",
              model,
              code: "network_error",
              message: err instanceof Error ? err.message : "Qwen image network error.",
              retryable: true,
              latencyMs: Date.now() - startedAt,
              cause: err,
            });
          }
        },
      });
    },
  };
}
