import type { Llm } from "../llm.js";
import type { Blackboard } from "../blackboard.js";
import { ReviewResultSchema, type ReviewResult } from "../schemas.js";
import { log } from "../util/log.js";

const SYSTEM = `You are an automated PR-review agent on an agentic SDLC pipeline.
You review the generated source and tests against the technical plan. Flag
security issues, performance anti-patterns, correctness bugs, and test-coverage
gaps. Be precise and actionable. Approve ONLY if there are no blocker/major
findings. Findings feed the CI pipeline as blocking checks.`;

export async function runReviewer(llm: Llm, board: Blackboard): Promise<ReviewResult> {
  log.agent("reviewer", "running automated PR review…");

  const prompt = [
    `# Technical plan\n${JSON.stringify(board.plan, null, 2)}`,
    `# Generated source + tests\n${board.filesDigest()}`,
    `Review the changes. Cross-reference them against the plan and the repo's`,
    `existing conventions. Return a structured verdict.`,
  ].join("\n\n");

  const review = await llm.structured({
    system: SYSTEM,
    prompt,
    schema: ReviewResultSchema,
    schemaName: "review_result",
  });

  board.review = review;

  const blockers = review.findings.filter(
    (f) => f.severity === "blocker" || f.severity === "major",
  );
  if (review.approved && blockers.length === 0) {
    log.ok(`review APPROVED — ${review.findings.length} non-blocking notes`);
  } else {
    log.warn(`review CHANGES REQUESTED — ${blockers.length} blocking finding(s)`);
    for (const f of blockers) {
      log.step(`[${f.severity}/${f.category}] ${f.file}: ${f.message}`);
    }
  }
  return review;
}
