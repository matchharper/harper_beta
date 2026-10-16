export type BillingPeriod = "monthly" | "yearly";
export type BillingProviderStatus =
  | "active"
  | "past_due"
  | "cancel_scheduled"
  | "expired";

export function getActiveSubscriptionOrFilter(nowIso: string) {
  return `current_period_end.gte.${nowIso},grace_ends_at.gte.${nowIso}`;
}
