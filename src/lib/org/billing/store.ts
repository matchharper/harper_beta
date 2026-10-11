import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { WorkspaceBillingError, type BillingSummary } from "./types";

// These tables ship with the billing migration. Keep the type escape at this
// boundary until the shared generated database snapshot is regenerated.
export const billingDb = () => getSupabaseAdmin() as SupabaseClient<any>;
export function throwBillingDbError(error: { message?: string } | null) {
  if (!error) return;
  const message = error.message ?? "";
  if (message.includes("workspace_feature_unavailable"))
    throw new WorkspaceBillingError("feature_unavailable", 403);
  if (message.includes("workspace_credits_exhausted"))
    throw new WorkspaceBillingError("credits_exhausted");
  if (message.includes("workspace_role_capacity_exceeded"))
    throw new WorkspaceBillingError("role_capacity_exceeded");
  if (message.includes("workspace_role_slot_required"))
    throw new WorkspaceBillingError("role_slot_required");
  if (message.includes("billing_") && message.includes("conflict"))
    throw new WorkspaceBillingError("billing_conflict");
  throw error;
}
export async function billingRpc<T>(
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const { data, error } = await billingDb().rpc(name, args);
  throwBillingDbError(error);
  return data as T;
}
export async function getBillingSummary(workspaceId: string) {
  const data = await billingRpc<
    (Omit<BillingSummary, "canManage"> & { balance?: number | null }) | null
  >("workspace_billing_summary_v2", { p_workspace: workspaceId });
  // Older RPC responses omit creditSlots. Do not expose them as a valid
  // summary or turn unknown slot balances into an empty list / zero credits.
  if (!data || !Array.isArray(data.creditSlots) || !Array.isArray(data.slots))
    throw new WorkspaceBillingError("billing_unavailable", 503);
  const { balance: _diagnosticTotal, ...summary } = data;
  return summary;
}
export async function billingWorkspace(workspaceId: string) {
  const { data, error } = await billingDb()
    .from("company_workspace")
    .select(
      "company_workspace_id,company_name,billing_model,billing_started_at,stripe_customer_id,billing_checkout,signup_state"
    )
    .eq("company_workspace_id", workspaceId)
    .single();
  throwBillingDbError(error);
  if (!data) throw new WorkspaceBillingError("billing_forbidden", 403);
  return data as {
    signup_state?: import("../signup").WorkspaceSignupState | null;
    company_workspace_id: string;
    company_name: string;
    billing_model: string;
    billing_started_at: string | null;
    stripe_customer_id: string | null;
    billing_checkout: {
      key: string;
      sessionId?: string;
      expiresAt: string;
    } | null;
  };
}
