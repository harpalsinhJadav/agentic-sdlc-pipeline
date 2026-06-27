import Anthropic from "@anthropic-ai/sdk";
import type {
  GenerateArgs,
  LlmProvider,
  NormalizedUsage,
  ProviderId,
  StructuredArgs,
} from "./types.js";

/**
 * Anthropic (Claude) provider. Structured output is implemented with forced
 * tool use: the JSON schema is exposed as a tool input schema and the model is
 * forced to call it. Streaming keeps the connection alive for large outputs.
 */
export class AnthropicProvider implements LlmProvider {
  readonly id: ProviderId = "anthropic";
  private client: Anthropic;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async structured(args: StructuredArgs) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: args.maxTokens,
      system: args.system,
      tools: [
        {
          name: args.schemaName,
          description: `Return the result as structured data matching the ${args.schemaName} schema.`,
          input_schema: args.jsonSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: args.schemaName },
      messages: [{ role: "user", content: args.prompt }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolUse) {
      throw new Error(`Model did not return structured ${args.schemaName} output.`);
    }
    return { value: toolUse.input, usage: normalize(response.usage) };
  }

  async generate(args: GenerateArgs) {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: [{ role: "user", content: args.prompt }],
    });

    if (args.onToken) stream.on("text", args.onToken);

    const final = await stream.finalMessage();
    const text = final.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, usage: normalize(final.usage) };
  }
}

function normalize(usage: Anthropic.Usage | undefined): NormalizedUsage {
  if (!usage) return { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens:
      (usage.input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0),
    outputTokens: usage.output_tokens ?? 0,
  };
}
