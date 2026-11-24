import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { BareButton, MuteButton } from "@/components/ui/button";
import { formatCareerLocation } from "@/lib/career/locationDisplay";
import { getMetaItems } from "../CareerHistoryPanel";
import { formatOpportunityPostingDate } from "../history/opportunityPostingStatus";
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
  bare = false,
  companyDbId,
  excludeRoleId,
  previewLimit,
  roleId,
}: {
  /** Without the section's own divider and heading, inside a page that titles it. */
  bare?: boolean;
  companyDbId?: number | null;
  excludeRoleId?: string | null;
  /** Shows only the jobs closest to this person first; the rest open with 전체 보기. */
  previewLimit?: number;
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
  const [expanded, setExpanded] = useState(!previewLimit);
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
    if (
      !expanded ||
      !element ||
      !hasNextPage ||
      isFetching ||
      isFetchNextPageError
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
      },
      { rootMargin: "240px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [
    expanded,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchNextPageError,
    titleQuery,
  ]);
  const items = Array.from(
    new Map(
      query.data?.pages
        .flatMap((page) => page.items)
        .map((item) => [item.opportunity.roleId, item]) ?? []
    ).values()
  );
  const totalCount = query.data?.pages[0]?.totalCount;
  const loading = query.isPending || query.isPlaceholderData;
  // Ranked by an earlier fit score, then by title closeness to what Harper
  // already recommended; a job with neither signal waits for 전체 보기.
  const visibleItems = expanded
    ? items
    : items
        .filter(
          (item) =>
            item.opportunity.roleId !== excludeRoleId &&
            (item.isRecommended ||
              item.fitScore !== null ||
              item.titleSimilarity !== null)
        )
        .slice(0, previewLimit);
  return (
    <section
      className={
        bare ? undefined : "mt-8 border-t border-neutral-1000-a05 pt-6"
      }
    >
      {bare ? null : (
        <h2 className="mb-4 flex items-baseline justify-between gap-3 text-[16px] font-medium">
          {t("career.company.jobs.title", "이 회사의 모든 포지션")}
          {totalCount != null ? (
            <span className="shrink-0 tabular-nums">
              {totalCount.toLocaleString(locale)}
            </span>
          ) : null}
        </h2>
      )}
      {expanded ? (
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
      ) : null}
      {bare ? (
        !loading && visibleItems.length > 0 ? (
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="text-left text-[12px] text-neutral-soft">
                  <th className="py-2 pr-3 font-normal">
                    {t("career.company.jobs.column_role", "직무")}
                  </th>
                  <th className="hidden py-2 pr-3 font-normal sm:table-cell">
                    {t("career.company.jobs.column_location", "위치")}
                  </th>
                  <th className="hidden py-2 pr-3 font-normal md:table-cell">
                    {t("career.company.jobs.column_type", "근무 형태")}
                  </th>
                  <th className="py-2 text-right font-normal">
                    {t("career.company.jobs.column_posted", "올라온 날")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => {
                  const opportunity = item.opportunity;
                  const open = () => {
                    logCareerEvent("click_company_job_open_detail", {
                      roleId: opportunity.roleId,
                    });
                    setSelected(opportunity);
                  };
                  const fit =
                    item.fitScore !== null &&
                    item.fitScore >= EXTERNAL_JOB_FIT_SCORE;
                  return (
                    <tr
                      key={opportunity.roleId}
                      className="cursor-pointer align-top transition-colors hover:bg-neutral-1000-a05"
                      onClick={open}
                    >
                      <td className="py-2.5 pr-3">
                        <BareButton
                          type="button"
                          className="text-left font-medium text-neutral-primary"
                          onClick={(event) => {
                            event.stopPropagation();
                            open();
                          }}
                        >
                          {opportunity.title}
                        </BareButton>
                        {item.isRecommended || fit ? (
                          <span className="ml-1.5 whitespace-nowrap text-[11.5px] text-action-strong">
                            {item.isRecommended
                              ? t("career.company.jobs.recommended", "추천됨")
                              : t("career.company.jobs.fit", "적합")}
                          </span>
                        ) : null}
                      </td>
                      <td className="hidden whitespace-nowrap py-2.5 pr-3 text-neutral-muted sm:table-cell">
                        {formatCareerLocation(opportunity.location, locale)}
                      </td>
                      <td className="hidden whitespace-nowrap py-2.5 pr-3 text-neutral-muted md:table-cell">
                        {getMetaItems(opportunity, t).join(" · ")}
                      </td>
                      <td className="whitespace-nowrap py-2.5 text-right tabular-nums text-neutral-muted">
                        {formatOpportunityPostingDate(
                          opportunity.postedAt,
                          locale
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {!loading &&
            visibleItems.map((item) => (
              <CareerOpportunityPreviewCard
                key={item.opportunity.roleId}
                item={item.opportunity}
                className="w-full"
                isRecommended={item.isRecommended}
                isFit={
                  item.fitScore !== null &&
                  item.fitScore >= EXTERNAL_JOB_FIT_SCORE
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
      )}
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
      {!expanded && !loading && totalCount ? (
        <MuteButton
          className="mt-3"
          variant="default"
          onClick={() => {
            logCareerEvent("click_company_jobs_show_all", {
              companyId: companyDbId ?? null,
            });
            setExpanded(true);
          }}
        >
          {t("career.company.jobs.show_all", "전체 {count}개 보기", {
            values: { count: totalCount.toLocaleString(locale) },
          })}
        </MuteButton>
      ) : null}
      {expanded && !loading && !query.isError && items.length === 0 && (
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
