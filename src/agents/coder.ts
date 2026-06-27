import type { Llm } from "../llm.js";
import type { Blackboard } from "../blackboard.js";
import { parseFileBlocks } from "../util/fileblocks.js";
import { log } from "../util/log.js";

const SYSTEM = `You are a meticulous React Native + TypeScript engineer on an
agentic SDLC pipeline. You implement a technical plan as production-quality
source files. Follow the repo conventions exactly (naming, structure, imports).
Write idiomatic, strongly-typed, self-consistent code. Only output the SOURCE
files from the plan (kind: "source") — a separate test agent writes the tests.

Output EACH file in this exact delimited format and nothing else between blocks:

=== FILE: <repo-relative path> ===
<full file contents>
=== END FILE ===`;

export async function runCoder(llm: Llm, board: Blackboard): Promise<void> {
  const plan = board.plan!;
  const sourceFiles = plan.files.filter((f) => f.kind === "source");
  log.agent("coder", `scaffolding ${sourceFiles.length} source files…`);

  const prompt = [
    `# Technical plan\n${JSON.stringify(plan, null, 2)}`,
    `# Design tokens summary\n${board.designSummary}`,
    `# Repo conventions\n${board.repoConventions}`,
    `Implement only these source files:\n` +
      sourceFiles.map((f) => `- ${f.path} — ${f.purpose}`).join("\n"),
  ].join("\n\n");

  let printed = 0;
  const raw = await llm.generate({
    system: SYSTEM,
    prompt,
    maxTokens: 32_000,
    onToken: () => {
      // Lightweight progress dots so long generations show life.
      if (++printed % 200 === 0) process.stdout.write(".");
    },
  });
  if (printed >= 200) process.stdout.write("\n");

  const files = parseFileBlocks(raw, "source");
  if (files.length === 0) {
    throw new Error("Coder produced no parseable files.");
  }
  board.addFiles(files);
  log.ok(`generated ${files.length} source files`);
  for (const f of files) log.step(f.path);
}
