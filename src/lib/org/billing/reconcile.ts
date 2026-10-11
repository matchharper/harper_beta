import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { billingDb, billingRpc, throwBillingDbError } from "./store";
import { recoverSubscriptionChange } from "./subscriptionChange";
import { syncWorkspaceSubscriptions } from "./service";
import { setOrgCandidateStage } from "@/lib/org/server";

export async function reconcileWorkspaceBilling(limit = 20) {
  const db = billingDb();
  // Round-robin using an existing timestamp; no scheduler/job table needed.
  const { data: workspaces, error } = await db
    .from("company_workspace")
    .select("company_workspace_id,stripe_customer_id")
    .not("stripe_customer_id", "is", null)
    .order("billing_reconciled_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  throwBillingDbError(error);
  const failures: string[] = [];
  const { data: changes, error: changeError } = await db
    .from("company_workspace_slots")
    .select("company_workspace_id")
    .not("billing_change", "is", null)
    .order("updated_at")
    .limit(limit);
  throwBillingDbError(changeError);
  for (const row of changes ?? []) {
    try {
      await recoverSubscriptionChange(row.company_workspace_id);
    } catch (error) {
      failures.push(row.company_workspace_id);
      console.error(
        "[billing/subscription-change]",
        row.company_workspace_id,
        error
      );
    }
  }
  await billingRpc("workspace_billing_expire_due_v1", { p_limit: 200 });
  for (const row of workspaces ?? []) {
    try {
      if (row.stripe_customer_id)
        await syncWorkspaceSubscriptions(row.company_workspace_id);
      await billingRpc("workspace_billing_reconcile_v1", {
        p_workspace: row.company_workspace_id,
      });
    } catch (error) {
      failures.push(row.company_workspace_id);
      console.error("[billing/reconcile]", row.company_workspace_id, error);
      // Even during a provider outage, known period boundaries must be enforced.
      await billingRpc("workspace_billing_reconcile_v1", {
        p_workspace: row.company_workspace_id,
      });
    }
  }
  const { data: pending, error: pendingError } = await db
    .from("company_workspace_credit_events")
    .select("id,actor_id,action_payload,created_at,attempts")
    .eq("action_code", "connect")
    .is("completed_at", null)
    .or(
      `execution_until.is.null,execution_until.lt.${new Date().toISOString()}`
    )
    .gte("created_at", new Date(Date.now() - 23 * 3600_000).toISOString())
    .lt("attempts", 5)
    .order("created_at")
    .limit(3);
  throwBillingDbError(pendingError);
  for (const event of pending ?? []) {
    try {
      // Reuse the immutable approved machine input, never a newly generated
      // contact. Existing authorization/privacy checks run again in the executor.
      const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(
        event.actor_id
      );
      if (error || !data.user)
        throw error ?? new Error("Approval actor unavailable");
      await setOrgCandidateStage({
        ...event.action_payload.input,
        user: data.user,
      } as Parameters<typeof setOrgCandidateStage>[0]);
    } catch (error) {
      failures.push(event.id);
      console.error("[billing/connection-retry]", event.id, error);
    }
  }
  // Older/ambiguous deliveries must be reconciled by Ops, not resent beyond the
  // provider's idempotency window. Surface them to monitoring as a failed run.
  const { count: unresolved } = await db
    .from("company_workspace_credit_events")
    .select("id", { head: true, count: "exact" })
    .eq("action_code", "connect")
    .is("completed_at", null)
    .or(
      `attempts.gte.5,created_at.lt.${new Date(Date.now() - 23 * 3600_000).toISOString()}`
    );
  return {
    processed: workspaces?.length ?? 0,
    retried: pending?.length ?? 0,
    failures,
    unresolved: unresolved ?? 0,
  };
}
