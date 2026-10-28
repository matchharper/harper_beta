import type Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { getBillingStripe } from "./billing/stripe";
import { OrgHttpError } from "./httpError";
import {
  WORKSPACE_DELETION_ERRORS,
  workspaceDeletionErrorCode,
  type WorkspaceDeletionError,
} from "./workspaceDeletion";

function fail(code: WorkspaceDeletionError): never {
  throw new OrgHttpError(WORKSPACE_DELETION_ERRORS[code], code);
}

type DeletionWorkspace = {
  company_name: string;
  stripe_customer_id: string | null;
  billing_checkout: { sessionId?: string; expiresAt?: string } | null;
};

// Read Stripe as well as the local ledger: a completed checkout may precede
// its webhook. Never cancel a subscription as a side effect of deletion.
export async function assertWorkspaceBillingEnded(
  workspace: DeletionWorkspace,
  stripe: Pick<Stripe, "subscriptions" | "checkout">
) {
  const checkout = workspace.billing_checkout;
  if (checkout?.sessionId) {
    const session = await stripe.checkout.sessions.retrieve(checkout.sessionId);
    if (
      (session.status !== "expired" && session.status !== "complete") ||
      (session.status === "complete" && session.payment_status === "unpaid")
    ) {
      fail("workspace_delete_billing_pending");
    }
  } else if (
    checkout &&
    (!checkout.expiresAt ||
      !Number.isFinite(Date.parse(checkout.expiresAt)) ||
      Date.parse(checkout.expiresAt) > Date.now())
  ) {
    fail("workspace_delete_billing_pending");
  }
  if (!workspace.stripe_customer_id) return;
  for await (const subscription of stripe.subscriptions.list({
    customer: workspace.stripe_customer_id,
    status: "all",
    limit: 100,
  })) {
    if (
      subscription.status !== "canceled" &&
      subscription.status !== "incomplete_expired"
    ) {
      fail("workspace_delete_subscription_active");
    }
  }
}

export async function deleteOrgWorkspace(args: {
  userId: string;
  workspaceId: unknown;
  confirmationName: unknown;
}) {
  const { workspaceId, confirmationName } = args;
  if (
    typeof workspaceId !== "string" ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(workspaceId) ||
    typeof confirmationName !== "string" ||
    !confirmationName.trim()
  ) {
    throw new OrgHttpError(400, "workspace_delete_invalid_request");
  }
  const admin = getSupabaseAdmin();
  // Do not use the cached permissions or the internal-domain access bypass.
  const { data: membership, error: membershipError } = await admin
    .from("company_user_workspace")
    .select("authority")
    .eq("company_workspace_id", workspaceId)
    .eq("company_user_id", args.userId)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (membership?.authority !== "owner")
    fail("workspace_delete_owner_required");
  const { data: workspace, error: workspaceError } = await admin
    .from("company_workspace")
    .select("company_name,stripe_customer_id,billing_checkout")
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace) fail("workspace_delete_not_found");
  if (workspace.company_name.trim() !== confirmationName.trim())
    fail("workspace_delete_name_mismatch");
  if (workspace.stripe_customer_id || workspace.billing_checkout) {
    try {
      await assertWorkspaceBillingEnded(
        workspace as DeletionWorkspace,
        getBillingStripe()
      );
    } catch (error) {
      if (workspaceDeletionErrorCode(error)) throw error;
      console.error(
        "[org/workspace/delete] billing verification failed",
        error
      );
      fail("workspace_delete_billing_unavailable");
    }
  }
  const { error } = await admin.rpc("delete_company_workspace_v1", {
    p_workspace: workspaceId,
    p_actor: args.userId,
    p_confirmation_name: confirmationName.trim(),
    p_stripe_customer: workspace.stripe_customer_id,
    p_billing_checkout: workspace.billing_checkout,
  });
  if (error) {
    const code = workspaceDeletionErrorCode(error);
    if (code) fail(code);
    throw error;
  }
  return { ok: true as const, workspaceId };
}
