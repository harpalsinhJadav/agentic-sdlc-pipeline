import type { PipelineEvent, ProviderInfo, RunInput } from "./types";

export async function fetchProviders(): Promise<ProviderInfo[]> {
  const res = await fetch("/api/providers");
  if (!res.ok) throw new Error(`Failed to load providers (${res.status})`);
  const data = (await res.json()) as { providers: ProviderInfo[] };
  return data.providers;
}

/**
 * POST the run request and consume the Server-Sent Events stream. EventSource
 * can't issue a POST (we must send the key in the body, never a query string),
 * so we read the fetch body stream and parse SSE frames ourselves.
 */
export async function runPipeline(
  input: RunInput,
  onEvent: (e: PipelineEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });

  if (!res.ok) {
    // Validation errors come back as JSON before the stream opens.
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (!res.body) throw new Error("No response stream.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice("data:".length).trim()) as PipelineEvent);
      } catch {
        /* skip malformed frame */
      }
    }
  }
}
