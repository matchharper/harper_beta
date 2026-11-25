import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useCareerCompanyFollowContext } from "@/components/career/CareerSidebarContext";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import type { SimilarOpportunity } from "@/lib/career/similarOpportunities.server";
import type { CareerHistoryOpportunity } from "../types";
import CareerOpportunityPreviewCard from "./CareerOpportunityPreviewCard";
import { postingDetailQueryKey } from "./postingDetail";

/** Starts loading as soon as a detail opens, so the list is ready by the time the person reaches it. */
export function useSimilarOpportunities(
  item: CareerHistoryOpportunity,
  enabled = true
) {
  const { locale } = useMessages();
  const { user } = useCareerCompanyFollowContext();
  const { fetchWithAuth } = useCareerApi();
  const kind = item.targetKind === "company" ? "company" : "role";
  return useQuery({
    queryKey: ["career-similar-opportunities", user?.id, item.roleId, kind, locale],
    enabled: enabled && Boolean(user && item.roleId),
    // The scored options behind this list change only when Harper searches again.
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }): Promise<SimilarOpportunity[]> => {
      const params = new URLSearchParams({ id: item.roleId, kind, locale });
      const response = await fetchWithAuth(
        `/api/talent/opportunities/similar?${params}`,
        { signal }
      );
      if (!response.ok) throw new Error("Failed to load similar opportunities");
      return (await response.json()).items ?? [];
    },
  });
}

/** Postings already scored for this person in the same search, closest company first. */
export default function SimilarOpportunities({
  item,
  onOpen,
}: {
  item: CareerHistoryOpportunity;
  onOpen: (item: CareerHistoryOpportunity) => void;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const { user } = useCareerCompanyFollowContext();
  const logCareerEvent = useCareerLogEvent();
  const queryClient = useQueryClient();
  const query = useSimilarOpportunities(item);
  const items = query.data ?? [];
  if (!query.isPending && !query.isError && items.length === 0) return null;
  const isDevelopment = process.env.NODE_ENV === "development";

  return (
    <section className="mt-10 border-t border-neutral-1000-a05 pt-6">
      <h2 className="mb-4 text-[16px] font-medium">
        {t("career.history.similar.title", "비슷한 기회")}
      </h2>
      {query.isPending ? (
        <div
          className="flex justify-center py-6"
          role="status"
          aria-label={t("career.company.jobs.loading", "포지션 불러오는 중")}
        >
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-critical">
          {t("career.company.jobs.load_failed", "포지션을 불러오지 못했어요.")}
        </p>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((similar) => (
            <div key={similar.opportunity.roleId} className="min-w-0">
              <CareerOpportunityPreviewCard
                item={similar.opportunity}
                className="w-full"
                onActivate={() => {
                  logCareerEvent("click_similar_opportunity_open_detail", {
                    roleId: similar.opportunity.roleId,
                    fromRoleId: item.roleId,
                  });
                  // The page opens with what this card already holds.
                  queryClient.setQueryData(
                    postingDetailQueryKey(user?.id, similar.opportunity.roleId, locale),
                    similar.opportunity
                  );
                  onOpen(similar.opportunity);
                }}
              />
              {isDevelopment ? (
                <p className="mt-1 px-1 text-[11.5px] tabular-nums text-neutral-soft">
                  score {similar.fitScore} · company{" "}
                  {similar.companySimilarity?.toFixed(2) ?? "–"}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
