import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";
import type { Config } from "./config.js";
import type { Blackboard } from "./blackboard.js";
import { createProvider } from "./providers/index.js";
import type { LlmProvider } from "./providers/types.js";

/**
 * Provider-agnostic facade every agent shares. It centralises the concerns that
 * must behave identically across vendors:
 *
 *   - budget guard      (Blackboard.assertWithinBudget)
 *   - schema conversion (Zod → JSON Schema for forced structured output)
 *   - usage accounting  (normalized token usage → Blackboard)
 *   - schema validation (Zod.parse of whatever the model returned)
 *
 * The vendor-specific API calls live behind an LlmProvider (see ./providers).
 * Agents only ever see the two call shapes below, so swapping Claude ↔ OpenAI ↔
 * Gemini requires no agent changes.
 *
 *   - structured()  → JSON validated against a Zod schema (planner, reviewer)
 *   - generate()    → streamed free-form text (coder, tester)
 */
export class Llm {
  private provider: LlmProvider;

  constructor(
    cfg: Config,
    private board: Blackboard,
  ) {
    this.provider = createProvider(cfg);
  }

  async structured<T extends z.ZodTypeAny>(args: {
    system: string;
    prompt: string;
    schema: T;
    schemaName: string;
    maxTokens?: number;
  }): Promise<z.infer<T>> {
    this.board.assertWithinBudget();

    const jsonSchema = zodToJsonSchema(args.schema, {
      $refStrategy: "none",
      target: "openApi3",
    }) as Record<string, unknown>;
    delete jsonSchema.$schema;

    const { value, usage } = await this.provider.structured({
      system: args.system,
      prompt: args.prompt,
      jsonSchema,
      schemaName: args.schemaName,
      maxTokens: args.maxTokens ?? 16_000,
    });

    this.board.recordUsage(usage);
    return args.schema.parse(value);
  }

  /**
   * Streamed free-form generation. Streaming keeps the connection alive for the
   * large `max_tokens` the coder needs and avoids HTTP timeouts.
   */
  async generate(args: {
    system: string;
    prompt: string;
    maxTokens?: number;
    onToken?: (t: string) => void;
  }): Promise<string> {
    this.board.assertWithinBudget();

    const { text, usage } = await this.provider.generate({
      system: args.system,
      prompt: args.prompt,
      maxTokens: args.maxTokens ?? 32_000,
      onToken: args.onToken,
    });

    this.board.recordUsage(usage);
    return text;
  }
}
