/**
 * A deliberately small "Figma reader". A real integration would call the Figma
 * REST API; here we accept an exported design-tokens JSON (the shape Figma's
 * Tokens Studio / variables export produces) and flatten it into a compact
 * brief the planning agent can reason over without blowing the context window.
 */

export interface DesignBrief {
  summary: string;
  tokens: Record<string, string>;
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export function parseDesignTokens(raw: unknown): DesignBrief {
  const tokens: Record<string, string> = {};

  const walk = (node: Json, prefix: string) => {
    if (node && typeof node === "object" && !Array.isArray(node)) {
      // Tokens Studio leaf nodes look like { value, type }.
      if ("value" in node && (typeof node.value === "string" || typeof node.value === "number")) {
        tokens[prefix.replace(/^\./, "")] = String(node.value);
        return;
      }
      for (const [key, child] of Object.entries(node)) {
        walk(child as Json, `${prefix}.${key}`);
      }
    }
  };

  walk(raw as Json, "");

  const entries = Object.entries(tokens);
  const summary =
    entries.length === 0
      ? "No design tokens provided."
      : `${entries.length} design tokens parsed (colors, spacing, typography, radii).`;

  return { summary, tokens };
}
