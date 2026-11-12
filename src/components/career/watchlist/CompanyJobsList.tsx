import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const logCareerEvent = useCareerLogEvent();
  const { locale } = useMessages();
  const { user } = useCareerCompanyFollowContext();
  const { fetchWithAuth } = useCareerApi();
  const [searchInput, setSearchInput] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [titleQuery, setTitleQuery] = useState("");
  const searchLabel = t("career.history.search.button", "검색");
  const searchTerm = searchInput.trim();
  const [selected, setSelected] = useState<CareerHistoryOpportunity | null>(
    null
  );
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isComposing || searchTerm === titleQuery) return;
    const timer = window.setTimeout(() => setTitleQuery(searchTerm), 250);
    return () => window.clearTimeout(timer);
  }, [isComposing, searchTerm, titleQuery]);

  const query = useInfiniteQuery({
    queryKey: [
      "career-company-jobs",
      user?.id,
      companyDbId,
      roleId,
      locale,
      titleQuery,
    ],
    enabled: Boolean(user && (companyDbId || roleId)),
    placeholderData: keepPreviousData,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }): Promise<CareerCompanyJobsPage> => {
      const params = new URLSearchParams({ offset: String(pageParam), locale });
      if (companyDbId) params.set("companyDbId", String(companyDbId));
      else if (roleId) params.set("roleId", roleId);
      if (titleQuery) params.set("q", titleQuery);
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
    isFetching,
    isFetchingNextPage,
    isFetchNextPageError,
  } = query;
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasNextPage || isFetching || isFetchNextPageError)
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
      },
      { rootMargin: "240px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetching, isFetchNextPageError, titleQuery]);
  const items = Array.from(
    new Map(
      query.data?.pages
        .flatMap((page) => page.items)
        .map((item) => [item.opportunity.roleId, item]) ?? []
    ).values()
  );
  const totalCount = query.data?.pages[0]?.totalCount;
  const loading = query.isPending || query.isPlaceholderData;
  return (
    <section className="mt-8 border-t border-neutral-1000-a05 pt-6">
      <h2 className="mb-4 flex items-baseline justify-between gap-3 text-[16px] font-medium">
        {t("career.company.jobs.title", "이 회사의 모든 포지션")}
        {totalCount != null ? (
          <span className="shrink-0 tabular-nums">
            {totalCount.toLocaleString(locale)}
          </span>
        ) : null}
      </h2>
      <Input
        type="search"
        aria-label={searchLabel}
        placeholder={searchLabel}
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        className="mb-4 text-base sm:text-sm"
      />
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        {!loading &&
          items.map((item) => (
            <CareerOpportunityPreviewCard
              key={item.opportunity.roleId}
              item={item.opportunity}
              className="w-full"
              isRecommended={item.isRecommended}
              isFit={
                item.fitScore !== null && item.fitScore >= EXTERNAL_JOB_FIT_SCORE
              }
              onActivate={() => {
                logCareerEvent("click_company_job_open_detail", {
                  roleId: item.opportunity.roleId,
                });
                setSelected(item.opportunity);
              }}
            />
          ))}
      </div>
      {loading && (
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
      {!loading && !query.isError && items.length === 0 && (
        <p role="status" className="py-6 text-sm text-neutral-muted">
          {titleQuery
            ? t("career.history.search.empty", "일치하는 기회가 없어요.")
            : t("career.company.jobs.empty", "등록된 포지션이 없어요.")}
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
