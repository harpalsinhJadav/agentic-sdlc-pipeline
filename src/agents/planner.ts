import type { Llm } from "../anthropic.js";
import type { Blackboard } from "../blackboard.js";
import { TechnicalPlanSchema, type TechnicalPlan } from "../schemas.js";
import { log } from "../util/log.js";

const SYSTEM = `You are a senior mobile architect on an agentic SDLC pipeline.
You turn a product request (and optional Figma design tokens) into a precise,
buildable technical plan for a React Native + TypeScript app with a Node.js
backend. Decompose into a component tree and typed API contracts. List EVERY
file the coding agent must produce, including the test files. Be concrete and
respect the provided design tokens and repo conventions. Do not write code here
— only the plan.`;

export async function runPlanner(llm: Llm, board: Blackboard): Promise<TechnicalPlan> {
  log.agent("planner", "decomposing the request into a technical plan…");

  const prompt = [
    `# Feature request\n${board.featureRequest}`,
    `# Design brief\n${board.designSummary}`,
    `# Existing repo conventions\n${board.repoConventions}`,
    `Produce the technical plan. Prefer small, single-responsibility files. Every`,
    `source file under src/ should have a matching test file under __tests__/.`,
  ].join("\n\n");

  const plan = await llm.structured({
    system: SYSTEM,
    prompt,
    schema: TechnicalPlanSchema,
    schemaName: "technical_plan",
  });

  board.plan = plan;
  log.ok(
    `plan ready: ${plan.componentTree.length} components, ` +
      `${plan.apiContracts.length} API contracts, ${plan.files.length} files`,
  );
  return plan;
}
