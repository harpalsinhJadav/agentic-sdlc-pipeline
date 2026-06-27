import type { GeneratedFile } from "./blackboard.js";
import type { ReviewResult, TechnicalPlan } from "./schemas.js";

/**
 * Phase-level progress events emitted by the pipeline. The CLI keeps its own
 * console output; the web server forwards these over Server-Sent Events so the
 * browser can render a live timeline. Everything here is JSON-serialisable and
 * deliberately free of any secret (no API key ever appears in an event).
 */

export type Phase = "plan" | "build" | "review" | "fix" | "deploy";

export type PipelineEvent =
  | { type: "phase"; phase: Phase; message: string; round?: number }
  | { type: "usage"; inputTokens: number; outputTokens: number; totalTokens: number; budget: number }
  | { type: "plan"; title: string; components: number; apiContracts: number; files: number }
  | { type: "files"; kind: GeneratedFile["kind"]; paths: string[] }
  | { type: "review"; approved: boolean; summary: string; blockers: number; findings: ReviewResult["findings"] }
  | {
      type: "done";
      approved: boolean;
      deployed: boolean;
      rounds: number;
      totalTokens: number;
      plan?: TechnicalPlan;
      generatedFiles: GeneratedFile[];
    }
  | { type: "error"; message: string };

export type EventSink = (event: PipelineEvent) => void;
