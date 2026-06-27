// Mirror of the backend's src/events.ts and the structured-output shapes the
// UI renders. Kept as a hand-written copy so the frontend stays an isolated
// package with no build-time dependency on the Node sources.

export type ProviderId = "anthropic" | "openai" | "gemini";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  defaultModel: string;
}

export type Phase = "plan" | "build" | "review" | "fix" | "deploy";

export interface ReviewFinding {
  file: string;
  severity: "blocker" | "major" | "minor" | "nit";
  category: "security" | "performance" | "correctness" | "style" | "test-coverage";
  message: string;
  suggestion: string;
}

export interface GeneratedFile {
  path: string;
  contents: string;
  kind: "source" | "test";
}

export type PipelineEvent =
  | { type: "phase"; phase: Phase; message: string; round?: number }
  | { type: "usage"; inputTokens: number; outputTokens: number; totalTokens: number; budget: number }
  | { type: "plan"; title: string; components: number; apiContracts: number; files: number }
  | { type: "files"; kind: "source" | "test"; paths: string[] }
  | { type: "review"; approved: boolean; summary: string; blockers: number; findings: ReviewFinding[] }
  | {
      type: "done";
      approved: boolean;
      deployed: boolean;
      rounds: number;
      totalTokens: number;
      generatedFiles: GeneratedFile[];
    }
  | { type: "error"; message: string };

export interface RunInput {
  provider: ProviderId;
  apiKey: string;
  model?: string;
  feature: string;
  design?: unknown;
  conventions?: string;
  maxRounds?: number;
}
