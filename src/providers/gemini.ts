import { GoogleGenerativeAI, type UsageMetadata } from "@google/generative-ai";
import type {
  GenerateArgs,
  LlmProvider,
  NormalizedUsage,
  ProviderId,
  StructuredArgs,
} from "./types.js";

/**
 * Google (Gemini) provider. Structured output uses JSON mode with a
 * `responseSchema`. Gemini accepts only a subset of JSON Schema, so we sanitize
 * the zod-to-json-schema output (drop `$schema`, `additionalProperties`, refs,
 * etc.) before passing it through.
 */
export class GeminiProvider implements LlmProvider {
  readonly id: ProviderId = "gemini";
  private genAI: GoogleGenerativeAI;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async structured(args: StructuredArgs) {
    const model = this.genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: args.system,
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: args.prompt }] }],
      generationConfig: {
        maxOutputTokens: args.maxTokens,
        responseMimeType: "application/json",
        // Gemini's schema is a JSON-Schema subset; cast after sanitizing.
        responseSchema: sanitizeSchema(args.jsonSchema) as never,
      },
    });

    const text = result.response.text();
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error(`Model returned invalid JSON for ${args.schemaName}.`);
    }
    return { value, usage: normalize(result.response.usageMetadata) };
  }

  async generate(args: GenerateArgs) {
    const model = this.genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: args.system,
    });

    const result = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: args.prompt }] }],
      generationConfig: { maxOutputTokens: args.maxTokens },
    });

    let text = "";
    for await (const chunk of result.stream) {
      const t = chunk.text();
      if (t) {
        text += t;
        args.onToken?.(t);
      }
    }
    const response = await result.response;
    return { text, usage: normalize(response.usageMetadata) };
  }
}

function normalize(usage: UsageMetadata | undefined): NormalizedUsage {
  if (!usage) return { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens: usage.promptTokenCount ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
  };
}

/** Keywords Gemini's responseSchema does not accept. */
const UNSUPPORTED = new Set([
  "$schema",
  "$ref",
  "$id",
  "definitions",
  "$defs",
  "additionalProperties",
  "default",
  "const",
  "examples",
  "patternProperties",
]);

/** Recursively strip JSON-Schema keywords Gemini rejects. */
function sanitizeSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeSchema);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (UNSUPPORTED.has(k)) continue;
      out[k] = sanitizeSchema(v);
    }
    return out;
  }
  return node;
}
