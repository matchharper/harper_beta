import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OpsCompaniesPageResponse } from "@/lib/ops/companies";

const OPS_COMPANIES_PAGE_SIZE = 100;

type UpdateCompanyTestScoreInput = {
  testScore: number;
  workspaceId: string;
};

const opsCompaniesQueryKey = {
  all: ["opsCompanies"] as const,
  lists: () => [...opsCompaniesQueryKey.all, "list"] as const,
  list: (filters: { limit: number; query: string }) =>
    [...opsCompaniesQueryKey.lists(), filters.query, filters.limit] as const,
};

export function useOpsCompanies(
  args: {
    enabled?: boolean;
    limit?: number;
    query?: string | null;
  } = {}
) {
  const limit = Math.max(
    1,
    Math.min(
      Number(args.limit ?? OPS_COMPANIES_PAGE_SIZE) || OPS_COMPANIES_PAGE_SIZE,
      250
    )
  );
  const query = String(args.query ?? "").trim();

  return useInfiniteQuery({
    queryKey: opsCompaniesQueryKey.list({ limit, query }),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(pageParam));
      if (query) {
        params.set("query", query);
      }

      return fetchWithInternalAuth<OpsCompaniesPageResponse>(
        `/api/internal/companies?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: args.enabled ?? true,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateOpsCompanyTestScore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateCompanyTestScoreInput) =>
      fetchWithInternalAuth<{
        testScore: number;
        updatedAt: string;
        workspaceId: string;
      }>("/api/internal/companies", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: opsCompaniesQueryKey.all,
      });

      queryClient.setQueriesData<InfiniteData<OpsCompaniesPageResponse>>(
        {
          queryKey: opsCompaniesQueryKey.lists(),
        },
        (current) => {
          if (!current) return current;

          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.companyWorkspaceId === input.workspaceId
                  ? {
                      ...item,
                      testScore: input.testScore,
                    }
                  : item
              ),
            })),
          };
        }
      );
    },
    onError: async () => {
      await queryClient.invalidateQueries({
        queryKey: opsCompaniesQueryKey.all,
      });
    },
    onSuccess: (data) => {
      queryClient.setQueriesData<InfiniteData<OpsCompaniesPageResponse>>(
        {
          queryKey: opsCompaniesQueryKey.lists(),
        },
        (current) => {
          if (!current) return current;

          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.companyWorkspaceId === data.workspaceId
                  ? {
                      ...item,
                      testScore: data.testScore,
                      updatedAt: data.updatedAt,
                    }
                  : item
              ),
            })),
          };
        }
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: opsCompaniesQueryKey.all,
      });
    },
  });
}
