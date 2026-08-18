import type { AppConfig } from "../../../config/env";
import { hashProviderRequest, runCachedProviderOperation } from "../../providerOperations";
import type { GeneratedImage } from "../../postImageGenerator";
import { fetchWithTimeout, isRetryableHttpStatus, ProviderError, withLatencyMetadata } from "../errors";
import type { ImageProvider, ImageProviderRequest, ProviderResult } from "../types";

type GoogleImagenPayload = {
  predictions?: Array<{
    bytesBase64Encoded?: string;
    mimeType?: string;
    mime_type?: string;
  }>;
  generatedImages?: Array<{
    image?: {
      imageBytes?: string;
      mimeType?: string;
    };
  }>;
};

function extractGoogleImagenImage(payload: GoogleImagenPayload): { mimeType: string; b64Data: string } | null {
  const prediction = payload.predictions?.find((item) => item.bytesBase64Encoded && item.bytesBase64Encoded.trim() !== "");
  if (prediction?.bytesBase64Encoded) {
    return {
      mimeType: prediction.mimeType || prediction.mime_type || "image/png",
      b64Data: prediction.bytesBase64Encoded,
    };
  }

  const generated = payload.generatedImages?.find((item) => item.image?.imageBytes && item.image.imageBytes.trim() !== "");
  if (generated?.image?.imageBytes) {
    return {
      mimeType: generated.image.mimeType || "image/png",
      b64Data: generated.image.imageBytes,
    };
  }

  return null;
}

export function createGoogleImagenImageProvider(cfg: AppConfig, model = cfg.googleImagenModel): ImageProvider {
  return {
    name: "google_imagen",
    model,
    async generate(request: ImageProviderRequest): Promise<ProviderResult<GeneratedImage[]>> {
      const requestBody = {
        instances: [{ prompt: request.prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "1:1",
        },
      };
      const requestHash = hashProviderRequest(requestBody);
      return runCachedProviderOperation({
        operationKey: request.operationKey ? `${request.operationKey}:${model}:${requestHash}` : undefined,
        operationType: request.operationType,
        provider: "google_imagen",
        model,
        requestHash,
        maxAttempts: cfg.geminiOperationMaxAttempts || 2,
        execute: async () => {
          const startedAt = Date.now();
          try {
            const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": cfg.geminiImageApiKey || cfg.geminiApiKey,
              },
              body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
              const errText = await response.text();
              throw new ProviderError({
                provider: "google_imagen",
                model,
                code: "http_error",
                message: `Google Imagen request failed: HTTP ${response.status} ${errText}`,
                retryable: isRetryableHttpStatus(response.status),
                statusCode: response.status,
                latencyMs: Date.now() - startedAt,
                raw: errText,
              });
            }

            const payload = (await response.json()) as GoogleImagenPayload;
            const image = extractGoogleImagenImage(payload);
            if (!image) {
              throw new ProviderError({
                provider: "google_imagen",
                model,
                code: "missing_output",
                message: "Google Imagen response missing image data.",
                retryable: false,
                latencyMs: Date.now() - startedAt,
                raw: payload,
              });
            }

            return withLatencyMetadata(
              {
                provider: "google_imagen",
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
              },
              startedAt
            );
          } catch (err) {
            if (err instanceof ProviderError) {
              throw err;
            }
            throw new ProviderError({
              provider: "google_imagen",
              model,
              code: "network_error",
              message: err instanceof Error ? err.message : "Google Imagen network error.",
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
