import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useIsMutating } from "@tanstack/react-query";
import {
  ArrowDownWideNarrow,
  LayoutPanelLeft,
  LayoutGrid,
  List,
  LoaderCircle,
  StickyNote,
} from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import { ORG_STAGE_DESCRIPTIONS } from "@/lib/org/pipelineStage";
import { useOrgJobsBoard, useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import { isOrgQueryBlockingError } from "@/lib/org/queryError";
import {
  compareOrgCandidates,
  type OrgCandidateSort,
} from "@/lib/org/candidateBoardSort";
import { TalentDetailSimpleView } from "./TalentDetailSimpleView";
import { OrgSearchHistory } from "./OrgSearchHistory";
import { OrgRoleTalentBoard } from "./OrgRoleTalentBoard";
import { OrgInboxListTable } from "./OrgInboxListTable";
import { OrgErrorState } from "./workspace/OrgErrorState";
import { ReviewEmptyState } from "./OrgHomeInbox";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgDeferredActionStore } from "@/store/useOrgDeferredActionStore";
import { OrgCandidateSelectionBar } from "./OrgCandidateSelectionBar";
import {
  OrgCriteriaReviewPanel,
  useOrgCriteriaReviewCounts,
} from "./OrgCriteriaRecheck";

const NO_SELECTION: ReadonlySet<string> = new Set();

export function OrgRoleInbox() {
  const router = useRouter();
  const { c, locale } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const { board, boardQuery, inboxQuery } = useOrgJobsBoard();
  const {
    activeRole,
    detailRecommendationId,
    detailTalentId,
    selectTalent,
    workspaceId,
  } = useOrgJobsNavigation();
  const { permissions } = useOrgWorkspace();
  const deferredStages = useOrgDeferredActionStore(
    (state) => state.deferredStages
  );
  const listScrollTop = useRef(0);
  const scrollRef = useRef<HTMLElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadingNextReview = useRef(false);
  const reviewScopeRef = useRef<string | null>(null);
  const mutationCount = useIsMutating({
    predicate: (mutation) => {
      const input = mutation.state.variables as
        | { workspaceId?: string; talentId?: string; introCandidateId?: string }
        | undefined;
      return (
        input?.workspaceId === workspaceId &&
        Boolean(input.talentId || input.introCandidateId)
      );
    },
  });
  const savedReview = router.query.review === "saved";
  const stage =
    router.query.inboxStage === "company_intro" ||
    router.query.inboxStage === "pending_connection"
      ? router.query.inboxStage
      : "pending_connection";
  // Grid is the default; the card view opens one candidate at a time and the
  // board lets the team place cards anywhere.
  const view =
    router.query.inboxView === "list"
      ? "list"
      : router.query.inboxView === "card"
        ? "card"
        : router.query.inboxView === "board"
          ? "board"
          : "grid";
  const card = view === "card";
  const sort: OrgCandidateSort =
    router.query.sort === "recommended" ? "recommended" : "latest";
  const sortLabel =
    sort === "recommended"
      ? c("추천순", "Recommended")
      : c("최신순", "Newest first");
  const stageCounts = useMemo(() => {
    const serverCounts = inboxQuery?.data?.pages[0]?.counts;
    if (serverCounts) {
      // Leave out candidates whose decision is waiting to run.
      const counts = { ...serverCounts };
      for (const item of board?.items ?? []) {
        if (
          !item.savedAt &&
          deferredStages.has(item.recommendationId) &&
          (item.stage === "pending_connection" ||
            item.stage === "company_intro")
        ) {
          counts[item.stage] = Math.max(0, counts[item.stage] - 1);
        }
      }
      return counts;
    }
    const counts = { pending_connection: 0, company_intro: 0 };
    for (const item of board?.items ?? []) {
      if (
        !item.savedAt &&
        !deferredStages.has(item.recommendationId) &&
        (item.stage === "pending_connection" || item.stage === "company_intro")
      ) {
        counts[item.stage] += 1;
      }
    }
    return counts;
  }, [board?.items, deferredStages, inboxQuery?.data]);
  // The server counts every saved candidate; the loaded page only has the
  // tab being viewed, so counting it showed 0 until 저장함 was opened.
  const savedCount = useMemo(() => {
    const serverSaved = inboxQuery?.data?.pages[0]?.counts?.saved;
    const deferredSaved = (board?.items ?? []).filter(
      (item) => item.savedAt && deferredStages.has(item.recommendationId)
    ).length;
    if (typeof serverSaved === "number") {
      return Math.max(0, serverSaved - deferredSaved);
    }
    return (board?.items ?? []).filter(
      (item) => item.savedAt && !deferredStages.has(item.recommendationId)
    ).length;
  }, [board?.items, deferredStages, inboxQuery?.data]);
  const items = useMemo(
    () =>
      (board?.items ?? [])
        .filter(
          (item) =>
            !deferredStages.has(item.recommendationId) &&
            (savedReview
              ? Boolean(item.savedAt)
              : !item.savedAt && item.stage === stage)
        )
        .sort((a, b) => compareOrgCandidates(a, b, sort)),
    [board?.items, deferredStages, stage, sort, savedReview]
  );
  // Selection belongs to one role, tab and view; switching any of them starts
  // from an empty selection.
  const selectionScope = `${activeRole?.roleId ?? ""}:${stage}:${view}:${savedReview}`;
  const [selection, setSelection] = useState(() => ({
    ids: new Set<string>(),
    scope: selectionScope,
  }));
  const selectedIds =
    selection.scope === selectionScope ? selection.ids : NO_SELECTION;
  const setSelectedIds = (ids: Set<string>) =>
    setSelection({ ids, scope: selectionScope });
  const selectedCount = items.filter((item) =>
    selectedIds.has(item.recommendationId)
  ).length;
  const toggleSelected = (item: { recommendationId: string }, on: boolean) => {
    const next = new Set(selectedIds);
    if (on) next.add(item.recommendationId);
    else next.delete(item.recommendationId);
    setSelectedIds(next);
  };
  const reviewCounts = useOrgCriteriaReviewCounts(
    (board?.items ?? []).filter(
      (item) => !deferredStages.has(item.recommendationId)
    ),
    activeRole?.roleId
  );
  const reviewBadge = (count: number) =>
    count > 0 ? (
      <span
        aria-label={c("다시 볼 후보 {p0}명", "{p0} to review", { p0: count })}
        className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-medium leading-none text-white tabular-nums"
      >
        {count}
      </span>
    ) : null;
  const change = (patch: Record<string, string>, preserveSelection = false) => {
    if (patch.inboxStage || patch.sort) listScrollTop.current = 0;
    const query = { ...router.query, ...patch };
    if (!preserveSelection)
      for (const key of [
        "talentId",
        "recommendationId",
        "detailRoleId",
        "detailWorkspaceId",
      ])
        delete query[key];
    // Saved stays open across sort and view changes; another tab leaves it.
    if (patch.inboxStage) delete query.review;
    void router.push({ pathname: router.pathname, query }, undefined, {
      shallow: true,
      scroll: false,
    });
  };
  useEffect(() => {
    if (
      card &&
      // Resolve the Role's default inbox before selecting its first candidate.
      !(detailTalentId && !detailRecommendationId) &&
      !savedReview &&
      !mutationCount &&
      boardQuery.data &&
      !isOrgQueryBlockingError(boardQuery.error, boardQuery.data) &&
      items.length &&
      !detailRecommendationId
    ) {
      const item = items[0];
      void router.replace(
        {
          pathname: router.pathname,
          query: {
            ...router.query,
            talentId: item.talentId,
            recommendationId: item.recommendationId,
            detailRoleId: item.roleId,
          },
        },
        undefined,
        { shallow: true, scroll: false }
      );
    }
  });
  const reviewing = card || Boolean(detailTalentId);
  const hasNextPage = inboxQuery?.hasNextPage ?? false;
  const fetching = inboxQuery?.isFetching ?? false;
  const pageError = inboxQuery?.isError ?? false;
  const fetchNextPage = inboxQuery?.fetchNextPage;
  const selectedIndex = items.findIndex(item => item.recommendationId === detailRecommendationId);
  const reviewScope = JSON.stringify([workspaceId, activeRole?.roleId, stage, sort, savedReview, detailRecommendationId]);
  useLayoutEffect(() => {
    reviewScopeRef.current = reviewScope;
    return () => { reviewScopeRef.current = null; };
  }, [reviewScope]);
  const loadNextReviewPage = async () => {
    if (!fetchNextPage || loadingNextReview.current) return;
    loadingNextReview.current = true;
    const previousIds = new Set(items.map(item => item.recommendationId));
    try {
      // A decision can already be refreshing the current pages. Let that finish
      // before requesting another page so offsets aren't read across the write.
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await fetchNextPage({ cancelRefetch: false });
        if (result.isError || reviewScopeRef.current !== reviewScope) return;
        const candidates = result.data?.pages.flatMap(page => page.items)
          .filter(item => savedReview ? Boolean(item.savedAt) : !item.savedAt && item.stage === stage)
          .sort((a, b) => compareOrgCandidates(a, b, sort)) ?? [];
        const next = candidates.find(item => !previousIds.has(item.recommendationId));
        if (next) {
          selectTalent(next, candidates);
          return;
        }
        if (!result.hasNextPage) return;
      }
    } finally {
      loadingNextReview.current = false;
    }
  };
  useEffect(() => {
    if (reviewing || !hasNextPage || fetching || pageError || mutationCount || !fetchNextPage) return;
    const target = loadMoreRef.current;
    const root = scrollRef.current;
    if (!target || !root) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect();
        void fetchNextPage();
      }
    }, { root, rootMargin: "240px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, fetching, pageError, mutationCount, fetchNextPage, reviewing, items.length, stage, view]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: reviewing ? 0 : listScrollTop.current });
  }, [reviewing, stage, sort]);
  return (
    <section
      ref={scrollRef}
      data-org-review-scroll
      onScroll={(event) => {
        if (!reviewing) listScrollTop.current = event.currentTarget.scrollTop;
      }}
      className="@container/inbox h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain"
    >
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2 pt-3 md:pt-4">
        <>
            <Tabs
              activeValue={savedReview ? "saved" : stage}
              variant="borderless"
              size="small"
              className="
                mr-auto w-fit gap-1.5 bg-white
                [&_[role=tab]]:h-8
                [&_[role=tab]]:px-3
                [&_[role=tab]]:bg-white
                [&_[role=tab][aria-selected=true]]:bg-neutral-200
              "
              aria-label={c("인박스 유형", "Inbox type")}
              // className="mr-auto w-fit"
              items={[
                {
                  value: "pending_connection",
                  label: (
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      {c("연결 수락할 후보", "Ready to connect")}
                      {stageCounts.pending_connection > 0 && (
                        <Badge
                          className="h-4 min-w-6 bg-action px-[5px] py-0 text-white tabular-nums font-normal text-[11px] leading-none"
                          size="sm"
                        >
                          {stageCounts.pending_connection}
                        </Badge>
                      )}
                      {reviewBadge(reviewCounts.pending_connection)}
                    </span>
                  ),
                  tooltip: sourceT(ORG_STAGE_DESCRIPTIONS.pending_connection),
                  tooltipVariant: "light",
                },
                {
                  value: "company_intro",
                  label: (
                    <span className="inline-flex items-center gap-2 text-sm">
                      {c("연결 제안할 후보", "Suggested candidates")}
                      <span className="ml-0.5 flex items-center justify-center text-xs text-neutral-800">
                        {stageCounts.company_intro}
                      </span>
                      {reviewBadge(reviewCounts.company_intro)}
                    </span>
                  ),
                  tooltip: sourceT(ORG_STAGE_DESCRIPTIONS.company_intro),
                  tooltipVariant: "light",
                },
                {
                  value: "saved",
                  label: (
                    <span className="inline-flex items-center gap-2 text-sm">
                      {c("저장함", "Saved")}
                      <span className="ml-0.5 flex items-center justify-center text-xs text-neutral-800">
                        {savedCount}
                      </span>
                    </span>
                  ),
                },
              ]}
              onValueChange={(value) =>
                value === "saved"
                  ? change({ review: "saved" })
                  : change({ inboxStage: value })
              }
            />
            {!savedReview && selectedCount >= 2 ? (
              <Badge radius="full" size="md" variant="outline">
                {c("다중 선택 켜짐", "Multi-select on")}
              </Badge>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <MuteButton
                  aria-label={c("정렬: {p0}", "Sort: {p0}", { p0: sortLabel })}
                  title={c("정렬: {p0}", "Sort: {p0}", { p0: sortLabel })}
                  variant="transparent"
                >
                  <ArrowDownWideNarrow className="size-4" strokeWidth={1.4} />
                </MuteButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={sort}
                  onValueChange={(sort) => change({ sort })}
                >
                  <DropdownMenuRadioItem value="latest">
                    {c("최신순", "Newest first")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="recommended">
                    {c("추천순", "Recommended")}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <MuteButton
                  aria-label={c("보기 방식", "View options")}
                  title={c("보기 방식", "View options")}
                  size="sm"
                  variant="transparent"
                >
                  {card ? (
                    <LayoutPanelLeft className="size-4" strokeWidth={1.4} />
                  ) : view === "grid" ? (
                    <LayoutGrid className="size-4" strokeWidth={1.4} />
                  ) : view === "board" ? (
                    <StickyNote className="size-4" strokeWidth={1.4} />
                  ) : (
                    <List className="size-4" strokeWidth={1.4} />
                  )}
                </MuteButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40" sideOffset={2}>
                <DropdownMenuItem
                  onSelect={() => change({ inboxView: "grid" }, false)}
                  selected={view === "grid"}
                  variant="sm"
                >
                  <LayoutGrid strokeWidth={1.4} />
                  {c("그리드", "Grid")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => change({ inboxView: "list" }, false)}
                  selected={view === "list"}
                  variant="sm"
                >
                  <List strokeWidth={1.4} />
                  {c("리스트", "List")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => change({ inboxView: "card" }, true)}
                  selected={view === "card"}
                  variant="sm"
                >
                  <LayoutPanelLeft strokeWidth={1.4} />
                  {c("카드", "Card")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => change({ inboxView: "board" }, false)}
                  selected={view === "board"}
                  variant="sm"
                >
                  <StickyNote strokeWidth={1.4} />
                  {c("포스트잇", "Board")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        </>
        <OrgSearchHistory
          workspaceId={workspaceId}
          roleId={activeRole?.roleId}
        />
      </div>
      {!savedReview && activeRole ? (
        <OrgCriteriaReviewPanel
          items={items}
          key={`${activeRole.roleId}:${stage}`}
          onOpen={(item) => selectTalent(item, items)}
          roleId={activeRole.roleId}
          stage={stage}
          workspaceId={workspaceId}
        />
      ) : null}
      {boardQuery.error &&
        !isOrgQueryBlockingError(boardQuery.error, boardQuery.data) && (
          <OrgErrorState
            message={boardQuery.error.message}
            onRetry={() => void (inboxQuery?.isFetchNextPageError ? reviewing ? loadNextReviewPage() : inboxQuery.fetchNextPage() : boardQuery.refetch())}
          />
        )}
      {isOrgQueryBlockingError(boardQuery.error, boardQuery.data) ? (
        <OrgErrorState
          message={boardQuery.error!.message}
          onRetry={() => void boardQuery.refetch()}
        />
      ) : detailTalentId && !detailRecommendationId ? (
        <TalentDetailSimpleView presentation="inline" />
      ) : boardQuery.isLoading ? (
        <ReviewEmptyState loading />
      ) : reviewing && (detailTalentId || items.length) ? (
        <div>
          <TalentDetailSimpleView
            presentation="inline"
            showBack={savedReview || !card}
            navigationItems={items}
            navigationTotal={inboxQuery?.data?.pages[0]?.totalCount}
            onNextPage={hasNextPage && selectedIndex === items.length - 1 ? () => void loadNextReviewPage() : undefined}
            nextPagePending={inboxQuery?.isFetchingNextPage}
            advanceAfterAction={card || savedReview}
            backLabel={
              savedReview
                ? c("저장함으로 돌아가기", "Back to Saved")
                : view === "grid"
                  ? c("그리드로 돌아가기", "Back to grid")
                  : view === "board"
                    ? c("포스트잇으로 돌아가기", "Back to board")
                    : view === "list"
                      ? c("리스트로 돌아가기", "Back to list")
                      : undefined
            }
            onReviewClose={
              savedReview
                ? () => change({ tab: "pipeline", view: "pipeline" })
                : undefined
            }
          />
        </div>
      ) : !items.length ? (
        <ReviewEmptyState />
      ) : (
        <>
          {savedReview ? null : (
            <OrgCandidateSelectionBar
              canManageCandidates={permissions.canManageCandidates}
              items={items}
              onSelectedIdsChange={setSelectedIds}
              roleId={activeRole?.roleId ?? null}
              roleTitle={activeRole?.name ?? ""}
              selectedIds={selectedIds}
              stage={stage}
              stages={board?.stages ?? []}
              workspaceId={workspaceId}
            />
          )}
          {view === "grid" ? (
            <OrgRoleTalentBoard
              section="inbox"
              inboxItems={items}
              onToggleSelected={savedReview ? undefined : toggleSelected}
              selectedIds={selectedIds}
            />
          ) : view === "board" ? (
            <OrgRoleTalentBoard
              inboxItems={items}
              layout="board"
              onSelectionReplace={savedReview ? undefined : setSelectedIds}
              onToggleSelected={savedReview ? undefined : toggleSelected}
              section="inbox"
              selectedIds={selectedIds}
            />
          ) : (
            <OrgInboxListTable
              canManageCandidates={permissions.canManageCandidates}
              items={items}
              onOpen={(item) => selectTalent(item, items)}
              onToggleSelected={savedReview ? undefined : toggleSelected}
              roleId={activeRole?.roleId ?? null}
              selectedIds={selectedIds}
              workspaceId={workspaceId}
            />
          )}
        </>
      )}
      {hasNextPage && !pageError && !reviewing && (
        <div ref={loadMoreRef} className="flex justify-center py-4">
          <MuteButton
            size="sm"
            disabled={fetching || Boolean(mutationCount)}
            onClick={() => void fetchNextPage?.()}
          >
            {fetching ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
            {c("더 보기", "Load more")}
          </MuteButton>
        </div>
      )}
    </section>
  );
}
