import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { browserUseAgents } from "./simulation/browserUseAgents";
import { listOperations, readOperation, updateOperation } from "./externalOperations/store";
import { assertApplicationOperationsQuiescent } from "./devApplicationCheckpointGuard";
import type { CareerCheckpoint } from "./devCheckpointData";

/** Reset closes only idle preparation browsers. CAS acquires each session before
 * provider cleanup, so a racing run/handoff aborts instead of being cancelled. */
export async function closeCheckpointPreparationBrowsers(snapshot: CareerCheckpoint) {
  return closeIdlePreparationBrowsers(snapshot.user.id, snapshot.tables.talent_external_operations);
}

export async function closeIdlePreparationBrowsers(userId: string, baseline?: Record<string, unknown>[]) {
  const context = { admin: getTalentSupabaseAdmin(), userId };
  const operations = await listOperations(context, {});
  const closable = operations.filter(row => row.kind === "browser_session" && row.result.control_source !== "user" && (
    ["idle", "ready"].includes(row.status) ||
    (row.status === "closing" && row.result.requested_action === "close" && row.result.control_source === "assistant")
  ));
  const ids = new Set(closable.map(row => row.id));
  // Active work, uncertain submissions and human control fail before cleanup.
  assertApplicationOperationsQuiescent(
    operations.map(row => ids.has(row.id) ? { ...row, status: "closed" } : row),
    baseline ?? operations
  );
  for (const row of closable) {
    const claimed = await updateOperation(context, row, {
      status: "closing",
      result: { ...row.result, requested_action: "close", control_source: "assistant" },
    });
    await browserUseAgents.stop({
      sessionId: typeof row.provider_refs.session_id === "string" ? row.provider_refs.session_id : undefined,
      workspaceId: typeof row.provider_refs.workspace_id === "string" ? row.provider_refs.workspace_id : undefined,
    });
    try {
      await updateOperation(context, claimed, {
        status: "closed",
        result: { ...claimed.result, summary: "Browser closed and workspace files removed for checkpoint restore." },
      });
    } catch (error) {
      // The viewer may reconcile the same claimed close while provider cleanup
      // is in flight. Accept its persisted terminal result, never another state.
      const current = await readOperation(context, row.id);
      if (current?.status !== "closed") throw error;
    }
  }
}
