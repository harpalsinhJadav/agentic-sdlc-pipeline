import type { ProviderId } from "./providers/types.js";

/**
 * Central configuration. The CLI builds it from env vars (`loadConfig`); the
 * web server builds it per-request from the user's bring-your-own-key input
 * (`buildConfig`). Both paths converge on the same `Config` shape so the
 * pipeline never needs to know where the key came from.
 */

export interface Config {
  provider: ProviderId;
  apiKey: string;
  model: string;
  tokenBudget: number;
}

export const PROVIDERS: ProviderId[] = ["anthropic", "openai", "gemini"];

/** Default (most capable) model per provider; all overridable. */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: "claude-opus-4-8",
  openai: "gpt-4o",
  gemini: "gemini-1.5-pro",
};

/** Human-friendly labels for UIs. */
export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "ChatGPT (OpenAI)",
  gemini: "Gemini (Google)",
};

const ENV_KEY: Record<ProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const DEFAULT_TOKEN_BUDGET = 200_000;

/** Pure builder used by the web server (no env reads). */
export function buildConfig(input: {
  provider: ProviderId;
  apiKey: string;
  model?: string;
  tokenBudget?: number;
}): Config {
  if (!PROVIDERS.includes(input.provider)) {
    throw new Error(`Unknown provider "${input.provider}". Choose one of: ${PROVIDERS.join(", ")}.`);
  }
  if (!input.apiKey) {
    throw new Error(`No API key provided for ${input.provider}.`);
  }
  return {
    provider: input.provider,
    apiKey: input.apiKey,
    // Default to the most capable model; the whole pipeline is correctness-sensitive.
    model: input.model || DEFAULT_MODELS[input.provider],
    tokenBudget: input.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
  };
}

/** CLI/env entry point. Optional overrides come from parsed CLI flags. */
export function loadConfig(overrides?: {
  provider?: string;
  model?: string;
  apiKey?: string;
}): Config {
  const provider = (overrides?.provider ||
    process.env.ASDLC_PROVIDER ||
    "anthropic") as ProviderId;
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`Unknown ASDLC_PROVIDER "${provider}". Choose one of: ${PROVIDERS.join(", ")}.`);
  }

  const apiKey = overrides?.apiKey || process.env[ENV_KEY[provider]];
  if (!apiKey) {
    throw new Error(
      `${ENV_KEY[provider]} is not set. Copy .env.example to .env and add your key, ` +
        `export ${ENV_KEY[provider]} in your shell, or pass --api-key.`,
    );
  }

  return buildConfig({
    provider,
    apiKey,
    model: overrides?.model || process.env.ASDLC_MODEL,
    tokenBudget: Number(process.env.ASDLC_TOKEN_BUDGET) || DEFAULT_TOKEN_BUDGET,
  });
}
