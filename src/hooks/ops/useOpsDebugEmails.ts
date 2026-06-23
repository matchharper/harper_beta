import {
  type InfiniteData,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OpsDebugEmailDirection,
  OpsDebugEmailScope,
  OpsDebugEmailsResponse,
} from "@/lib/ops/debugEmailServer";

export type OpsDebugEmailFilters = {
  direction?: OpsDebugEmailDirection;
  mailType?: string;
  occurredFrom?: string;
  occurredTo?: string;
  query?: string;
  scope?: OpsDebugEmailScope;
  status?: string;
};

export type OpsDebugEmailsInfiniteData =
  InfiniteData<OpsDebugEmailsResponse>;

export const opsDebugEmailsKey = (
  limit: number,
  filters: OpsDebugEmailFilters
) =>
  [
    "ops-debug-emails",
    limit,
    filters.scope ?? "all",
    filters.occurredFrom ?? "",
    filters.occurredTo ?? "",
    filters.query ?? "",
    filters.direction ?? "all",
    filters.status ?? "",
    filters.mailType ?? "",
  ] as const;

export function useOpsDebugEmails(
  limit = 40,
  enabled = true,
  filters: OpsDebugEmailFilters = {}
) {
  const normalizedFilters = {
    direction: filters.direction ?? "all",
    mailType: filters.mailType?.trim() ?? "",
    occurredFrom: filters.occurredFrom?.trim() ?? "",
    occurredTo: filters.occurredTo?.trim() ?? "",
    query: filters.query?.trim() ?? "",
    scope: filters.scope ?? "all",
    status: filters.status?.trim() ?? "",
  };

  return useInfiniteQuery({
    queryKey: opsDebugEmailsKey(limit, normalizedFilters),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        direction: normalizedFilters.direction,
        limit: String(limit),
        offset: String(pageParam),
        scope: normalizedFilters.scope,
      });
      if (normalizedFilters.mailType) {
        params.set("mailType", normalizedFilters.mailType);
      }
      if (normalizedFilters.occurredFrom) {
        params.set("occurredFrom", normalizedFilters.occurredFrom);
      }
      if (normalizedFilters.occurredTo) {
        params.set("occurredTo", normalizedFilters.occurredTo);
      }
      if (normalizedFilters.query) {
        params.set("query", normalizedFilters.query);
      }
      if (normalizedFilters.status) {
        params.set("status", normalizedFilters.status);
      }

      return fetchWithInternalAuth<OpsDebugEmailsResponse>(
        `/api/internal/debug/emails?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    enabled,
    staleTime: 10_000,
  });
}
