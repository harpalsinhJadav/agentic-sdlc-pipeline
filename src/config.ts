/**
 * Central configuration. All knobs are env-driven so the pipeline can run in
 * CI or locally without code changes.
 */

export interface Config {
  apiKey: string;
  model: string;
  tokenBudget: number;
}

export function loadConfig(): Config {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key, " +
        "or export ANTHROPIC_API_KEY in your shell.",
    );
  }

  return {
    apiKey,
    // Default to the most capable model; the whole pipeline is correctness-sensitive.
    model: process.env.ASDLC_MODEL || "claude-opus-4-8",
    tokenBudget: Number(process.env.ASDLC_TOKEN_BUDGET || 200_000),
  };
}
