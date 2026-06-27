import type { Config } from "../config.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { GeminiProvider } from "./gemini.js";
import type { LlmProvider } from "./types.js";

export type { LlmProvider, NormalizedUsage, ProviderId } from "./types.js";

/** Instantiate the provider selected in config. */
export function createProvider(cfg: Config): LlmProvider {
  switch (cfg.provider) {
    case "anthropic":
      return new AnthropicProvider(cfg.apiKey, cfg.model);
    case "openai":
      return new OpenAIProvider(cfg.apiKey, cfg.model);
    case "gemini":
      return new GeminiProvider(cfg.apiKey, cfg.model);
    default: {
      const _exhaustive: never = cfg.provider;
      throw new Error(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
}
