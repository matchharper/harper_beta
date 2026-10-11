import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import {
  previewBillingSummary,
  previewCatalog,
  previewInvoices,
  previewUsage,
  type OrgBillingPreview,
} from "@/lib/org/billing/preview";
import {
  getOrgBillingPreview,
  useOrgBillingPreview,
} from "@/store/useOrgBillingPreviewStore";
import type {
  BillingCatalog,
  BillingSummary,
  BillingEntitlements,
  BillingInvoice,
  BillingUsage,
} from "@/lib/org/billing/types";
export const orgBillingKey = (id: string) => ["org", "billing", "summary", id];
export const orgEntitlementsKey = (id: string) => [
  "org",
  "billing",
  "entitlements",
  id,
];
export async function billingRequest<T>(
  workspaceId: string,
  action: string,
  values: Record<string, unknown> = {}
) {
  if (getOrgBillingPreview(workspaceId)) {
    throw new Error(
      "Billing preview is active. Return to the actual plan to make changes."
    );
  }
  return fetchWithInternalAuth<T>("/api/org/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...values, workspaceId, action }),
  });
}
export function billingRead<T>(
  workspaceId: string,
  view: string,
  cursor?: string,
  page?: number
) {
  const query = new URLSearchParams({ workspaceId, view });
  if (cursor) query.set(view === "invoices" ? "after" : "before", cursor);
  if (page !== undefined) query.set("page", String(page));
  return fetchWithInternalAuth<T>(`/api/org/billing?${query}`);
}
export function orgBillingUsageOptions(
  workspaceId: string,
  page: number,
  preview: OrgBillingPreview | null = null
) {
  return queryOptions({
    queryKey: [
      "org",
      "billing",
      "usage",
      workspaceId,
      page,
      ...(preview ? ["preview", preview] : []),
    ],
    queryFn: async () => {
      if (preview) {
        const all = previewUsage(preview);
        return {
          usage: all.slice(page * 20, page * 20 + 20),
          total: all.length,
          page,
          hasMore: (page + 1) * 20 < all.length,
        };
      }
      return billingRead<{
        usage: BillingUsage[];
        total: number;
        page: number;
        hasMore: boolean;
      }>(workspaceId, "usage", undefined, page);
    },
    staleTime: 15_000,
  });
}
export function orgBillingInvoicesOptions(
  workspaceId: string,
  after = "",
  preview: OrgBillingPreview | null = null
) {
  return queryOptions({
    queryKey: [
      "org",
      "billing",
      "invoices",
      workspaceId,
      after,
      ...(preview ? ["preview", preview] : []),
    ],
    queryFn: async () => {
      if (preview) {
        const all = previewInvoices(preview);
        const start = after
          ? all.findIndex((invoice) => invoice.id === after) + 1
          : 0;
        const invoices = all.slice(start, start + 20);
        return {
          invoices,
          hasMore: start + 20 < all.length,
          next: invoices.at(-1)?.id ?? null,
        };
      }
      return billingRead<{
        invoices: BillingInvoice[];
        hasMore: boolean;
        next?: string | null;
      }>(workspaceId, "invoices", after);
    },
    staleTime: 15_000,
  });
}
export function orgBillingOptions(workspaceId: string) {
  return queryOptions({
    queryKey: orgBillingKey(workspaceId),
    queryFn: () =>
      billingRead<{ summary: BillingSummary; catalog: BillingCatalog }>(
        workspaceId,
        "summary"
      ),
    staleTime: 15_000,
  });
}
export function useOrgBilling(workspaceId: string, enabled: boolean) {
  const client = useQueryClient();
  const { preview } = useOrgBillingPreview(workspaceId);
  const query = useQuery({
    ...orgBillingOptions(workspaceId),
    enabled,
    select: (data) =>
      preview
        ? {
            ...data,
            summary: previewBillingSummary(data.summary, preview),
            catalog: previewCatalog(data.catalog),
          }
        : data,
  });
  return {
    ...query,
    preview,
    invalidateDependents: () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: orgEntitlementsKey(workspaceId),
        }),
        client.invalidateQueries({ queryKey: ["org", "bootstrap"] }),
      ]),
    invalidate: () =>
      client.invalidateQueries({ queryKey: orgBillingKey(workspaceId) }),
  };
}

export function orgEntitlementsOptions(workspaceId: string) {
  return queryOptions({
    queryKey: orgEntitlementsKey(workspaceId),
    queryFn: () => billingRead<BillingEntitlements>(workspaceId, "capacity"),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}
export function useOrgEntitlements(workspaceId: string) {
  const { preview } = useOrgBillingPreview(workspaceId);
  return useQuery({
    ...orgEntitlementsOptions(workspaceId),
    enabled: Boolean(workspaceId),
    select: (data) => {
      if (!preview) return data;
      const summary = previewBillingSummary(
        {
          ...data,
          workspaceId,
          model: "free",
          freeRenewsAt: null,
          slots: [],
          hasCustomer: false,
          canManage: false,
        },
        preview
      );
      return {
        ...data,
        capacity: summary.capacity,
        creditSlots: summary.creditSlots,
        pendingConnections: summary.model !== "free",
      };
    },
  });
}
