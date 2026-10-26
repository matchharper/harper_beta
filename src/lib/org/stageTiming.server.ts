import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type Timing = { id: string; started: number };
const timing = new AsyncLocalStorage<Timing>();
function logStep(context: Timing, step: string, started: number, status: string) {
  const row = { traceId: context.id, step, ms: Math.round(performance.now() - started), elapsedMs: Math.round(performance.now() - context.started), status };
  console.log("[org-stage-timing]", JSON.stringify(row));
  try {
    const dir = join(process.cwd(), ".local", "stage-latency");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    appendFileSync(join(dir, "timings.ndjson"), JSON.stringify(row) + "\n", { mode: 0o600 });
  } catch { /* Diagnostics must never change the action outcome. */ }
}
export async function traceStageStep<T>(step: string, run: () => PromiseLike<T>): Promise<T> {
  const context = timing.getStore();
  if (!context) return run();
  const started = performance.now();
  try { const result = await run(); logStep(context, step, started, "ok"); return result; }
  catch (error) { logStep(context, step, started, "error"); throw error; }
}
export async function withStageTiming<T>(run: () => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV === "production") return run();
  const context = { id: crypto.randomUUID(), started: performance.now() };
  return timing.run(context, () => traceStageStep("request.total", run));
}
