import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import { normalizeHistoryOpportunities } from "@/hooks/career/careerSessionData";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { CHAT_COMPOSER_PICKER_PAGE_SIZE } from "@/lib/chat/composerPicker";

type CareerOpportunityMentionPage = {
  items: CareerHistoryOpportunity[];
  nextOffset: number | null;
};

const normalizeSearchText = (value: string | null | undefined) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase();

export function filterCareerOpportunityMentions(
  opportunities: CareerHistoryOpportunity[],
  query: string
) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return opportunities;

  return opportunities.filter((opportunity) =>
    [
      opportunity.companyName,
      opportunity.location,
      opportunity.sourceProvider,
      opportunity.title,
      opportunity.workMode,
    ].some((value) => normalizeSearchText(value).includes(normalizedQuery))
  );
}

export function useCareerOpportunityMentions(args: {
  enabled: boolean;
  userId?: string | null;
}) {
  const { fetchWithAuth } = useCareerApi();
  const userId = args.userId?.trim() ?? "";
  const query = useInfiniteQuery({
    queryKey: ["career-opportunity-mentions", userId],
    enabled: args.enabled && Boolean(userId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const searchParams = new URLSearchParams({
        limit: String(CHAT_COMPOSER_PICKER_PAGE_SIZE),
        offset: String(pageParam),
        sort: "recommended_at_desc",
      });
      const response = await fetchWithAuth(
        `/api/talent/opportunities?${searchParams.toString()}`
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        items?: unknown;
        nextOffset?: unknown;
      };

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "추천 기회를 불러오지 못했습니다."
        );
      }

      return {
        items: normalizeHistoryOpportunities(
          payload.items as Parameters<typeof normalizeHistoryOpportunities>[0]
        ),
        nextOffset:
          typeof payload.nextOffset === "number" ? payload.nextOffset : null,
      } satisfies CareerOpportunityMentionPage;
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const opportunities = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? [])
      .flatMap((page) => page.items)
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .sort(
        (left, right) =>
          Date.parse(right.recommendedAt) - Date.parse(left.recommendedAt)
      );
  }, [query.data?.pages]);

  return {
    ...query,
    opportunities,
  };
}
