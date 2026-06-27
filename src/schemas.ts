import { z } from "zod";

/**
 * Structured-output contracts. Using Zod schemas with the Messages API's
 * structured outputs guarantees each agent hands the next one well-formed,
 * typed data instead of free-form prose we'd have to re-parse.
 */

export const ApiContract = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().describe("REST path, e.g. /api/transactions/:id"),
  description: z.string(),
  requestShape: z.string().describe("TypeScript-ish description of the request body/params"),
  responseShape: z.string().describe("TypeScript-ish description of the response body"),
});

export const ComponentNode = z.object({
  name: z.string().describe("PascalCase component name"),
  responsibility: z.string(),
  children: z.array(z.string()).describe("names of child components"),
});

export const PlannedFile = z.object({
  path: z.string().describe("repo-relative path, e.g. src/screens/Wallet.tsx"),
  purpose: z.string(),
  kind: z.enum(["source", "test"]),
});

export const TechnicalPlanSchema = z.object({
  title: z.string(),
  overview: z.string().describe("2-4 sentence technical approach"),
  componentTree: z.array(ComponentNode),
  apiContracts: z.array(ApiContract),
  files: z.array(PlannedFile).describe("every file the coder must produce, source and tests"),
  risks: z.array(z.string()),
});
export type TechnicalPlan = z.infer<typeof TechnicalPlanSchema>;

export const ReviewFinding = z.object({
  file: z.string(),
  severity: z.enum(["blocker", "major", "minor", "nit"]),
  category: z.enum(["security", "performance", "correctness", "style", "test-coverage"]),
  message: z.string(),
  suggestion: z.string(),
});

export const ReviewResultSchema = z.object({
  approved: z.boolean().describe("true only if there are no blocker/major findings"),
  summary: z.string(),
  findings: z.array(ReviewFinding),
});
export type ReviewResult = z.infer<typeof ReviewResultSchema>;
