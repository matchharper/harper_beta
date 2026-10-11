export const MAX_SLOT_PURCHASE_QUANTITY = 100;
export function isSlotPurchaseQuantity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= MAX_SLOT_PURCHASE_QUANTITY
  );
}

export const FREE_MONTHLY_CREDITS = 10;
export const SLOT_MONTHLY_CREDITS = 50;
export const BILLING_SUPPORT_EMAIL = "chris@matchharper.com";
export const BILLING_SUPPORT_HREF = `mailto:${BILLING_SUPPORT_EMAIL}`;

export type BillingModel = "free" | "slot" | "scale" | "legacy";
export type BillingInterval = "month" | "year";
export type BillingErrorCode =
  | "feature_unavailable"
  | "credits_exhausted"
  | "role_capacity_exceeded"
  | "role_slot_required"
  | "billing_unavailable"
  | "billing_conflict"
  | "billing_forbidden"
  | "billing_owner_required";

// Only the transport/UI reads code. Ordinary company-side LLM error handling
// receives the business failure in message, without billing facts.
export class WorkspaceBillingError extends Error {
  constructor(
    public readonly code: BillingErrorCode,
    public readonly status = 409
  ) {
    super("요청을 완료하지 못했어요. Harper 팀에 문의해 주세요.");
    this.name = "WorkspaceBillingError";
  }
}

/** Display-only failure information, never a company-side LLM tool result. */
export type BillingActionNotice = { code: "credits_exhausted" };

export function billingActionNotice(
  error: unknown
): BillingActionNotice | null {
  return error instanceof WorkspaceBillingError &&
    error.code === "credits_exhausted"
    ? { code: error.code }
    : null;
}

export type BillingCatalog = {
  available: boolean;
  amount: number | null;
  annualAmount: number | null;
  testMode: boolean;
  currency: string | null;
  taxBehavior: "inclusive" | "exclusive" | "unspecified";
};

export type BillingSlot = {
  id: string;
  // Missing only while the additive database migration is rolling out.
  source?: "stripe" | "grant";
  label: string;
  roleId: string | null;
  roleName: string | null;
  status: string;
  startedAt: string;
  periodEnd: string | null;
  billingInterval: BillingInterval;
  creditsRenewAt: string | null;
  cancelAt: string | null;
  endedAt: string | null;
  remaining: number;
  active: boolean;
  revision: number;
  recurringAmount?: number | null;
  currency?: string | null;
};

export type BillingCreditSlot = {
  id: string;
  slotId: string | null;
  label: string;
  roleId: string | null;
  roleName: string | null;
  remaining: number;
  allowance: number;
  renewsAt: string | null;
  cancelAt: string | null;
};

export type BillingSummary = {
  workspaceId: string;
  model: BillingModel;
  activeRoles: number;
  capacity: number | null;
  creditSlots: BillingCreditSlot[];
  freeRenewsAt: string | null;
  slots: BillingSlot[];
  hasCustomer: boolean;
  canManage: boolean;
};

export type BillingEntitlements = {
  capacity: number | null;
  activeRoles: number;
  pendingConnections: boolean;
  creditSlots: BillingCreditSlot[];
};

// Paid connection access is attached to a Role's Slot. Legacy and Enterprise
// have no finite pools and retain their existing workspace-wide access.
export function canUsePendingConnections(
  entitlements: BillingEntitlements | undefined,
  roleId: string | null | undefined
) {
  if (!entitlements?.pendingConnections || !roleId) return false;
  return (
    entitlements.creditSlots.length === 0 ||
    entitlements.creditSlots.some(
      (slot) => slot.slotId !== null && slot.roleId === roleId
    )
  );
}

export function isLowCreditBalance(balance: number | null | undefined) {
  return typeof balance === "number" && balance >= 0 && balance <= 10;
}

export function isEndedBillingSlot(slot: BillingSlot, now = Date.now()) {
  return (
    !slot.active &&
    (["canceled", "incomplete_expired"].includes(slot.status) ||
      (slot.endedAt !== null && Date.parse(slot.endedAt) <= now) ||
      (slot.cancelAt !== null && Date.parse(slot.cancelAt) <= now))
  );
}

export function creditSlotForRole(
  slots: BillingCreditSlot[] | undefined,
  roleId: string | null | undefined
) {
  return roleId
    ? (slots?.find(
        (slot) =>
          slot.slotId !== null && slot.roleId === roleId && slot.remaining > 0
      ) ?? slots?.find((slot) => slot.slotId === null))
    : undefined;
}

export type BillingInvoice = {
  id: string;
  planName?: string | null;
  number: string | null;
  date: string;
  amountPaid: number;
  amountDue: number;
  currency: string;
  status: string;
  hostedUrl: string | null;
  pdfUrl: string | null;
};

export type BillingUsage = {
  id: string;
  action: "intro_request" | "connect";
  createdAt: string;
  roleName: string | null;
  slotLabel: string | null;
  delta: number;
};

export function billingErrorCopy(code: BillingErrorCode, locale: "ko" | "en") {
  const copy: Record<BillingErrorCode, [string, string]> = {
    feature_unavailable: [
      "연결 대기는 유료 슬롯에 연결된 Role에서 이용할 수 있어요. Slots에서 Role 배정을 확인해 주세요.",
      "Ready to connect is available for Roles assigned to a paid slot. Review Role assignments in Slots.",
    ],
    credits_exhausted: [
      "이 Role에서 사용할 수 있는 슬롯 크레딧과 공용 크레딧이 모두 소진됐어요. Harper 팀에 문의해 주세요.",
      "There are no slot or shared credits available for this Role. Contact the Harper team.",
    ],
    role_slot_required: [
      "이 Role의 채용을 시작한 뒤 다시 시도해 주세요.",
      "Start hiring for this Role before trying again.",
    ],
    role_capacity_exceeded: [
      "Role을 시작하지 못했어요. 새로고침한 뒤 다시 시도해 주세요. Role 수에는 제한이 없어요.",
      "Could not start this Role. Refresh and try again. Roles are unlimited.",
    ],
    billing_unavailable: [
      "결제 정보를 불러오지 못했어요. 잠시 후 다시 시도하거나 Harper 팀에 문의해 주세요.",
      "Billing is unavailable right now. Try again shortly or contact the Harper team.",
    ],
    billing_conflict: [
      "구독 상태가 변경됐어요. 새로고침한 뒤 다시 확인해 주세요.",
      "Your subscription has changed. Refresh the page and review the latest details.",
    ],
    billing_forbidden: [
      "구독은 Organization의 Owner 또는 Admin이 관리할 수 있어요.",
      "An Organization Owner or Admin can manage subscriptions.",
    ],
    billing_owner_required: [
      "결제 내역과 결제 수단은 Organization의 Owner만 확인하고 관리할 수 있어요.",
      "Only an Organization Owner can view billing history and manage payment details.",
    ],
  };
  return copy[code][locale === "ko" ? 0 : 1];
}

export function isBillingErrorCode(value: unknown): value is BillingErrorCode {
  return (
    typeof value === "string" &&
    [
      "feature_unavailable",
      "credits_exhausted",
      "role_capacity_exceeded",
      "role_slot_required",
      "billing_unavailable",
      "billing_conflict",
      "billing_forbidden",
      "billing_owner_required",
    ].includes(value)
  );
}

export function formatBillingMoney(
  amount: number,
  currency: string,
  locale: "ko" | "en",
  display?: Pick<
    Intl.NumberFormatOptions,
    "minimumFractionDigits" | "currencyDisplay"
  >
) {
  // Stripe amounts use minor units; zero-decimal currencies (including KRW)
  // must not be divided by 100.
  const zeroDecimal = new Set([
    "bif",
    "clp",
    "djf",
    "gnf",
    "jpy",
    "kmf",
    "krw",
    "mga",
    "pyg",
    "rwf",
    "ugx",
    "vnd",
    "vuv",
    "xaf",
    "xof",
    "xpf",
  ]);
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
    ...display,
  }).format(amount / (zeroDecimal.has(currency.toLowerCase()) ? 1 : 100));
}
