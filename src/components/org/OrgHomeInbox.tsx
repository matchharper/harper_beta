import { useOrgEntitlements } from "@/hooks/org/useOrgBilling";
import { canUsePendingConnections } from "@/lib/org/billing/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useIsMutating } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Inbox, Menu } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { Tabs } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { useOrgJobsBoard, useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { TalentDetailSimpleView } from "./TalentDetailSimpleView";
import { OrgErrorState } from "./workspace/OrgErrorState";
import { isOrgQueryBlockingError } from "@/lib/org/queryError";
import { compareOrgCandidates } from "@/lib/org/candidateBoardSort";
import { buildOrgHref } from "@/lib/org/routes";
import { cn } from "@/lib/utils";
import { OrgHomeFeed } from "./OrgHomeFeed";
import { OrgHomeListItem } from "./OrgHomeListItem";
import { useOrgMobileNavigation } from "./workspace/OrgMobileNavigation";

export function ReviewEmptyState({ loading = false }: { loading?: boolean }) {
  const { c } = useOrgLocale();
  return (
    <div
      role="status"
      className="flex min-h-48 flex-1 flex-col items-center justify-center gap-3 p-5 text-sm text-neutral-muted"
    >
      {loading ? (
        <div
          aria-label={c("불러오는 중", "Loading")}
          aria-busy
          className="w-full space-y-4"
        >
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-4/5" />
        </div>
      ) : (
        <>
          <Inbox className="size-6 text-neutral-soft" />
          {c("검토할 후보자가 없습니다.", "No candidates to review.")}
        </>
      )}
    </div>
  );
}

export function OrgInboxRemaining({
  remaining,
  total,
}: {
  remaining: number;
  total: number;
}) {
  const { c } = useOrgLocale();
  const [reviewTotal, setReviewTotal] = useState(total);
  if (total > reviewTotal) setReviewTotal(total);
  const ratio = reviewTotal ? remaining / reviewTotal : 0;
  return (
    <span
      aria-label={c("{n}명 남음", "{n} remaining", { n: remaining })}
      className="inline-flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-neutral-muted"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-5 -rotate-90">
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-neutral-1000-a10"
        />
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={`${ratio * 56.55} 56.55`}
          className="text-neutral-primary"
        />
      </svg>
      {remaining}
    </span>
  );
}

export function OrgHomeInbox() {
  const router = useRouter();
  const { openNavigation } = useOrgMobileNavigation();
  const { c } = useOrgLocale();
  const { roles } = useOrgWorkspace();
  const { board, boardQuery } = useOrgJobsBoard();
  const { workspaceId, detailRecommendationId, detailTalentId } =
    useOrgJobsNavigation();
  const feed = router.query.tab === "feed";
  const isDesktop = useIsDesktop();
  const mobileDetail = feed
    ? router.query.feedList !== "1"
    : Boolean(router.query.queue || detailTalentId || detailRecommendationId);
  const listRef = useRef<HTMLDivElement>(null);
  const listScrollTop = useRef(0);
  const lastGroupId = useRef<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const wasMobileDetail = useRef(false);
  const entitlements = useOrgEntitlements(workspaceId);
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
  const groups = useMemo(
    () =>
      roles.flatMap((role) => {
        const items = (board?.items ?? []).filter(
          (item) => item.roleId === role.roleId
        );
        return ["pending_connection", "company_intro"].flatMap((stage) => {
          const all = items.filter(
            (item) =>
              item.stage === stage &&
              (stage !== "pending_connection" ||
                canUsePendingConnections(entitlements.data, role.roleId))
          );
          const remaining = all
            .filter((item) => !item.savedAt)
            .sort((a, b) =>
              compareOrgCandidates(
                a,
                b,
                stage === "company_intro" ? "recommended" : "latest"
              )
            );
          return remaining.length
            ? [
                {
                  id: `${role.roleId}:${stage}`,
                  role,
                  stage,
                  total: all.length,
                  remaining: remaining.length,
                  items:
                    stage === "company_intro"
                      ? remaining.slice(0, 10)
                      : remaining,
                },
              ]
            : [];
        });
      }),
    [board?.items, roles, entitlements.data]
  );
  const requestedGroup = groups.find(
    (group) => group.id === router.query.queue
  );
  const candidateGroup = groups.find((group) =>
    group.items.some((item) => item.recommendationId === detailRecommendationId)
  );
  const selectedGroup =
    candidateGroup ??
    requestedGroup ??
    (isDesktop && !detailTalentId ? groups[0] : undefined);
  const nextPendingGroup =
    selectedGroup?.stage === "pending_connection"
      ? groups
          .slice(groups.indexOf(selectedGroup) + 1)
          .find((group) => group.stage === "pending_connection")
      : undefined;
  const hasBlockingInboxError =
    !feed &&
    (isOrgQueryBlockingError(boardQuery.error, boardQuery.data) ||
      isOrgQueryBlockingError(entitlements.error, entitlements.data));
  const selectedFeedRole =
    roles.find((role) => role.roleId === router.query.feedRole)?.roleId ?? null;
  const routeTo = (
    patch: Record<string, string | undefined>,
    replace = false
  ) => {
    const query = { ...router.query, ...patch };
    for (const key of Object.keys(query))
      if (query[key] === undefined) delete query[key];
    void router[replace ? "replace" : "push"](
      { pathname: router.pathname, query },
      undefined,
      { shallow: true, scroll: false }
    );
  };
  const selectGroup = (
    group: NonNullable<typeof selectedGroup>,
    replace = false
  ) => {
    const item = group.items[0];
    lastGroupId.current = group.id;
    routeTo(
      {
        queue: group.id,
        talentId: item.talentId,
        recommendationId: item.recommendationId,
        detailRoleId: item.roleId,
        detailWorkspaceId: workspaceId,
      },
      replace
    );
  };
  const returnToList = () =>
    routeTo(
      {
        queue: undefined,
        feedList: feed ? "1" : undefined,
        talentId: undefined,
        recommendationId: undefined,
        detailRoleId: undefined,
        detailWorkspaceId: undefined,
      },
      true
    );
  useEffect(() => {
    if (!isDesktop && mobileDetail && !wasMobileDetail.current) {
      detailRef.current
        ?.querySelector<HTMLButtonElement>("[data-org-review-back]")
        ?.focus({ preventScroll: true });
    } else if (!isDesktop && !mobileDetail && wasMobileDetail.current) {
      if (listRef.current) {
        listRef.current.scrollTop = listScrollTop.current;
        const button = Array.from(
          listRef.current.querySelectorAll<HTMLButtonElement>(
            "button[data-home-list-item]"
          )
        ).find(
          (element) =>
            element.dataset.homeListItem ===
            (feed ? (selectedFeedRole ?? "all") : lastGroupId.current)
        );
        (button ?? listRef.current).focus({ preventScroll: true });
      }
    }
    wasMobileDetail.current = mobileDetail;
  }, [feed, isDesktop, mobileDetail, selectedFeedRole]);
  useEffect(() => {
    if (
      feed ||
      (!isDesktop && !mobileDetail) ||
      (detailTalentId && !detailRecommendationId) ||
      !router.isReady ||
      !boardQuery.data ||
      isOrgQueryBlockingError(boardQuery.error, boardQuery.data) ||
      mutationCount ||
      entitlements.isLoading
    )
      return;
    if (
      selectedGroup &&
      !selectedGroup.items.some(
        (item) => item.recommendationId === detailRecommendationId
      )
    )
      selectGroup(selectedGroup, true);
  });
  const selectFeedRole = (roleId: string | null) => {
    lastGroupId.current = roleId ?? "all";
    routeTo({ feedRole: roleId ?? undefined, feedList: undefined });
  };
  const homeNavigation = (
    <>
      <header className="mb-3 lg:mb-5 flex items-center justify-between lg:mt-7">
        <h1 className="text-xl font-medium">Home</h1>
      </header>
      <Tabs
        activeValue={feed ? "feed" : "inbox"}
        aria-label={c("Home 보기", "Home view")}
        className="mb-3 lg:mb-5 w-fit"
        items={[
          { value: "inbox", label: c("인박스", "Inbox") },
          { value: "feed", label: c("피드", "Feed") },
        ]}
        onValueChange={(tab) => {
          listScrollTop.current = 0;
          lastGroupId.current = null;
          if (listRef.current) listRef.current.scrollTop = 0;
          routeTo({
            tab,
            feedList: undefined,
            feedRole: undefined,
            queue: undefined,
            talentId: undefined,
            recommendationId: undefined,
            detailRoleId: undefined,
            detailWorkspaceId: undefined,
          });
        }}
        variant="pills"
        size="small"
      />
    </>
  );
  const mobileNavigationTitle =
    selectedGroup?.role.name ??
    roles.find((role) => role.roleId === router.query.detailRoleId)?.name ??
    c("후보자 검토", "Candidate review");
  const listBackHeader = (title: string) => (
    <header className="sticky top-0 z-20 flex min-w-0 items-center gap-1 bg-linear-to-b from-white to-white/0 px-1 py-1">
      <MuteButton
        data-org-review-back
        onClick={returnToList}
        variant="transparent"
        size="sm"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {c("목록", "List")}
      </MuteButton>
      <h1
        title={title}
        className="min-w-0 flex-1 truncate text-[13px] font-medium"
      >
        {title}
      </h1>
    </header>
  );
  const mobileMenu = (
    <div className="flex h-12 items-center px-2 md:hidden">
      <MuteButton
        aria-label={c("메뉴 열기", "Open menu")}
        onClick={openNavigation}
        size="md"
        variant="transparent"
      >
        <Menu aria-hidden className="size-4.5" strokeWidth={1.7} />
      </MuteButton>
    </div>
  );
  return (
    <div className="isolate grid h-dvh min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)] lg:h-[calc(100dvh-24px)] lg:grid-cols-[minmax(280px,calc(28%+40px))_minmax(0,1fr)] lg:gap-x-5">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none col-start-1 row-start-1 -z-10 bg-neutral-50/60 lg:-my-3 lg:-ml-4 lg:border-r lg:border-black/5",
          mobileDetail && "hidden lg:block"
        )}
      />
      <div
        ref={listRef}
        tabIndex={-1}
        onScroll={(event) => {
          listScrollTop.current = event.currentTarget.scrollTop;
        }}
        className={cn(
          "col-start-1 row-start-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain p-2 scrollbar-thin scrollbar-thumb-black/10 scrollbar-track-transparent lg:-my-3 lg:-ml-1 lg:block lg:py-3 lg:pl-1 lg:pr-4",
          mobileDetail && "hidden"
        )}
      >
        {mobileMenu}
        {homeNavigation}
        {hasBlockingInboxError ? (
          <div className="col-start-1 row-start-3">
            <OrgErrorState
              message={(boardQuery.error ?? entitlements.error)!.message}
              onRetry={() => {
                void boardQuery.refetch();
                void entitlements.refetch();
              }}
            />
          </div>
        ) : (
          <aside
            className="p-1 pb-6 lg:p-0"
            aria-label={c("역할별 작업", "Tasks by role")}
          >
            {feed ? (
              <nav
                aria-label={c("피드 Role 필터", "Feed role filter")}
                className="space-y-1"
              >
                <OrgHomeListItem
                  onClick={() => selectFeedRole(null)}
                  data-home-list-item="all"
                  selected={!selectedFeedRole}
                  className="min-h-10 lg:min-h-0"
                >
                  All
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 lg:hidden"
                  />
                </OrgHomeListItem>
                {roles.map((role) => (
                  <OrgHomeListItem
                    key={role.roleId}
                    onClick={() => selectFeedRole(role.roleId)}
                    data-home-list-item={role.roleId}
                    selected={role.roleId === selectedFeedRole}
                    className="min-h-10 lg:min-h-0"
                  >
                    <span className="truncate">{role.name}</span>
                    <ChevronRight
                      aria-hidden
                      className="size-4 shrink-0 lg:hidden"
                    />
                  </OrgHomeListItem>
                ))}
              </nav>
            ) : (
              roles.map((role) => {
                const roleGroups = groups.filter(
                  (group) => group.role.roleId === role.roleId
                );
                if (!roleGroups.length) return null;
                return (
                  <section key={role.roleId} className="mb-8">
                    <Link
                      className="text-sm font-normal text-neutral-primary flex flex-row items-center cursor-pointer px-2 py-1 rounded-sm hover:bg-bg-weak mb-2 w-fit"
                      href={buildOrgHref({
                        page: "role",
                        roleId: role.roleId,
                        orgId: workspaceId,
                        tab: "inbox",
                      })}
                    >
                      <span className="truncate">{role.name}</span>
                      <ChevronRight className="ml-1.5 size-4" />
                    </Link>
                    {roleGroups.map((group) => (
                      <OrgHomeListItem
                        key={group.id}
                        data-home-list-item={group.id}
                        onClick={() => selectGroup(group)}
                        selected={
                          (isDesktop || mobileDetail) &&
                          selectedGroup?.id === group.id
                        }
                        className="min-h-11 lg:min-h-0"
                      >
                        <span>
                          {group.stage === "pending_connection"
                            ? c(
                                "관심 있는 후보 검토",
                                group.remaining === 1
                                  ? "Review an interested candidate"
                                  : "Review interested candidates"
                              )
                            : group.remaining >= 10
                              ? c(
                                  "Top 10 후보 검토",
                                  "Review your top 10 candidates"
                                )
                              : c(
                                  "후보 {n}명 검토",
                                  group.remaining === 1
                                    ? "Review 1 candidate"
                                    : "Review {n} candidates",
                                  { n: group.remaining }
                                )}
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-2">
                          {group.stage === "pending_connection" && (
                            <OrgInboxRemaining
                              remaining={group.remaining}
                              total={group.total}
                            />
                          )}
                          <ChevronRight
                            aria-hidden
                            className="size-4 shrink-0 text-neutral-muted lg:hidden"
                          />
                        </span>
                      </OrgHomeListItem>
                    ))}
                  </section>
                );
              })
            )}
            {!feed && !groups.length && (
              <ReviewEmptyState
                loading={boardQuery.isLoading || entitlements.isLoading}
              />
            )}
          </aside>
        )}
      </div>
      {(!hasBlockingInboxError || mobileDetail) &&
        (feed || isDesktop || mobileDetail) && (
          <div
            ref={detailRef}
            className={cn(
              "col-start-1 row-start-1 min-h-0 min-w-0 lg:col-start-2",
              feed
                ? "flex flex-col overflow-hidden"
                : "overflow-y-auto overscroll-contain",
              feed && !mobileDetail && "hidden lg:flex"
            )}
            data-org-review-scroll={feed ? undefined : true}
          >
            {!feed && mobileMenu}
            {!feed && (boardQuery.error || entitlements.error) && (
              <OrgErrorState
                message={(boardQuery.error ?? entitlements.error)!.message}
                onRetry={() => {
                  void boardQuery.refetch();
                  void entitlements.refetch();
                }}
              />
            )}
            {feed ? (
              <OrgHomeFeed
                workspaceId={workspaceId}
                roleId={selectedFeedRole}
                roleName={
                  roles.find((role) => role.roleId === selectedFeedRole)?.name
                }
                scrollHeader={
                  !isDesktop ? (
                    <>
                      {mobileMenu}
                      <div className="px-2 pt-2">{homeNavigation}</div>
                    </>
                  ) : undefined
                }
                navigationHeader={
                  !isDesktop
                    ? listBackHeader(
                        roles.find((role) => role.roleId === selectedFeedRole)
                          ?.name ?? "All"
                      )
                    : undefined
                }
              />
            ) : selectedGroup ? (
              <>
                <TalentDetailSimpleView
                  presentation="inline"
                  showBack={!isDesktop}
                  navigationTitle={
                    !isDesktop ? mobileNavigationTitle : undefined
                  }
                  advanceAfterAction
                  onReviewClose={!isDesktop ? returnToList : undefined}
                  navigationItems={selectedGroup.items}
                  nextNavigation={
                    isDesktop && nextPendingGroup
                      ? {
                          item: nextPendingGroup.items[0],
                          onNavigate: () => selectGroup(nextPendingGroup, true),
                        }
                      : undefined
                  }
                />
              </>
            ) : detailTalentId ? (
              <TalentDetailSimpleView
                presentation="inline"
                showBack
                navigationTitle={!isDesktop ? mobileNavigationTitle : undefined}
                onReviewClose={!isDesktop ? returnToList : undefined}
              />
            ) : (
              <>
                {!isDesktop && listBackHeader(mobileNavigationTitle)}
                <ReviewEmptyState
                  loading={boardQuery.isLoading || entitlements.isLoading}
                />
              </>
            )}
          </div>
        )}
    </div>
  );
}
