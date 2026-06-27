import type { TechnicalPlan, ReviewResult } from "./schemas.js";
import type { NormalizedUsage } from "./providers/types.js";
import { log } from "./util/log.js";

export interface GeneratedFile {
  path: string;
  contents: string;
  /** "source" | "test" — used by the reviewer and the deploy gate. */
  kind: "source" | "test";
}

/**
 * The shared context every agent reads from and writes to — the classic
 * blackboard pattern. It also enforces the run-wide token budget so a runaway
 * agent can't burn unbounded tokens (one of the failure modes the real system
 * was built to prevent).
 */
export class Blackboard {
  plan?: TechnicalPlan;
  files: GeneratedFile[] = [];
  review?: ReviewResult;

  private inputTokens = 0;
  private outputTokens = 0;

  constructor(
    readonly featureRequest: string,
    readonly designSummary: string,
    readonly repoConventions: string,
    private budget: number,
  ) {}

  recordUsage(usage: NormalizedUsage | undefined) {
    if (!usage) return;
    this.inputTokens += usage.inputTokens ?? 0;
    this.outputTokens += usage.outputTokens ?? 0;
  }

  get totalTokens(): number {
    return this.inputTokens + this.outputTokens;
  }

  /** Serialisable token snapshot for progress events. */
  usageSnapshot() {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      totalTokens: this.totalTokens,
      budget: this.budget,
    };
  }

  assertWithinBudget() {
    if (this.totalTokens >= this.budget) {
      throw new Error(
        `Token budget exhausted (${this.totalTokens}/${this.budget}). ` +
          `Raise ASDLC_TOKEN_BUDGET or narrow the feature scope.`,
      );
    }
  }

  addFiles(files: GeneratedFile[]) {
    for (const f of files) {
      const existing = this.files.findIndex((e) => e.path === f.path);
      if (existing >= 0) this.files[existing] = f;
      else this.files.push(f);
    }
  }

  /** A compact view of generated files for prompting downstream agents. */
  filesDigest(kinds: GeneratedFile["kind"][] = ["source", "test"]): string {
    return this.files
      .filter((f) => kinds.includes(f.kind))
      .map((f) => `// FILE: ${f.path}\n${f.contents}`)
      .join("\n\n");
  }

  printUsage() {
    log.dim(
      `    tokens: ${this.totalTokens.toLocaleString()} / ${this.budget.toLocaleString()} ` +
        `(in ${this.inputTokens.toLocaleString()}, out ${this.outputTokens.toLocaleString()})`,
    );
  }
}
