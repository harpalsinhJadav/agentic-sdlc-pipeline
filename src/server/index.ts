import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { buildConfig, DEFAULT_MODELS, PROVIDER_LABELS, PROVIDERS } from "../config.js";
import { runPipeline } from "../pipeline.js";
import { parseDesignTokens, buildDesignSummary } from "../util/figma.js";
import type { PipelineEvent } from "../events.js";

/**
 * Web backend for the agentic SDLC pipeline. It is a thin HTTP layer over
 * `runPipeline`: it builds a per-request config from the caller's bring-your-own
 * API key, streams progress as Server-Sent Events, and returns the generated
 * files. The API key lives only inside the request-scoped config object — it is
 * never logged, stored, or echoed back in any event or error.
 */

const RunRequest = z.object({
  provider: z.enum(["anthropic", "openai", "gemini"]),
  apiKey: z.string().min(1, "apiKey is required"),
  model: z.string().optional(),
  feature: z.string().min(1, "feature is required"),
  /** Raw Figma design-tokens JSON (object) — optional. */
  design: z.unknown().optional(),
  conventions: z.string().optional(),
  maxRounds: z.number().int().min(1).max(5).optional(),
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

/** Provider catalogue for populating the UI's dropdowns. */
app.get("/api/providers", (_req, res) => {
  res.json({
    providers: PROVIDERS.map((id) => ({
      id,
      label: PROVIDER_LABELS[id],
      defaultModel: DEFAULT_MODELS[id],
    })),
  });
});

app.post("/api/run", async (req, res) => {
  const parsed = RunRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") });
    return;
  }
  const body = parsed.data;

  // Open the SSE stream.
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  const send = (event: PipelineEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Throwaway output dir — the generated files come back in the `done` event,
  // so the deploy gate's disk writes are disposable here.
  let outDir: string | undefined;
  try {
    const cfg = buildConfig({ provider: body.provider, apiKey: body.apiKey, model: body.model });

    const design = body.design
      ? parseDesignTokens(body.design)
      : { summary: "No design provided.", tokens: {} };
    const designSummary = buildDesignSummary(design);
    const repoConventions =
      body.conventions ||
      "No conventions file provided. Use idiomatic React Native + TypeScript defaults.";

    outDir = await fs.mkdtemp(path.join(os.tmpdir(), "asdlc-"));

    await runPipeline(cfg, {
      featureRequest: body.feature,
      designSummary,
      repoConventions,
      outDir,
      maxReviewRounds: body.maxRounds ?? 2,
      onEvent: send,
    });
  } catch (err) {
    // Never surface the key; only the error message.
    send({ type: "error", message: (err as Error).message });
  } finally {
    if (outDir) await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
    res.end();
  }
});

// In production, serve the built frontend (web/dist) so a single process hosts
// both the API and the UI. Falls back gracefully when no build is present.
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, "../../web/dist");
app.use(express.static(webDist));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) res.status(404).send("Frontend not built. Run `npm run build` in web/.");
  });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Agentic SDLC server listening on http://localhost:${port}`);
});
