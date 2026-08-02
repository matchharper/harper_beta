import { Loader2 } from "lucide-react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { getErrorMessage } from "@/hooks/career/careerHelpers";
import { useCareerCompanyFollowContext } from "@/components/career/CareerSidebarContext";
import { useMessages } from "@/i18n/useMessage";
import CareerInPageTabs from "@/components/career/CareerInPageTabs";
import { CompanyCard } from "./CompanyCard";
import { CompanyDetailView } from "./CompanyDetailView";
import { CompanyEmptyState } from "./CompanyEmptyState";
import {
  WATCHLIST_COMPANY_QUERY_KEY,
  WATCHLIST_PAGE_SIZE,
  WATCHLIST_TAB_QUERY_KEY,
  getWatchlistTabs,
  type CompanyDetailPayload,
  type CompanyWatchlistItem,
  type CompanyWatchlistPage,
  type CompanyWatchlistTab,
} from "./watchlistTypes";
import {
  getBaseCareerQuery,
  parseCompanyDbId,
  parseWatchlistTab,
} from "./watchlistFormatters";
import { useCareerT } from "@/i18n/useCareerT";

const CareerCompanyWatchlistPanel = () => {
  const t = useCareerT();

  const router = useRouter();
  const queryClient = useQueryClient();
  const { fetchWithAuth } = useCareerApi();
  const { locale } = useMessages();
  const { onUpdateCompanyFollow, user } = useCareerCompanyFollowContext();
  const userId = user?.id ?? null;
  const activeTab = parseWatchlistTab(router.query[WATCHLIST_TAB_QUERY_KEY]);
  const detailCompanyDbId = parseCompanyDbId(
    router.query[WATCHLIST_COMPANY_QUERY_KEY]
  );
  const [updatingCompanyIds, setUpdatingCompanyIds] = useState<number[]>([]);
  const [actionError, setActionError] = useState("");
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const buildWatchlistLocation = useCallback(
    (args: { companyDbId?: number | null; tab?: CompanyWatchlistTab }) => {
      const tab = args.tab ?? activeTab;
      const query: Record<string, string> = {
        ...getBaseCareerQuery(router.query),
        [WATCHLIST_TAB_QUERY_KEY]: tab,
      };

      if (args.companyDbId) {
        query[WATCHLIST_COMPANY_QUERY_KEY] = String(args.companyDbId);
      }

      return {
        pathname: "/career/watchlist",
        query,
      };
    },
    [activeTab, router.query]
  );

  const handleChangeTab = useCallback(
    (tab: CompanyWatchlistTab) => {
      void router.push(buildWatchlistLocation({ tab }), undefined, {
        shallow: true,
        scroll: false,
      });
    },
    [buildWatchlistLocation, router]
  );

  const handleOpenCompany = useCallback(
    (item: CompanyWatchlistItem) => {
      void router.push(
        buildWatchlistLocation({
          companyDbId: item.companyDbId,
          tab: activeTab,
        }),
        undefined,
        { shallow: true, scroll: false }
      );
    },
    [activeTab, buildWatchlistLocation, router]
  );

  const handleBackToList = useCallback(() => {
    void router.push(buildWatchlistLocation({ tab: activeTab }), undefined, {
      shallow: true,
      scroll: false,
    });
  }, [activeTab, buildWatchlistLocation, router]);

  const fetchWatchlistPage = useCallback(
    async (offset: number): Promise<CompanyWatchlistPage> => {
      const params = new URLSearchParams({
        limit: String(WATCHLIST_PAGE_SIZE),
        locale,
        offset: String(Math.max(0, offset)),
        tab: activeTab,
      });
      const response = await fetchWithAuth(
        `/api/talent/company-watchlist?${params.toString()}`
      );
      const payload = (await response.json().catch(() => ({}))) as
        | CompanyWatchlistPage
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload,
            t(
              "career.common.career.047a363",
              "회사 워치리스트를 불러오지 못했습니다."
            )
          )
        );
      }

      return {
        count: typeof payload.count === "number" ? payload.count : 0,
        items: Array.isArray(payload.items)
          ? (payload.items as CompanyWatchlistItem[])
          : [],
        nextOffset:
          typeof payload.nextOffset === "number" ? payload.nextOffset : null,
      };
    },
    [activeTab, fetchWithAuth, locale, t]
  );

  const fetchWatchlistCount = useCallback(
    async (tab: CompanyWatchlistTab) => {
      const params = new URLSearchParams({
        limit: "1",
        offset: "0",
        tab,
      });
      const response = await fetchWithAuth(
        `/api/talent/company-watchlist?${params.toString()}`
      );
      const payload = (await response.json().catch(() => ({}))) as
        | { count?: unknown }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload,
            t(
              "career.common.career.0cp7wph",
              "회사 워치리스트 개수를 불러오지 못했습니다."
            )
          )
        );
      }

      return typeof payload.count === "number" ? payload.count : 0;
    },
    [fetchWithAuth, t]
  );

  const listQuery = useInfiniteQuery({
    queryKey: ["career-company-watchlist", userId, activeTab, locale],
    enabled: Boolean(user) && !detailCompanyDbId && activeTab !== "signals",
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchWatchlistPage(Number(pageParam) || 0),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    staleTime: 30_000,
  });

  const countsQuery = useQuery({
    queryKey: ["career-company-watchlist", "counts", userId],
    enabled: Boolean(user) && !detailCompanyDbId,
    queryFn: async () => {
      const following = await fetchWatchlistCount("following");
      return {
        following,
        signals: 0,
      } satisfies Partial<Record<CompanyWatchlistTab, number>>;
    },
    staleTime: 30_000,
  });

  const items = useMemo(() => {
    const seen = new Set<number>();
    const next: CompanyWatchlistItem[] = [];
    for (const page of listQuery.data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.companyDbId)) continue;
        seen.add(item.companyDbId);
        next.push(item);
      }
    }
    return next;
  }, [listQuery.data?.pages]);

  const currentCount = listQuery.data?.pages[0]?.count ?? items.length;
  const tabCounts = useMemo(
    () => ({
      ...(countsQuery.data ?? {}),
      [activeTab]: currentCount,
    }),
    [activeTab, countsQuery.data, currentCount]
  );
  const watchlistTabs = useMemo(() => getWatchlistTabs(t), [t]);
  const tabItems = useMemo(
    () =>
      watchlistTabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        count: tabCounts[tab.id],
      })),
    [tabCounts, watchlistTabs]
  );

  const detailQuery = useQuery({
    queryKey: [
      "career-company-watchlist-detail",
      userId,
      detailCompanyDbId,
      locale,
    ],
    enabled: Boolean(user && detailCompanyDbId),
    queryFn: async () => {
      const params = new URLSearchParams({
        companyDbId: String(detailCompanyDbId ?? ""),
        locale,
      });
      const response = await fetchWithAuth(
        `/api/talent/company-watchlist?${params.toString()}`
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as CompanyDetailPayload & Record<string, unknown>;
      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload,
            t(
              "career.company.career_company_detail_drawer.0amy3om",
              "회사 정보를 불러오지 못했습니다."
            )
          )
        );
      }
      return payload;
    },
    staleTime: 30_000,
  });

  const handleToggleFollow = useCallback(
    async (
      item: CompanyWatchlistItem,
      event: React.MouseEvent<HTMLButtonElement>
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setActionError("");
      setUpdatingCompanyIds((current) =>
        current.includes(item.companyDbId)
          ? current
          : [...current, item.companyDbId]
      );

      try {
        const result = await onUpdateCompanyFollow({
          action: item.following ? "unfollow" : "follow",
          companyDbId: item.companyDbId,
          companyWorkspaceId: item.companyWorkspaceId,
          source: detailCompanyDbId ? "watchlist_detail" : "watchlist_card",
        });

        if (result?.item) {
          queryClient.setQueryData(
            [
              "career-company-watchlist-detail",
              userId,
              item.companyDbId,
              locale,
            ],
            { item: result.item }
          );
        }
        await queryClient.invalidateQueries({
          queryKey: ["career-company-watchlist"],
        });
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : t(
                "career.common.career_flow_provider.19x0zaz",
                "회사 팔로우 상태를 변경하지 못했습니다."
              )
        );
      } finally {
        setUpdatingCompanyIds((current) =>
          current.filter((companyDbId) => companyDbId !== item.companyDbId)
        );
      }
    },
    [detailCompanyDbId, locale, onUpdateCompanyFollow, queryClient, t, userId]
  );

  const fetchNextWatchlistPage = listQuery.fetchNextPage;
  const hasNextWatchlistPage = listQuery.hasNextPage;
  const isFetchingNextWatchlistPage = listQuery.isFetchingNextPage;

  useEffect(() => {
    if (detailCompanyDbId) return;
    const target = sentinelRef.current;
    if (!target || !hasNextWatchlistPage || isFetchingNextWatchlistPage) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void fetchNextWatchlistPage();
        }
      },
      { rootMargin: "280px" }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [
    activeTab,
    detailCompanyDbId,
    fetchNextWatchlistPage,
    hasNextWatchlistPage,
    isFetchingNextWatchlistPage,
  ]);

  if (detailCompanyDbId) {
    const detailItem = detailQuery.data?.item ?? null;
    return (
      <div className="w-full py-4">
        <CompanyDetailView
          item={detailItem}
          loading={detailQuery.isLoading}
          onBack={handleBackToList}
          onToggleFollow={handleToggleFollow}
          updating={
            detailItem
              ? updatingCompanyIds.includes(detailItem.companyDbId)
              : false
          }
        />
        {actionError ? (
          <div className="mt-4 rounded-[8px] border border-critical/30 bg-critical-faded px-4 py-3 text-[13px] text-critical">
            {actionError}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <CareerInPageTabs
        items={tabItems}
        activeId={activeTab}
        onChange={handleChangeTab}
        mobileFloating
        className="md:my-4"
      />

      {activeTab === "following" && (
        <div className="mb-4 min-w-0 rounded-lg border border-positive/30 bg-bg-floating px-4 py-3 shadow-sm">
          <div className="text-[13px] font-medium leading-5 text-positive">
            {t("career.common.career.0h5494n", "추적중이에요")}
          </div>
          <p className="mt-1 line-clamp-3 text-neutral-primary text-sm">
            {t(
              "career.common.career.0kn6r0x",
              "펀딩, 채용, 팀 변화, 사업 성과 등 의미 있는 변화를 찾아서 알려드립니다."
            )}
          </p>
        </div>
      )}

      <div className="space-y-4 pb-6">
        {actionError ? (
          <div className="rounded-[8px] border border-critical/30 bg-critical-faded px-4 py-3 text-[13px] text-critical">
            {actionError}
          </div>
        ) : null}

        {activeTab === "signals" ? (
          <div className="min-h-[280px]" aria-hidden="true" />
        ) : listQuery.isLoading ? (
          <div className="flex min-h-[280px] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-soft" />
          </div>
        ) : items.length === 0 ? (
          <CompanyEmptyState activeTab={activeTab} />
        ) : (
          <>
            <div className="grid gap-3">
              {items.map((item) => (
                <CompanyCard
                  key={`${activeTab}-${item.companyDbId}`}
                  activeTab={activeTab}
                  item={item}
                  onOpen={handleOpenCompany}
                  onToggleFollow={handleToggleFollow}
                  updating={updatingCompanyIds.includes(item.companyDbId)}
                />
              ))}
            </div>
            <div ref={sentinelRef} className="h-8" />
            {listQuery.isFetchingNextPage ? (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-neutral-disabled" />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default React.memo(CareerCompanyWatchlistPanel);
