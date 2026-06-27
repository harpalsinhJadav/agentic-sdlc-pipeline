import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";
import type { Config } from "./config.js";
import type { Blackboard } from "./blackboard.js";

/**
 * Thin wrapper around the Anthropic SDK that every agent shares. It centralises
 * model selection, token accounting against the run budget, and the two call
 * shapes the pipeline needs:
 *
 *   - structured()  → JSON validated against a Zod schema (planner, reviewer)
 *   - generate()    → streamed free-form text (coder, tester)
 *
 * Structured output is implemented with forced tool use: we expose the Zod
 * schema as a tool's input schema and force the model to call it, then validate
 * the tool input with Zod. This is portable across SDK versions and gives a
 * hard schema guarantee on the planner/reviewer hand-offs.
 */
export class Llm {
  private client: Anthropic;

  constructor(
    private cfg: Config,
    private board: Blackboard,
  ) {
    this.client = new Anthropic({ apiKey: cfg.apiKey });
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

    const response = await this.client.messages.create({
      model: this.cfg.model,
      max_tokens: args.maxTokens ?? 16_000,
      system: args.system,
      tools: [
        {
          name: args.schemaName,
          description: `Return the result as structured data matching the ${args.schemaName} schema.`,
          input_schema: jsonSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: args.schemaName },
      messages: [{ role: "user", content: args.prompt }],
    });

    this.board.recordUsage(response.usage);

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolUse) {
      throw new Error(`Model did not return structured ${args.schemaName} output.`);
    }
    return args.schema.parse(toolUse.input);
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

    const stream = this.client.messages.stream({
      model: this.cfg.model,
      max_tokens: args.maxTokens ?? 32_000,
      system: args.system,
      messages: [{ role: "user", content: args.prompt }],
    });

    if (args.onToken) {
      stream.on("text", args.onToken);
    }

    const final = await stream.finalMessage();
    this.board.recordUsage(final.usage);

    return final.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
}
