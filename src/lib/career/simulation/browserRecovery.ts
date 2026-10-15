import { agentsRequest } from "./agentsApi";

export type BrowserTurn = {
  id: string;
  status: string;
  subagent_id?: string | null;
  model?: string;
  usage?: Record<string, unknown> | null;
  error?: { code?: string; message?: string } | null;
};

/** Reconcile persisted provider state; a stream event is not an application outcome. */
export async function inspectBrowserTurn(sessionId: string) {
  const turns = await agentsRequest<{ data: BrowserTurn[] }>(
    `sessions/${encodeURIComponent(sessionId)}/turns?order=desc&limit=20`
  );
  return turns.data?.find((turn) => !turn.subagent_id);
}

export async function browserDiagnostic(sessionId: string, turn?: BrowserTurn) {
  const items = await agentsRequest<{ data: Array<Record<string, unknown>> }>(
    `sessions/${encodeURIComponent(sessionId)}/items?order=desc&limit=12${turn ? `&turn_id=${encodeURIComponent(turn.id)}` : ""}`
  );
  // Bounded diagnostic snapshot, never passed to the final-writing model.
  return {
    turnId: turn?.id,
    status: turn?.status,
    error: turn?.error?.message?.slice(0, 2000),
    items: JSON.stringify(items.data ?? []).slice(0, 16000),
  };
}

export const browserRecoveryInstruction = `Your previous turn ended without an application outcome. Continue in the SAME existing browser page using the user's already supplied answers. Inspect the current page first; do not restart or reload the form. If final submission might already have happened, only inspect for confirmation and report the observed outcome; never submit again. Otherwise finish the remaining preparation, ask for missing information if necessary, and request confirm_application_submission before any final Submit. If blocked, call report_application_outcome with the actual blocker and observed page evidence. Do not end with only prose: request input or report the outcome.`;
