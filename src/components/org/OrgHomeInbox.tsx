import { useOrgEntitlements } from "@/hooks/org/useOrgBilling";
import { canUsePendingConnections } from "@/lib/org/billing/types";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useIsMutating } from "@tanstack/react-query";
import { ChevronRight, Inbox } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { CardButton, MuteButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { useOrgJobsBoard, useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { TalentDetailSimpleView } from "./TalentDetailSimpleView";
import { OrgErrorState } from "./workspace/OrgErrorState";
import { compareOrgCandidates } from "@/lib/org/candidateBoardSort";
import { buildOrgHref } from "@/lib/org/routes";
import { cn } from "@/lib/utils";
import { OrgHomeFeed } from "./OrgHomeFeed";

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
  const { c } = useOrgLocale();
  const { roles } = useOrgWorkspace();
  const { board, boardQuery } = useOrgJobsBoard();
  const { workspaceId, detailRecommendationId } = useOrgJobsNavigation();
  const feed = router.query.tab === "feed";
  const entitlements = useOrgEntitlements(workspaceId);
  const mutationCount = useIsMutating();
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
  const selectedGroup =
    groups.find((group) => group.id === router.query.queue) ??
    groups.find((group) =>
      group.items.some(
        (item) => item.recommendationId === detailRecommendationId
      )
    ) ??
    groups[0];
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
  useEffect(() => {
    if (
      feed ||
      !router.isReady ||
      !boardQuery.isSuccess ||
      boardQuery.isFetching ||
      mutationCount
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
  return (
    <div className="grid h-[calc(100dvh-72px)] min-h-0 grid-cols-1 grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-x-5 md:h-[calc(100dvh-24px)] lg:grid-cols-[minmax(240px,28%)_minmax(0,1fr)] lg:grid-rows-[auto_auto_minmax(0,1fr)]">
      <header className="mb-5 flex items-center justify-between lg:col-start-1 lg:row-start-1 lg:mt-7">
        <h1 className="text-xl font-medium">Home</h1>
      </header>
      <Tabs
        activeValue={feed ? "feed" : "inbox"}
        aria-label={c("Home 보기", "Home view")}
        className="mb-5 w-fit lg:col-start-1 lg:row-start-2"
        items={[
          { value: "inbox", label: c("인박스", "Inbox") },
          { value: "feed", label: c("피드", "Feed") },
        ]}
        onValueChange={(tab) =>
          routeTo({
            tab,
            talentId: undefined,
            recommendationId: undefined,
            detailRoleId: undefined,
            detailWorkspaceId: undefined,
          })
        }
        variant="pills"
        size="small"
      />
      {!feed && (boardQuery.isError || entitlements.isError) ? (
        <OrgErrorState
          message={(boardQuery.error ?? entitlements.error)!.message}
          onRetry={() => {
            void boardQuery.refetch();
            void entitlements.refetch();
          }}
        />
      ) : (
        <div className="contents">
          <aside
            className={cn(
              "mb-5 max-h-44 lg:col-start-1 lg:row-start-3 lg:mb-0 lg:max-h-none lg:pr-3",
              feed
                ? "min-w-0 overflow-x-auto pb-1 lg:overflow-y-auto lg:pb-0"
                : "overflow-y-auto"
            )}
            aria-label={c("역할별 작업", "Tasks by role")}
          >
            {feed ? (
              <nav
                aria-label={c("피드 Role 필터", "Feed role filter")}
                className="flex gap-1 lg:block lg:space-y-1"
              >
                <MuteButton
                  onClick={() => routeTo({ feedRole: undefined })}
                  aria-current={!selectedFeedRole ? "true" : undefined}
                  variant={!selectedFeedRole ? "neutral" : "transparent"}
                  className="shrink-0 justify-start px-3 py-3 lg:w-full"
                >
                  All
                </MuteButton>
                {roles.map((role) => (
                  <MuteButton
                    key={role.roleId}
                    onClick={() => routeTo({ feedRole: role.roleId })}
                    aria-current={
                      role.roleId === selectedFeedRole ? "true" : undefined
                    }
                    variant={
                      role.roleId === selectedFeedRole
                        ? "neutral"
                        : "transparent"
                    }
                    className="max-w-60 shrink-0 justify-start px-3 py-3 lg:w-full lg:max-w-none"
                  >
                    <span className="truncate">{role.name}</span>
                  </MuteButton>
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
                    <MuteButton
                      variant="transparent"
                      className="mb-2 max-w-full justify-start text-[15px] font-medium text-neutral-primary"
                      onClick={() =>
                        void router.push(
                          buildOrgHref({
                            page: "role",
                            roleId: role.roleId,
                            orgId: workspaceId,
                            tab: "inbox",
                          })
                        )
                      }
                    >
                      <span className="truncate">{role.name}</span>
                      <ChevronRight className="ml-2 size-4 text-neutral-soft" />
                    </MuteButton>
                    {roleGroups.map((group) => (
                      <CardButton
                        key={group.id}
                        onClick={() => selectGroup(group)}
                        aria-current={
                          selectedGroup?.id === group.id ? "true" : undefined
                        }
                        className={cn(
                          "mb-1 flex w-full items-center justify-between gap-3 border-0 px-3 py-4 text-left text-sm font-normal shadow-none transition hover:bg-bg-weak",
                          selectedGroup?.id === group.id && "bg-bg-weak"
                        )}
                      >
                        <span>
                          {group.stage === "pending_connection"
                            ? c(
                                "Intro 수락 또는 거절",
                                group.remaining === 1
                                  ? "Accept or reject an intro"
                                  : "Accept or reject intros"
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
                        {group.stage === "pending_connection" && (
                          <OrgInboxRemaining
                            remaining={group.remaining}
                            total={group.total}
                          />
                        )}
                      </CardButton>
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
          <div
            data-org-review-scroll={feed ? undefined : true}
            className={cn(
              "min-h-0 min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-3",
              feed
                ? "flex flex-col overflow-hidden"
                : "overflow-y-auto overscroll-contain"
            )}
          >
            {feed ? (
              <OrgHomeFeed
                workspaceId={workspaceId}
                roleId={selectedFeedRole}
                roleName={
                  roles.find((role) => role.roleId === selectedFeedRole)?.name
                }
              />
            ) : selectedGroup ? (
              <TalentDetailSimpleView
                presentation="inline"
                showBack={false}
                advanceAfterAction
                navigationItems={selectedGroup.items}
              />
            ) : (
              <ReviewEmptyState
                loading={boardQuery.isLoading || entitlements.isLoading}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
