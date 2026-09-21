import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerCompanyFollowContext } from "@/components/career/CareerSidebarContext";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import {
  EXTERNAL_JOB_FIT_SCORE,
  type CareerCompanyJobsPage,
} from "@/lib/career/companyJobs";
import CareerOpportunityPreviewCard from "../history/CareerOpportunityPreviewCard";
import CareerOpportunityPreviewModal from "../history/CareerOpportunityPreviewModal";
import type { CareerHistoryOpportunity } from "../types";

export default function CompanyJobsList({
  companyDbId,
  roleId,
}: {
  companyDbId?: number | null;
  roleId?: string | null;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const { user } = useCareerCompanyFollowContext();
  const { fetchWithAuth } = useCareerApi();
  const [selected, setSelected] = useState<CareerHistoryOpportunity | null>(
    null
  );
  const sentinel = useRef<HTMLDivElement>(null);
  const query = useInfiniteQuery({
    queryKey: ["career-company-jobs", user?.id, companyDbId, roleId, locale],
    enabled: Boolean(user && (companyDbId || roleId)),
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }): Promise<CareerCompanyJobsPage> => {
      const params = new URLSearchParams({ offset: String(pageParam), locale });
      if (companyDbId) params.set("companyDbId", String(companyDbId));
      else if (roleId) params.set("roleId", roleId);
      const response = await fetchWithAuth(
        `/api/talent/opportunities/same-company?${params}`,
        { signal }
      );
      if (!response.ok) throw new Error("Failed to load jobs");
      return response.json();
    },
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    staleTime: 30_000,
  });
  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = query;
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasNextPage || isFetchingNextPage || isFetchNextPageError)
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
      },
      { rootMargin: "240px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError]);
  const items = Array.from(
    new Map(
      query.data?.pages
        .flatMap((page) => page.items)
        .map((item) => [item.opportunity.roleId, item]) ?? []
    ).values()
  );
  return (
    <section className="mt-8 border-t border-neutral-1000-a05 pt-6">
      <h2 className="mb-4 text-[16px] font-medium">
        {t("career.company.jobs.title", "이 회사의 모든 포지션")}
      </h2>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <CareerOpportunityPreviewCard
            key={item.opportunity.roleId}
            item={item.opportunity}
            className="w-full"
            isRecommended={item.isRecommended}
            isFit={
              item.fitScore !== null && item.fitScore >= EXTERNAL_JOB_FIT_SCORE
            }
            onActivate={() => setSelected(item.opportunity)}
          />
        ))}
      </div>
      {query.isPending && (
        <div
          className="flex justify-center py-6"
          role="status"
          aria-label={t("career.company.jobs.loading", "포지션 불러오는 중")}
        >
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      {query.isError && (
        <div role="alert" className="mt-4 text-sm text-critical">
          <p>
            {t(
              "career.company.jobs.load_failed",
              "포지션을 불러오지 못했어요."
            )}
          </p>
          <MuteButton
            className="mt-2"
            onClick={() =>
              void (isFetchNextPageError ? fetchNextPage() : query.refetch())
            }
          >
            {t("career.company.jobs.retry", "다시 시도")}
          </MuteButton>
        </div>
      )}
      {!query.isPending && !query.isError && items.length === 0 && (
        <p className="py-6 text-sm text-neutral-muted">
          {t("career.company.jobs.empty", "등록된 포지션이 없어요.")}
        </p>
      )}
      <div ref={sentinel} className="h-1" />
      {isFetchingNextPage && (
        <div
          role="status"
          className="flex justify-center py-4"
          aria-label={t("career.company.jobs.loading", "포지션 불러오는 중")}
        >
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      <CareerOpportunityPreviewModal
        item={selected}
        onClose={() => setSelected(null)}
        onSaved={setSelected}
      />
    </section>
  );
}
