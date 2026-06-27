/**
 * Provider-agnostic LLM contract. Each supported vendor (Anthropic, OpenAI,
 * Google) implements this interface; the `Llm` facade in ../llm.ts picks one at
 * runtime and layers the shared concerns (budget guard, schema conversion,
 * usage accounting, Zod validation) on top.
 *
 * Providers do the raw API call only and return *normalized* token usage so the
 * blackboard's budget logic stays vendor-independent.
 */

export type ProviderId = "anthropic" | "openai" | "gemini";

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StructuredArgs {
  system: string;
  prompt: string;
  /** JSON Schema (OpenAPI 3 flavour) derived from the agent's Zod schema. */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  maxTokens: number;
}

export interface GenerateArgs {
  system: string;
  prompt: string;
  maxTokens: number;
  onToken?: (t: string) => void;
}

export interface LlmProvider {
  readonly id: ProviderId;

  /** Force the model to emit JSON matching `jsonSchema`; returns the raw parsed object. */
  structured(args: StructuredArgs): Promise<{ value: unknown; usage: NormalizedUsage }>;

  /** Streamed free-form text generation. */
  generate(args: GenerateArgs): Promise<{ text: string; usage: NormalizedUsage }>;
}
