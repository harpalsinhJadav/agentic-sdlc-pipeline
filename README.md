# agentic-sdlc-pipeline

A multi-agent system that automates the software development lifecycle. Give it a
feature spec (and, optionally, exported Figma design tokens) and a chain of
specialized AI agents takes it from **design → plan → code → tests → review →
deploy gate** with minimal human intervention.

Built with **TypeScript**. It runs against **any of three LLM providers** —
**Claude (Anthropic)**, **ChatGPT (OpenAI)**, or **Gemini (Google)** — behind a
single provider interface, and ships with both a **CLI** and a **web interface**
where users bring their own API key. This is a clean-room reference
implementation of a production agentic SDLC system.

> **Status:** reference implementation. The deploy agent writes approved
> artifacts to disk and emits a deploy plan rather than triggering a real
> Fastlane/CI deployment — swap `src/agents/deployer.ts` for your CI hooks.

---

## Architecture

```mermaid
flowchart LR
    F[Feature spec + Figma tokens] --> P[Planner agent]
    P -->|technical plan<br/>component tree · API contracts · file list| C[Coder agent]
    C -->|source files| T[Tester agent]
    T -->|test files| R[PR-review agent]
    R -->|changes requested| C
    R -->|approved| D[Deploy gate]
    D --> O[(out/ + deploy-plan.json)]

    subgraph Blackboard[Shared blackboard + token budget]
      P --- C --- T --- R --- D
    end
```

Each agent reads from and writes to a shared **blackboard** (`src/blackboard.ts`)
that also enforces a run-wide **token budget** — a runaway agent can't burn
unbounded tokens. The orchestrator (`src/pipeline.ts`) detects unresolved review
loops and stops after `--max-rounds`.

### Providers

Every LLM call goes through the `Llm` facade (`src/llm.ts`), which delegates to a
provider implementing a small interface (`src/providers/types.ts`). The facade
owns the cross-provider concerns (budget guard, Zod↔JSON-Schema conversion,
usage accounting, schema validation), so agents never change when you switch
providers.

| Provider | Key | `structured()` | `generate()` |
|----------|-----|----------------|--------------|
| Claude (Anthropic) | `ANTHROPIC_API_KEY` | forced tool use | streamed messages |
| ChatGPT (OpenAI) | `OPENAI_API_KEY` | forced function tool | streamed chat completions |
| Gemini (Google) | `GEMINI_API_KEY` | JSON mode + `responseSchema` | `generateContentStream` |

| Agent | File | Responsibility | Claude call |
|-------|------|----------------|-------------|
| Planner | `src/agents/planner.ts` | Decompose into component tree, typed API contracts, and a file list | structured output (Zod) |
| Coder | `src/agents/coder.ts` | Generate source files that respect repo conventions | streamed text |
| Tester | `src/agents/tester.ts` | Author Jest + RNTL tests for the generated source | streamed text |
| Reviewer | `src/agents/reviewer.ts` | Flag security/perf/correctness/coverage issues; approve or block | structured output (Zod) |
| Deployer | `src/agents/deployer.ts` | Gate: write artifacts + deploy plan only on a green review | — |

## Quick start

```bash
npm install
cp .env.example .env        # add the key for your chosen provider

# Run the full pipeline on the bundled example (Claude by default)
npm run dev -- run \
  --feature examples/feature.md \
  --design examples/design-tokens.json \
  --conventions examples/conventions.md \
  --out out

# Use a different provider
ASDLC_PROVIDER=openai OPENAI_API_KEY=sk-... npm run dev -- run -f examples/feature.md
# …or pass it inline
npm run dev -- run -f examples/feature.md --provider gemini --api-key "$GEMINI_API_KEY"
```

Build and run the compiled CLI:

```bash
npm run build
node dist/index.js run -f examples/feature.md -d examples/design-tokens.json -o out
```

### CLI

```
asdlc run --feature <path> [options]

  -f, --feature <path>       feature request (.md or .txt)        [required]
  -d, --design <path>        exported Figma design-tokens JSON
  -c, --conventions <path>   repo conventions file
  -o, --out <dir>            output directory (default: "out")
  -r, --max-rounds <n>       max review→fix rounds (default: 2)
  -p, --provider <id>        anthropic | openai | gemini (default: anthropic)
  -m, --model <id>           model id (defaults to the provider's best model)
  -k, --api-key <key>        API key (falls back to the provider env var)
```

The process exits `0` when the deploy gate is green, non-zero otherwise — so it
drops straight into a CI job.

## Web interface

A browser UI lets a user pick a provider, paste **their own** API key, supply
the feature/design/conventions inputs, and watch the pipeline run live (phase
timeline, token usage vs budget, the review verdict, and the generated files to
view/download).

```bash
# 1. Build the backend and start the API + static server (default :3001)
npm run build
npm run server

# 2. In another terminal, run the frontend dev server (default :5173, proxies /api)
cd web
npm install
npm run dev
```

For a single-process production setup, build the frontend (`cd web && npm run
build`) and the Express server will serve `web/dist` directly on `:3001`.

> **Key handling:** the API key is sent with each run request, held only in
> memory for that run, and **never written to disk, logged, or echoed back** in
> any progress event or error. Closing the tab discards it.

## How it works

1. **Plan** — the planner returns a schema-validated `TechnicalPlan` (component
   tree, API contracts, and every file to create). Structured outputs guarantee
   the next agent receives typed data, not prose.
2. **Build** — the coder generates the source files; the tester writes matching
   Jest tests. Files are emitted in a strict delimited format and parsed
   deterministically.
3. **Review** — the reviewer cross-references the diff against the plan and
   conventions and returns a structured verdict. Blocking findings loop back to a
   fix pass; otherwise the run is approved.
4. **Deploy** — the gate writes artifacts and a `deploy-plan.json` only on a
   green review.

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `ASDLC_PROVIDER` | `anthropic` | `anthropic` \| `openai` \| `gemini` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | — | key for the selected provider (CLI only) |
| `ASDLC_MODEL` | per-provider best | model id override |
| `ASDLC_TOKEN_BUDGET` | `200000` | abort the run if cumulative tokens exceed this |
| `PORT` | `3001` | web server port |

## License

MIT © Harpalsinh Jadav
