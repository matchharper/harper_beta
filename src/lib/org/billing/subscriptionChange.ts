import { billingDb, billingRpc, throwBillingDbError } from "./store";
import { getBillingStripe, timestamp } from "./stripe";
import { WorkspaceBillingError } from "./types";

type SubscriptionChange = {
  id: string;
  createdAt: string;
  subscriptionId: string;
  itemId: string;
  quantity: number;
  cancelSubscription: boolean;
};

// DB and Stripe cannot commit together. Persist the immutable requested change
// before sending it, then replay the SAME Stripe idempotency key on recovery.
export async function executeSubscriptionChange(
  workspaceId: string,
  change: SubscriptionChange
) {
  if (Date.now() - Date.parse(change.createdAt) > 23 * 3600_000)
    throw new WorkspaceBillingError("billing_conflict");
  const subscription = await getBillingStripe().subscriptions.update(
    change.subscriptionId,
    {
      items: [{ id: change.itemId, quantity: change.quantity }],
      cancel_at_period_end: change.cancelSubscription,
      proration_behavior: "none",
    },
    { idempotencyKey: `workspace-slot-change:${change.id}` }
  );
  await billingRpc("workspace_billing_finish_change_v1", {
    p_workspace: workspaceId,
    p_change: change.id,
    p_period_end: timestamp(subscription.items.data[0].current_period_end),
  });
}

export async function recoverSubscriptionChange(workspaceId: string) {
  const { data, error } = await billingDb()
    .from("company_workspace_slots")
    .select("billing_change")
    .eq("company_workspace_id", workspaceId)
    .not("billing_change", "is", null)
    .maybeSingle();
  throwBillingDbError(error);
  if (data?.billing_change)
    await executeSubscriptionChange(workspaceId, data.billing_change);
}
