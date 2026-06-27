#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "./config.js";
import { runPipeline } from "./pipeline.js";
import { parseDesignTokens, buildDesignSummary } from "./util/figma.js";
import { readJson, readTextIfExists } from "./util/files.js";
import { log } from "./util/log.js";

const program = new Command();

program
  .name("asdlc")
  .description(
    "Agentic SDLC pipeline — turn a feature spec (and optional Figma design tokens) " +
      "into planned, generated, tested, reviewed, and deploy-gated code.",
  )
  .version("0.1.0");

program
  .command("run")
  .description("Run the full pipeline on a feature request")
  .requiredOption("-f, --feature <path>", "path to a feature request (.md or .txt)")
  .option("-d, --design <path>", "path to exported Figma design-tokens JSON")
  .option("-c, --conventions <path>", "path to a repo conventions file")
  .option("-o, --out <dir>", "output directory for generated code", "out")
  .option("-r, --max-rounds <n>", "max review→fix rounds", "2")
  .option("-p, --provider <id>", "LLM provider: anthropic | openai | gemini")
  .option("-m, --model <id>", "model id (defaults to the provider's best model)")
  .option("-k, --api-key <key>", "API key (falls back to the provider env var)")
  .action(async (opts) => {
    try {
      const cfg = loadConfig({
        provider: opts.provider,
        model: opts.model,
        apiKey: opts.apiKey,
      });

      const featureRequest = await fs.readFile(opts.feature, "utf8");
      const design = opts.design
        ? parseDesignTokens(await readJson(opts.design))
        : { summary: "No design provided.", tokens: {} };
      const repoConventions =
        (await readTextIfExists(opts.conventions)) ??
        "No conventions file provided. Use idiomatic React Native + TypeScript defaults.";

      const designSummary = buildDesignSummary(design);

      log.dim(chalk.bold("\nAgentic SDLC pipeline"));
      log.dim(`  provider: ${cfg.provider}`);
      log.dim(`  model:   ${cfg.model}`);
      log.dim(`  feature: ${path.resolve(opts.feature)}`);
      log.dim(`  output:  ${path.resolve(opts.out)}`);

      const result = await runPipeline(cfg, {
        featureRequest,
        designSummary,
        repoConventions,
        outDir: opts.out,
        maxReviewRounds: Number(opts.maxRounds),
      });

      log.banner("DONE");
      log.dim(
        `  approved=${result.approved}  deployed=${result.deployed}  ` +
          `rounds=${result.rounds}  tokens=${result.totalTokens.toLocaleString()}`,
      );
      process.exit(result.deployed ? 0 : 1);
    } catch (err) {
      log.fail((err as Error).message);
      process.exit(2);
    }
  });

program.parseAsync(process.argv);
