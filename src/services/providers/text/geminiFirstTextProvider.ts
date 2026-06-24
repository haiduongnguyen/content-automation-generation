import type { AppConfig } from "../../../config/env";
import { providerErrorToMetadata, ProviderError } from "../errors";
import type { ProviderResult, TextProvider, TextProviderRequest } from "../types";
import { createGeminiTextProvider } from "./geminiTextProvider";
import { createOpenAiTextProvider } from "./openAiTextProvider";

export function createGeminiFirstTextProvider(cfg: AppConfig, isValidJsonText: (raw: string) => boolean): TextProvider {
  const openAiProvider = createOpenAiTextProvider(cfg);
  return {
    name: "gemini_first",
    model: cfg.geminiModel || cfg.openAiModel,
    async generate(request: TextProviderRequest): Promise<ProviderResult<string>> {
      const attempts: Record<string, unknown>[] = [];
      if (cfg.geminiApiKey) {
        try {
            const result = await createGeminiTextProvider(cfg, cfg.geminiModel).generate({
              ...request,
              validateOutput: isValidJsonText,
            });
            if (isValidJsonText(result.output)) {
              return {
                ...result,
                metadata: { ...(result.metadata ?? {}), fallbackUsed: false, providerChain: ["gemini"], attempts },
              };
            }
            attempts.push({
              provider: "gemini",
              model: cfg.geminiModel,
              code: "invalid_json",
              retryable: false,
              message: "Gemini returned text that did not pass JSON validation.",
              latencyMs: result.metadata?.latencyMs,
            });
        } catch (err) {
            attempts.push(providerErrorToMetadata(err));
        }
      }

      if (cfg.textFallbackProvider === "none" && cfg.geminiApiKey) {
        throw new ProviderError({
          provider: "gemini_first",
          model: cfg.geminiModel,
          code: "fallback_disabled",
          message: "Gemini provider failed and TEXT_FALLBACK_PROVIDER is none.",
          retryable: false,
          raw: { attempts },
        });
      }

      const fallback = await openAiProvider.generate(request);
      return {
        ...fallback,
        metadata: {
          ...(fallback.metadata ?? {}),
          fallbackUsed: Boolean(cfg.geminiApiKey),
          providerChain: cfg.geminiApiKey ? ["gemini", "openai"] : ["openai"],
          attempts,
        },
      };
    },
  };
}
