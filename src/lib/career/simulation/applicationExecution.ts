import { formatToolError } from "@/lib/llm/toolError";
import type { SimulationSession } from "./session";
import type { ApplicationBrowserState } from "./applicationBrowser";

/** Submission evidence, not the History card's manually editable applied label. */
export function applicationSubmissionState(state: SimulationSession) {
  const b = state.browser;
  if (!b) return "not_submitted" as const;
  if (b.status === "succeeded" && b.approval?.approved && b.approval.executed && b.result?.evidence.trim())
    return "confirmed" as const;
  const approvedEarlierRequest = state.activity?.batches.some(batch =>
    batch.browser?.runId === b.id && batch.browser.kind === "submission" &&
    Object.values(batch.responses).some(response => response.decision === "answer" && response.optionId === "submit")
  );
  if (b.status === "succeeded" || b.status === "uncertain" || b.transmissionAttemptedAt || (b.engine !== "browser-use-agents" && (b.approval?.approved || b.approval?.executed || approvedEarlierRequest)))
    return "unknown" as const;
  // Legacy planner-only sessions did not enforce the website request approval gate.
  return b.sessionId && !b.driver && b.engine !== "browser-use-agents" ? "unknown" as const : "not_submitted" as const;
}

export function applicationExecutionFacts(state: SimulationSession) {
  const b = state.browser;
  if (!b) return undefined;
  return {
    runId: b.id, status: b.status, stage: b.stage,
    documentId: b.documentId, url: b.url,
    browserStarted: Boolean(b.driver || b.sessionId),
    submission: applicationSubmissionState(state),
    failure: b.failure ?? (b.diagnostic?.error ? { stage: b.stage ?? "unknown", error: formatToolError(b.diagnostic.error) } : undefined),
    result: b.result,
    previousAttempts: b.previousAttempts?.map(attempt => ({
      runId: attempt.id, status: attempt.status, result: attempt.result,
      failure: attempt.failure ?? (attempt.diagnostic?.error ? { error: formatToolError(attempt.diagnostic.error) } : undefined),
    })),
  };
}

export function applicationStartResult(state: SimulationSession, started = false) {
  const b = state.browser!;
  const inProgress = ["queued", "running"].includes(b.status) || Boolean(b.leaseUntil && Date.parse(b.leaseUntil) > Date.now());
  const waiting = b.status === "waiting";
  const requiresExplicitRestart = !inProgress && !waiting && applicationSubmissionState(state) !== "not_submitted";
  return {
    ok: started || inProgress || waiting || applicationSubmissionState(state) === "confirmed",
    started, applicationInProgress: inProgress,
    awaitingUserInput: inProgress || waiting,
    requiresExplicitRestart,
    canRetry: !inProgress && !waiting && applicationSubmissionState(state) === "not_submitted",
    application: applicationExecutionFacts(state),
  };
}

export function archiveApplicationAttempt(b: ApplicationBrowserState) {
  const { previousAttempts: _, driver: _driver, files: _files, progress: _progress, pendingRequest: _pending, ...attempt } = b;
  return [...(b.previousAttempts ?? []), attempt];
}
