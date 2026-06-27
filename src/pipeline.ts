import { Llm } from "./anthropic.js";
import { Blackboard } from "./blackboard.js";
import type { Config } from "./config.js";
import { runPlanner } from "./agents/planner.js";
import { runCoder } from "./agents/coder.js";
import { runTester } from "./agents/tester.js";
import { runReviewer } from "./agents/reviewer.js";
import { runDeployer } from "./agents/deployer.js";
import { log } from "./util/log.js";

export interface PipelineInput {
  featureRequest: string;
  designSummary: string;
  repoConventions: string;
  outDir: string;
  /** Max review→fix loops before giving up (loop-detection circuit breaker). */
  maxReviewRounds: number;
}

export interface PipelineResult {
  approved: boolean;
  deployed: boolean;
  rounds: number;
  totalTokens: number;
}

/**
 * The orchestrator. Runs the agent chain on a shared blackboard:
 *
 *   planner → coder → tester → reviewer ─┐
 *        ▲                               │ (changes requested)
 *        └──────── re-code/re-test ◀─────┘
 *                                        │ (approved)
 *                                     deployer
 *
 * Budget guards live in the Blackboard; loop detection lives here.
 */
export async function runPipeline(
  cfg: Config,
  input: PipelineInput,
): Promise<PipelineResult> {
  const board = new Blackboard(
    input.featureRequest,
    input.designSummary,
    input.repoConventions,
    cfg.tokenBudget,
  );
  const llm = new Llm(cfg, board);

  log.banner("PLAN");
  await runPlanner(llm, board);
  board.printUsage();

  log.banner("BUILD");
  await runCoder(llm, board);
  await runTester(llm, board);
  board.printUsage();

  let approved = false;
  let round = 0;
  for (round = 1; round <= input.maxReviewRounds; round++) {
    log.banner(`REVIEW (round ${round}/${input.maxReviewRounds})`);
    const review = await runReviewer(llm, board);
    board.printUsage();

    if (review.approved) {
      approved = true;
      break;
    }
    if (round === input.maxReviewRounds) {
      log.warn("max review rounds reached — stopping before deploy.");
      break;
    }

    // Feed the findings back to the coder + tester for a fix pass.
    log.banner(`FIX (round ${round})`);
    const findings = review.findings
      .map((f) => `- [${f.severity}/${f.category}] ${f.file}: ${f.message} → ${f.suggestion}`)
      .join("\n");
    await applyFixes(llm, board, findings);
    board.printUsage();
  }

  log.banner("DEPLOY");
  const deployed = approved ? await runDeployer(board, input.outDir) : false;
  if (!approved) log.fail("not approved — deploy skipped.");

  return { approved, deployed, rounds: round, totalTokens: board.totalTokens };
}

/** Re-run the coder + tester with the reviewer's findings as guidance. */
async function applyFixes(llm: Llm, board: Blackboard, findings: string): Promise<void> {
  const raw = await llm.generate({
    system:
      `You are fixing review findings on an agentic SDLC pipeline. Re-emit ONLY ` +
      `the files that need changes, in the strict delimited format:\n` +
      `=== FILE: <path> ===\n<contents>\n=== END FILE ===`,
    prompt: [
      `# Review findings to address\n${findings}`,
      `# Current files\n${board.filesDigest()}`,
      `Re-emit the corrected files (source and/or tests). Keep paths identical.`,
    ].join("\n\n"),
    maxTokens: 32_000,
  });

  // Parse once, then classify each file by its path (tests live in __tests__/
  // or end in .test.*). addFiles upserts by path, so corrected files replace
  // their originals on the blackboard.
  const { parseFileBlocks } = await import("./util/fileblocks.js");
  const fixed = parseFileBlocks(raw, "source").map((f) =>
    /(\.test\.|__tests__\/)/.test(f.path) ? { ...f, kind: "test" as const } : f,
  );
  board.addFiles(fixed);
  log.ok(`applied fixes to ${fixed.length} file(s)`);
}
