export type BillingPeriod = "monthly" | "yearly";
export type BillingPlanKey = "pro" | "max";
export type BillingProvider = "toss" | "polar" | "lemonsqueezy";
export type BillingProviderStatus =
  | "active"
  | "past_due"
  | "cancel_scheduled"
  | "expired";
export type BillingSessionReason = "signup" | "recover";
export type BillingAttemptReason =
  | "initial_purchase"
  | "renewal"
  | "retry"
  | "plan_change"
  | "recovery";

const DAY_MS = 24 * 60 * 60 * 1000;

export function billingToCycle(period: BillingPeriod) {
  return period === "yearly" ? 1 : 0;
}

export function cycleToBilling(cycle?: number | null): BillingPeriod | null {
  if (cycle === 1) return "yearly";
  if (cycle === 0) return "monthly";
  return null;
}

export function addBillingPeriod(
  anchor: Date | string,
  billing: BillingPeriod
): Date {
  const base = anchor instanceof Date ? new Date(anchor) : new Date(anchor);
  const next = new Date(base);
  const day = next.getDate();

  if (billing === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }

  if (next.getDate() < day) {
    next.setDate(0);
  }

  return next;
}

export function getActiveSubscriptionOrFilter(nowIso: string) {
  return `current_period_end.gte.${nowIso},grace_ends_at.gte.${nowIso}`;
}

export function buildTossCustomerKey(userId: string) {
  return userId.trim();
}

export function getRetryNextAt(
  dueAt: Date | string,
  retryCount: number
): Date | null {
  const anchor = dueAt instanceof Date ? new Date(dueAt) : new Date(dueAt);
  if (Number.isNaN(anchor.getTime())) return null;

  if (retryCount === 1) {
    return new Date(anchor.getTime() + DAY_MS);
  }
  if (retryCount === 2) {
    return new Date(anchor.getTime() + 3 * DAY_MS);
  }
  if (retryCount === 3) {
    return new Date(anchor.getTime() + 7 * DAY_MS);
  }
  return null;
}

export function getGraceEndsAt(dueAt: Date | string) {
  const anchor = dueAt instanceof Date ? new Date(dueAt) : new Date(dueAt);
  return new Date(anchor.getTime() + 7 * DAY_MS);
}

export function buildOrderId(prefix: string, seed: string) {
  const safePrefix = prefix.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20);
  const safeSeed = seed.replace(/[^A-Za-z0-9_-]/g, "");
  const body = `${safePrefix}_${safeSeed}`;
  return body.slice(0, 64);
}

export function isLegacyProvider(
  provider?: BillingProvider | null
): provider is "polar" | "lemonsqueezy" {
  return provider === "polar" || provider === "lemonsqueezy";
}
