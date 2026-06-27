import OpenAI from "openai";
import type {
  GenerateArgs,
  LlmProvider,
  NormalizedUsage,
  ProviderId,
  StructuredArgs,
} from "./types.js";

/**
 * OpenAI (ChatGPT) provider. Structured output mirrors the Anthropic approach:
 * a forced function tool whose parameters are the JSON schema. Streaming uses
 * `stream_options.include_usage` so we still get a token count at the end.
 */
export class OpenAIProvider implements LlmProvider {
  readonly id: ProviderId = "openai";
  private client: OpenAI;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async structured(args: StructuredArgs) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: args.maxTokens,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: args.schemaName,
            description: `Return the result as structured data matching the ${args.schemaName} schema.`,
            parameters: args.jsonSchema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: args.schemaName } },
    });

    const call = response.choices[0]?.message?.tool_calls?.[0];
    if (!call || call.type !== "function") {
      throw new Error(`Model did not return structured ${args.schemaName} output.`);
    }
    let value: unknown;
    try {
      value = JSON.parse(call.function.arguments);
    } catch {
      throw new Error(`Model returned invalid JSON for ${args.schemaName}.`);
    }
    return { value, usage: normalize(response.usage) };
  }

  async generate(args: GenerateArgs) {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: args.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.prompt },
      ],
    });

    let text = "";
    let usage: NormalizedUsage = { inputTokens: 0, outputTokens: 0 };
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        text += delta;
        args.onToken?.(delta);
      }
      // The final chunk carries usage when include_usage is set.
      if (chunk.usage) usage = normalize(chunk.usage);
    }
    return { text, usage };
  }
}

function normalize(usage: OpenAI.CompletionUsage | undefined | null): NormalizedUsage {
  if (!usage) return { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
  };
}
