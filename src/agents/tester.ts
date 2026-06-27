import type { Llm } from "../anthropic.js";
import type { Blackboard } from "../blackboard.js";
import { parseFileBlocks } from "../util/fileblocks.js";
import { log } from "../util/log.js";

const SYSTEM = `You are a test engineer on an agentic SDLC pipeline. You write
Jest + React Native Testing Library unit and integration tests for the source
files you are given. Cover the main behaviours, edge cases, and error paths.
Import from the real source paths. Do not rewrite the source — only write tests.

Output EACH test file in this exact delimited format and nothing else between
blocks:

=== FILE: <repo-relative test path> ===
<full test file contents>
=== END FILE ===`;

export async function runTester(llm: Llm, board: Blackboard): Promise<void> {
  const plan = board.plan!;
  const testFiles = plan.files.filter((f) => f.kind === "test");
  log.agent("tester", `authoring ${testFiles.length} test files…`);

  const prompt = [
    `# Source files to test\n${board.filesDigest(["source"])}`,
    `# Planned test files\n` +
      testFiles.map((f) => `- ${f.path} — ${f.purpose}`).join("\n"),
    `Write thorough Jest tests for the source above.`,
  ].join("\n\n");

  const raw = await llm.generate({ system: SYSTEM, prompt, maxTokens: 32_000 });

  const files = parseFileBlocks(raw, "test");
  if (files.length === 0) {
    throw new Error("Tester produced no parseable files.");
  }
  board.addFiles(files);
  log.ok(`generated ${files.length} test files`);
  for (const f of files) log.step(f.path);
}
