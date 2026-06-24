import type { ImageProvider } from "../types";

export function createDisabledImageProvider(): ImageProvider {
  return {
    name: "disabled",
    model: "disabled",
    async generate() {
      return {
        provider: "disabled",
        model: "disabled",
        output: [],
        metadata: { reason: "Image generation is disabled" },
      };
    },
  };
}
