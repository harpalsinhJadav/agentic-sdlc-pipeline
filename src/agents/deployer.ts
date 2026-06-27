import { promises as fs } from "node:fs";
import path from "node:path";
import type { Blackboard } from "../blackboard.js";
import { writeFileSafe } from "../util/files.js";
import { log } from "../util/log.js";

/**
 * The deploy agent is the gate. In the production system this triggers Fastlane
 * on a green pipeline; here it writes the approved artifacts to disk and emits a
 * deploy plan, only when the reviewer approved. A blocked review stops the
 * deploy — the same circuit-breaker behaviour as the real pipeline.
 */
export async function runDeployer(board: Blackboard, outDir: string): Promise<boolean> {
  const review = board.review!;
  if (!review.approved) {
    log.fail("deploy gate: BLOCKED by review — no artifacts written.");
    return false;
  }

  log.agent("deployer", `writing ${board.files.length} files to ${outDir} …`);
  for (const f of board.files) {
    const written = await writeFileSafe(outDir, f.path, f.contents);
    log.step(path.relative(process.cwd(), written));
  }

  const plan = {
    generatedAt: new Date().toISOString(),
    title: board.plan?.title,
    files: board.files.map((f) => ({ path: f.path, kind: f.kind })),
    review: { approved: review.approved, summary: review.summary },
    steps: [
      "lint && typecheck",
      "jest --runInBand",
      "fastlane build (ios + android)",
      "fastlane deploy --track internal",
    ],
  };
  await fs.writeFile(
    path.join(outDir, "deploy-plan.json"),
    JSON.stringify(plan, null, 2),
    "utf8",
  );

  log.ok("deploy gate: GREEN — artifacts + deploy-plan.json written.");
  return true;
}
