import { useEffect, useRef, useState } from "react";
import { fetchProviders, runPipeline } from "./api";
import type {
  GeneratedFile,
  PipelineEvent,
  ProviderId,
  ProviderInfo,
} from "./types";

interface TimelineItem {
  phase: string;
  message: string;
  round?: number;
}

export function App() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState<ProviderId>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [feature, setFeature] = useState("");
  const [conventions, setConventions] = useState("");
  const [designText, setDesignText] = useState("");
  const [maxRounds, setMaxRounds] = useState(2);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [usage, setUsage] = useState<Extract<PipelineEvent, { type: "usage" }> | null>(null);
  const [review, setReview] = useState<Extract<PipelineEvent, { type: "review" }> | null>(null);
  const [result, setResult] = useState<Extract<PipelineEvent, { type: "done" }> | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchProviders()
      .then((p) => {
        setProviders(p);
        if (p.length) setProvider(p[0].id);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const activeProvider = providers.find((p) => p.id === provider);
  const modelPlaceholder = activeProvider?.defaultModel ?? "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey || !feature) {
      setError("API key and feature spec are required.");
      return;
    }

    let design: unknown;
    if (designText.trim()) {
      try {
        design = JSON.parse(designText);
      } catch {
        setError("Design tokens must be valid JSON.");
        return;
      }
    }

    setError(null);
    setTimeline([]);
    setUsage(null);
    setReview(null);
    setResult(null);
    setOpenFile(null);
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await runPipeline(
        {
          provider,
          apiKey,
          model: model.trim() || undefined,
          feature,
          conventions: conventions.trim() || undefined,
          design,
          maxRounds,
        },
        (ev) => handleEvent(ev),
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function handleEvent(ev: PipelineEvent) {
    switch (ev.type) {
      case "phase":
        setTimeline((t) => [...t, { phase: ev.phase, message: ev.message, round: ev.round }]);
        break;
      case "usage":
        setUsage(ev);
        break;
      case "review":
        setReview(ev);
        break;
      case "done":
        setResult(ev);
        break;
      case "error":
        setError(ev.message);
        break;
      // "plan" and "files" events are reflected through the timeline + done payload.
      default:
        break;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setRunning(false);
  }

  const pct = usage ? Math.min(100, Math.round((usage.totalTokens / usage.budget) * 100)) : 0;

  return (
    <div className="app">
      <header>
        <h1>Agentic SDLC Pipeline</h1>
        <p className="sub">
          Plan → code → test → review → deploy gate, run by the LLM provider of your choice.
        </p>
      </header>

      <div className="grid">
        <form className="card" onSubmit={onSubmit}>
          <label>
            Provider
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderId)}
              disabled={running}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            API key
            <input
              type="password"
              value={apiKey}
              autoComplete="off"
              placeholder={`Your ${activeProvider?.label ?? provider} key`}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={running}
            />
            <span className="hint">
              🔒 Sent with this run only — never stored on the server or written to disk.
            </span>
          </label>

          <label>
            Model <span className="muted">(optional)</span>
            <input
              type="text"
              value={model}
              placeholder={modelPlaceholder}
              onChange={(e) => setModel(e.target.value)}
              disabled={running}
            />
          </label>

          <label>
            Feature spec
            <textarea
              value={feature}
              rows={6}
              placeholder="Describe the feature to build…"
              onChange={(e) => setFeature(e.target.value)}
              disabled={running}
            />
          </label>

          <label>
            Repo conventions <span className="muted">(optional)</span>
            <textarea
              value={conventions}
              rows={3}
              onChange={(e) => setConventions(e.target.value)}
              disabled={running}
            />
          </label>

          <label>
            Design tokens JSON <span className="muted">(optional)</span>
            <textarea
              value={designText}
              rows={3}
              placeholder='{ "color": { "primary": { "value": "#3366FF" } } }'
              onChange={(e) => setDesignText(e.target.value)}
              disabled={running}
            />
          </label>

          <label>
            Max review→fix rounds
            <input
              type="number"
              min={1}
              max={5}
              value={maxRounds}
              onChange={(e) => setMaxRounds(Number(e.target.value))}
              disabled={running}
            />
          </label>

          {running ? (
            <button type="button" className="btn cancel" onClick={cancel}>
              Cancel run
            </button>
          ) : (
            <button type="submit" className="btn">
              Run pipeline
            </button>
          )}

          {error && <div className="error">{error}</div>}
        </form>

        <section className="card output">
          {usage && (
            <div className="usage">
              <div className="usage-head">
                <span>
                  Tokens {usage.totalTokens.toLocaleString()} / {usage.budget.toLocaleString()}
                </span>
                <span className="muted">
                  in {usage.inputTokens.toLocaleString()} · out {usage.outputTokens.toLocaleString()}
                </span>
              </div>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          <h2>Progress</h2>
          {timeline.length === 0 && !running && (
            <p className="muted">Run the pipeline to see live progress here.</p>
          )}
          <ol className="timeline">
            {timeline.map((t, i) => (
              <li key={i} className={`phase phase-${t.phase}`}>
                <span className="tag">{t.phase}</span>
                <span>{t.message}</span>
              </li>
            ))}
            {running && <li className="phase running">working…</li>}
          </ol>

          {review && (
            <div className={`review ${review.approved ? "approved" : "blocked"}`}>
              <strong>
                {review.approved ? "✓ Review approved" : "✗ Changes requested"}
                {review.blockers > 0 && ` — ${review.blockers} blocking`}
              </strong>
              <p>{review.summary}</p>
              {review.findings.length > 0 && (
                <ul>
                  {review.findings.map((f, i) => (
                    <li key={i}>
                      <code>
                        [{f.severity}/{f.category}]
                      </code>{" "}
                      {f.file}: {f.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result && <Results result={result} openFile={openFile} setOpenFile={setOpenFile} />}
        </section>
      </div>
    </div>
  );
}

function Results({
  result,
  openFile,
  setOpenFile,
}: {
  result: Extract<PipelineEvent, { type: "done" }>;
  openFile: string | null;
  setOpenFile: (p: string | null) => void;
}) {
  const files = result.generatedFiles;
  return (
    <div className="results">
      <h2>
        Result —{" "}
        <span className={result.deployed ? "ok" : "warn"}>
          {result.deployed ? "deploy gate GREEN" : result.approved ? "approved" : "not approved"}
        </span>
      </h2>
      <p className="muted">
        {files.length} files · {result.rounds} round(s) · {result.totalTokens.toLocaleString()} tokens
      </p>
      {files.length > 0 && (
        <>
          <button className="btn small" onClick={() => downloadAll(files)}>
            Download all (.json)
          </button>
          <ul className="files">
            {files.map((f) => (
              <li key={f.path}>
                <button className="filename" onClick={() => setOpenFile(openFile === f.path ? null : f.path)}>
                  <span className={`kind kind-${f.kind}`}>{f.kind}</span>
                  {f.path}
                </button>
                <button className="btn tiny" onClick={() => downloadOne(f)}>
                  ↓
                </button>
                {openFile === f.path && <pre className="code">{f.contents}</pre>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function downloadBlob(name: string, contents: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadOne(f: GeneratedFile) {
  downloadBlob(f.path.split("/").pop() || "file.txt", f.contents);
}

function downloadAll(files: GeneratedFile[]) {
  downloadBlob(
    "generated-files.json",
    JSON.stringify(files.map((f) => ({ path: f.path, kind: f.kind, contents: f.contents })), null, 2),
    "application/json",
  );
}
