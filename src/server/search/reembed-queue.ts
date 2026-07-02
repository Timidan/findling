/**
 * Debounced, in-process re-embed queue (persistent Node server on the droplet).
 *
 * A curation edits a moment's discovery text, which requires re-embedding. Doing
 * that synchronously inside the request let a burst of curations on one moment
 * trigger a re-embed + HNSW write PER call (cost/CPU/write-storm — see AUDIT S1).
 * Instead we coalesce: many curations on the same moment within DEBOUNCE_MS
 * collapse into a SINGLE re-embed, off the request path.
 *
 * Best-effort by design: it's an in-memory timer (lost on restart), so a missed
 * re-embed only means slightly-stale search until the next curation or a periodic
 * re-embed sweep — never a correctness issue. The dynamic import keeps the heavy
 * embedding/ONNX module out of the caller's static graph.
 */
const DEBOUNCE_MS = 4_000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleReembed(momentId: string): void {
  const existing = timers.get(momentId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    timers.delete(momentId);
    void (async () => {
      try {
        const { upsertMomentEmbedding } = await import("./embeddings");
        await upsertMomentEmbedding(momentId);
      } catch (e) {
        console.error("[reembed-queue] re-embed failed for", momentId, e);
      }
    })();
  }, DEBOUNCE_MS);
  // Don't keep the process alive solely for a pending re-embed.
  if (typeof t.unref === "function") t.unref();
  timers.set(momentId, t);
}
