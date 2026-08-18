import type { AppConfig } from "../../../config/env";
import { providerErrorToMetadata, ProviderError } from "../errors";
import type { ImageProvider, ImageProviderRequest, ProviderResult } from "../types";
import type { GeneratedImage } from "../../postImageGenerator";
import { createGeminiImageProvider } from "./geminiImageProvider";
import { createOpenAiImageProvider } from "./openAiImageProvider";

export function createGeminiFirstImageProvider(cfg: AppConfig): ImageProvider {
  const openAiProvider = createOpenAiImageProvider(cfg);
  return {
    name: "gemini_first",
    model: cfg.geminiImageModel || "gemini-3.1-flash-image",
    async generate(request: ImageProviderRequest): Promise<ProviderResult<GeneratedImage[]>> {
      const attempts: Record<string, unknown>[] = [];
      const geminiImageApiKey = cfg.geminiImageApiKey || cfg.geminiApiKey;
      if (geminiImageApiKey) {
        try {
          const result = await createGeminiImageProvider(cfg).generate(request);
          return {
            ...result,
            metadata: { ...(result.metadata ?? {}), fallbackUsed: false, providerChain: ["gemini"], attempts },
          };
        } catch (err) {
          attempts.push(providerErrorToMetadata(err));
        }
      }

      if (cfg.imageFallbackProvider === "none" && geminiImageApiKey) {
        throw new ProviderError({
          provider: "gemini_first",
          model: cfg.geminiImageModel,
          code: "fallback_disabled",
          message: "Gemini image provider failed and IMAGE_FALLBACK_PROVIDER is none.",
          retryable: false,
          raw: { attempts },
        });
      }

      const fallback = await openAiProvider.generate(request);
      return {
        ...fallback,
        metadata: {
          ...(fallback.metadata ?? {}),
          fallbackUsed: Boolean(geminiImageApiKey),
          providerChain: geminiImageApiKey ? ["gemini", "openai"] : ["openai"],
          attempts,
        },
      };
    },
  };
}
