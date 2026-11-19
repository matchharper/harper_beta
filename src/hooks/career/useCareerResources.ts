import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { queryKeys } from "@/lib/queryKeys";
import type { CareerOpportunity } from "@/lib/career/opportunities/store";
import type { CareerView } from "@/lib/career/resources/views";
import type { ResourceItem } from "@/lib/career/resources/types";
import type { ResultItem } from "@/lib/career/resources/sets";

export type ResourceResponse = {
  item?: CareerOpportunity | CareerView | ResourceItem;
  items?: Array<CareerOpportunity | CareerView>;
};
export type CollectionPage = {
  title: string;
  items: ResultItem[];
  manifest: Record<string, unknown>;
  total: number | null;
  nextCursor: string | null;
};
const endpoint = "/api/talent/career-resources";
export function careerResourceQueryOptions<T>(
  userId: string,
  query: Record<string, string>
) {
  return queryOptions({
    queryKey: queryKeys.careerResources.read(userId, query),
    enabled: Boolean(userId),
    queryFn: () =>
      fetchWithInternalAuth<T>(`${endpoint}?${new URLSearchParams(query)}`),
    staleTime: 30_000,
  });
}
export function careerCollectionQueryOptions(
  userId: string,
  query: Record<string, string>
) {
  return infiniteQueryOptions({
    queryKey: queryKeys.careerResources.read(userId, query),
    enabled: Boolean(userId),
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      fetchWithInternalAuth<CollectionPage>(
        `${endpoint}?${new URLSearchParams({ ...query, ...(pageParam ? { cursor: pageParam } : {}) })}`
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}
export function useCareerResourceMutation(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      fetchWithInternalAuth<{
        accepted?: boolean;
        conversationId?: string;
        item?: CareerOpportunity | CareerView;
      }>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: async (result) => {
      if (result.item) {
        const kind = "primary_ref" in result.item ? "opportunity" : "view";
        const queryKey = careerResourceQueryOptions<{ item: CareerOpportunity | CareerView }>(userId, {
          kind,
          id: result.item.id,
        }).queryKey;
        await client.cancelQueries({ queryKey, exact: true });
        client.setQueryData(queryKey, { item: result.item });
      }
      // The write/admission is durable. Revalidate lists and source details in
      // the background so unrelated reads don't delay the next user action.
      void client.invalidateQueries({
        queryKey: queryKeys.careerResources.all(userId),
      });
    },
  });
}
