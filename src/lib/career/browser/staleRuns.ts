import { ownsCareerExecution } from "../executionEnvironment";
import type { ExternalOperation, ExternalToolContext } from "../externalOperations/store";

// Past the chat request's 480s limit (api/talent/chat maxDuration), so the request that started a run has ended and
// the minute check is the only reader left.
const OBSERVE_AFTER_MS = 10 * 60_000;
const ABANDONED_AFTER_MS = 15 * 60_000;

/**
 * The minute check re-reads browser runs nobody is watching any more. A run whose chat request ended keeps its
 * last saved status until someone asks Browser Use again, so a finished run could stay "running" and the reply
 * waiting on it (an email reply especially) never resumed. Reading it here saves the real outcome; the existing
 * checkpoint recovery then resumes the waiting reply, and Harper tells the candidate what happened.
 */
export async function reconcileStaleBrowserRuns(scope: { admin: ExternalToolContext["admin"]; deadlineAt?: number }) {
  const { refreshBrowserExecution, closeUndispatchedBrowserRun } = await import("./tool");
  const now = Date.now();
  const { data, error } = await (scope.admin.from as any)("talent_external_operations").select("*")
    .eq("kind", "browser_run").in("status", ["reserved", "preparing", "running", "cancelling"])
    .lt("updated_at", new Date(now - OBSERVE_AFTER_MS).toISOString()).order("updated_at").limit(40);
  if (error) throw error;
  const observed = { refreshed: 0, closed: 0, failed: 0 };
  for (const row of ((data ?? []) as ExternalOperation[]).filter(run => ownsCareerExecution(run.request.execution_environment)).slice(0, 20)) {
    if (scope.deadlineAt && Date.now() >= scope.deadlineAt) break;
    const context = { admin: scope.admin, userId: row.user_id };
    try {
      if (["reserved", "preparing"].includes(row.status)) {
        if (now - Date.parse(row.updated_at) < ABANDONED_AFTER_MS) continue;
        if ((await closeUndispatchedBrowserRun(context, row)).status === "cancelled") observed.closed += 1;
        continue;
      }
      const latest = await refreshBrowserExecution(context, row);
      if (latest.status !== row.status) observed.refreshed += 1;
    } catch (error) {
      const { BrowserUseHttpError } = await import("../simulation/browserUseAgents");
      if (error instanceof BrowserUseHttpError && error.status === 404) {
        // The provider has no record left to read, so the outcome stays unknown rather than "not submitted".
        const { updateOperation } = await import("../externalOperations/store");
        const failed = await updateOperation(context, row, { status: "failed", result: { ...row.result,
          summary: "Browser Use no longer has this run, so whether it entered or submitted anything is unknown.",
          evidence: [], needsUser: false, url: "", submitted: "unclear" } }).catch(() => null);
        // A terminal run releases its browser session the same way a read result does.
        if (failed) await refreshBrowserExecution(context, failed).catch(() => undefined);
        observed.refreshed += 1;
        continue;
      }
      observed.failed += 1;
      console.warn("[career] Stale browser run observation failed", { id: row.id, error: String(error) });
    }
  }
  return observed;
}
