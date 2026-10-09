import { canUseOrgDevControls } from "@/lib/internalAccess";
import { HARPER_BILLING_WORKSPACE_ID } from "./rollout";
import {
  billingAssignmentSlots,
  isBillingRoleVisible,
  type BillingAssignmentRole,
} from "./assignments";
import {
  FREE_MONTHLY_CREDITS,
  SLOT_MONTHLY_CREDITS,
  type BillingCreditSlot,
  type BillingInterval,
  type BillingSummary,
  type BillingInvoice,
  type BillingUsage,
  type BillingCatalog,
} from "./types";

export const PREVIEW_CARDS = {
  none: { ko: "카드 없음", en: "No card", label: "", expiry: "" },
  visa: {
    ko: "Visa 등록됨",
    en: "Visa saved",
    label: "Visa ···· 4242",
    expiry: "12/2030",
  },
  mastercard: {
    ko: "Mastercard 등록됨",
    en: "Mastercard saved",
    label: "Mastercard ···· 4444",
    expiry: "08/2031",
  },
  expired: {
    ko: "만료된 카드",
    en: "Expired card",
    label: "Visa ···· 0341",
    expiry: "01/2025",
  },
} as const;
export const PREVIEW_SUBSCRIPTIONS = {
  active: ["정상 이용 중", "Active"],
  past_due: ["결제 실패", "Payment failed"],
  ending: ["갱신 취소 · 종료 예정", "Renewal cancelled"],
  ended: ["구독 종료 · Free 전환", "Ended · back to Free"],
  grant: ["제공 슬롯", "Complimentary slots"],
  mixed: ["여러 상태 함께", "Mixed slot states"],
} as const;

// This UI preview is deliberately limited to Harper's own workspace.
export const HARPER_BILLING_PREVIEW_WORKSPACE_ID =
  HARPER_BILLING_WORKSPACE_ID;

export type OrgBillingPreview = {
  userId: string;
  slotCount: number; // Zero represents Free with shared credits and no paid slots.
  interval: BillingInterval;
  startedAt: string;
  card?: keyof typeof PREVIEW_CARDS;
  subscription?: keyof typeof PREVIEW_SUBSCRIPTIONS;
  credits?: "full" | "low" | "empty";
  history?: "empty" | "sample";
  checkoutOutcome?: "success" | "declined" | "authentication";
  // Only synthetic slot identifiers are accepted by the local preview controls.
  slotRenewals?: Record<string, "active" | "ending">;
  slotAssignments?: Record<string, { roleId: string; roleName: string } | null>;
};

export function previewCard(preview: OrgBillingPreview) {
  return preview.card ?? (preview.slotCount > 0 ? "visa" : "none");
}

export function previewCatalog(catalog?: BillingCatalog): BillingCatalog {
  return catalog?.available
    ? catalog
    : {
        available: true,
        amount: 24900,
        annualAmount: 238800,
        currency: "usd",
        taxBehavior: "exclusive",
        testMode: true,
      };
}

export function canPreviewOrgBilling(
  workspaceId: string,
  email?: string | null
) {
  return (
    workspaceId === HARPER_BILLING_PREVIEW_WORKSPACE_ID &&
    canUseOrgDevControls(email)
  );
}

export function previewBillingSummary(
  summary: BillingSummary,
  preview: OrgBillingPreview
): BillingSummary {
  const free = preview.slotCount === 0 || preview.subscription === "ended";
  const startedAt = new Date(preview.startedAt);
  const creditEnd = new Date(startedAt);
  creditEnd.setUTCMonth(creditEnd.getUTCMonth() + 1);
  const periodEnd = new Date(startedAt);
  periodEnd.setUTCMonth(
    periodEnd.getUTCMonth() + (preview.interval === "year" ? 12 : 1)
  );
  const assigned = summary.creditSlots.filter((slot) => slot.roleId);
  const assignment = (id: string, index: number) =>
    preview.slotAssignments ? preview.slotAssignments[id] : assigned[index];
  const shared: BillingCreditSlot = {
    id: "free",
    slotId: null,
    label: "Shared credits",
    roleId: null,
    roleName: null,
    remaining:
      preview.credits === "empty"
        ? 0
        : preview.credits === "low"
          ? 3
          : FREE_MONTHLY_CREDITS,
    allowance: FREE_MONTHLY_CREDITS,
    renewsAt: creditEnd.toISOString(),
    cancelAt: null,
  };
  const slots = Array.from({ length: preview.slotCount }, (_, index) => {
    const id = `billing-preview-${index + 1}`;
    const state =
      preview.slotRenewals?.[id] ??
      (preview.subscription === "mixed"
        ? (["active", "ending", "past_due", "grant", "ended"] as const)[
            index % 5
          ]
        : (preview.subscription ?? "active"));
    const ended = state === "ended";
    const ending = state === "ending" || state === "grant";
    const end = ended
      ? new Date(startedAt.getTime() - 86400000).toISOString()
      : periodEnd.toISOString();
    return {
      id,
      source: state === "grant" ? ("grant" as const) : ("stripe" as const),
      label: `Slot ${index + 1}`,
      roleId: ended ? null : (assignment(id, index)?.roleId ?? null),
      roleName: ended ? null : (assignment(id, index)?.roleName ?? null),
      status: ended ? "canceled" : state === "past_due" ? "past_due" : "active",
      startedAt: preview.startedAt,
      periodEnd: end,
      billingInterval: preview.interval,
      creditsRenewAt: ended ? null : creditEnd.toISOString(),
      cancelAt: ending || ended ? end : null,
      endedAt: ended ? end : null,
      remaining: ended
        ? 0
        : preview.credits === "empty"
          ? 0
          : preview.credits === "low"
            ? 3
            : SLOT_MONTHLY_CREDITS,
      active: !ended,
      revision: 0,
    };
  });
  const activeSlots = slots.filter((slot) => slot.active);
  const activeCredits = activeSlots.map((slot) => ({
    id: slot.id,
    slotId: slot.id,
    label: slot.label,
    roleId: slot.roleId,
    roleName: slot.roleName,
    allowance: SLOT_MONTHLY_CREDITS,
    remaining: slot.remaining,
    renewsAt: slot.creditsRenewAt,
    cancelAt: slot.cancelAt,
  }));
  return {
    ...summary,
    model: free ? "free" : "slot",
    capacity: null,
    freeRenewsAt: creditEnd.toISOString(),
    creditSlots: [shared, ...activeCredits],
    hasCustomer:
      previewCard(preview) !== "none" || !free || preview.history === "sample",
    slots,
  };
}

export function previewAssignRole(
  preview: OrgBillingPreview,
  summary: BillingSummary,
  slotId: string,
  role: BillingAssignmentRole
): OrgBillingPreview {
  const slots = billingAssignmentSlots(summary);
  const target = slots.find((slot) => slot.id === slotId);
  if (!target || !isBillingRoleVisible(role)) {
    throw new Error("Invalid preview assignment");
  }
  const other = slots.find((slot) => slot.roleId === role.roleId);
  const slotAssignments = Object.fromEntries(
    slots.map((slot) => [
      slot.id,
      slot.roleId
        ? { roleId: slot.roleId, roleName: slot.roleName ?? "Role" }
        : null,
    ])
  );
  slotAssignments[target.id] = { roleId: role.roleId, roleName: role.name };
  if (other && other.id !== target.id) {
    slotAssignments[other.id] = target.roleId
      ? { roleId: target.roleId, roleName: target.roleName ?? "Role" }
      : null;
  }
  return { ...preview, slotAssignments };
}

export function previewInvoices(preview: OrgBillingPreview): BillingInvoice[] {
  if (preview.history !== "sample") return [];
  return Array.from({ length: 24 }, (_, index) => {
    const status = (["paid", "open", "uncollectible", "void"] as const)[
      index % 4
    ];
    const amount =
      (preview.interval === "year" ? 238800 : 24900) *
      Math.max(1, preview.slotCount);
    return {
      id: `preview-invoice-${index}`,
      number: `DEMO-${String(24 - index).padStart(4, "0")}`,
      planName: `Harper Slot × ${Math.max(1, preview.slotCount)}`,
      date: new Date(
        Date.parse(preview.startedAt) - index * 86400000 * 30
      ).toISOString(),
      amountPaid: status === "paid" ? amount : 0,
      amountDue: amount,
      currency: "usd",
      status,
      hostedUrl: null,
      pdfUrl: null,
    };
  });
}

export function previewUsage(preview: OrgBillingPreview): BillingUsage[] {
  if (preview.history !== "sample") return [];
  return Array.from({ length: 45 }, (_, index) => ({
    id: `preview-usage-${index}`,
    action: index % 2 ? "connect" : "intro_request",
    createdAt: new Date(
      Date.parse(preview.startedAt) - index * 3600000 * 12
    ).toISOString(),
    roleName:
      index % 2 ? "Demo · Product Designer" : "Demo · Software Engineer",
    slotLabel: preview.slotCount
      ? `Slot ${(index % preview.slotCount) + 1}`
      : "Shared credits",
    delta: -1,
  }));
}
