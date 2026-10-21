import { useOrgEntitlements } from "@/hooks/org/useOrgBilling";
import { canUsePendingConnections } from "@/lib/org/billing/types";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  Inbox,
  Mail,
  MessageSquare,
  CalendarDays,
  Check,
} from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { CardButton, MuteButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { useOrgJobsBoard, useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { TalentDetailSimpleView } from "./TalentDetailSimpleView";
import { OrgSearchHistory } from "./OrgSearchHistory";
import { OrgErrorState } from "./workspace/OrgErrorState";
import { compareOrgCandidates } from "@/lib/org/candidateBoardSort";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { buildOrgHref } from "@/lib/org/routes";
import type {
  OrgHomeActivity,
  OrgHomeActivityKind,
} from "@/lib/org/homeActivity";
import { cn, formatRelativeTime } from "@/lib/utils";

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

function RoleActivity({
  workspaceId,
  roleId,
}: {
  workspaceId: string;
  roleId: string;
}) {
  const { c, locale } = useOrgLocale();
  const query = useQuery({
    queryKey: ["org", "home-activity", workspaceId, roleId],
    enabled: Boolean(roleId),
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: () =>
      fetchWithInternalAuth<{ items: OrgHomeActivity[] }>(
        `/api/org/activity?${new URLSearchParams({ workspaceId, roleId })}`
      ),
  });
  const labels: Record<OrgHomeActivityKind, string> = {
    intro_sent: c("Intro 발송", "Intro sent"),
    pending_connection: c("새로운 연결 대기", "Ready to connect"),
    intro_accepted: c("Intro 수락", "Intro accepted"),
    candidate_message: c("후보자 메시지", "New candidate message"),
    candidate_response: c("후보자 답변", "Candidate replied"),
    company_question: c("후보자에게 연락 발송", "Message sent to candidate"),
    meeting_requested: c("인터뷰 요청", "Interview requested"),
    meeting_confirmed: c("인터뷰 일정 확정", "Interview scheduled"),
  };
  if (query.isError)
    return (
      <OrgErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  if (!roleId || query.isLoading)
    return <ReviewEmptyState loading={query.isLoading} />;
  return (
    <section
      aria-label={c("역할 피드", "Role feed")}
      className="min-h-0 flex-1 overflow-y-auto px-5 py-2 lg:px-10"
    >
      {query.data?.items.length ? (
        query.data.items.map((item) => {
          const Icon = item.kind.startsWith("meeting")
            ? CalendarDays
            : item.kind === "intro_accepted"
              ? Check
              : item.kind === "intro_sent"
                ? Mail
                : MessageSquare;
          return (
            <article
              key={item.id}
              className="flex gap-4 border-b border-neutral-1000-a05 py-6"
            >
              <Icon
                aria-hidden
                className="mt-1 size-4 shrink-0 text-neutral-muted"
              />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-4">
                  <h3 className="text-sm font-medium">
                    {item.talentName || c("후보자", "Candidate")}
                  </h3>
                  <time
                    dateTime={item.createdAt}
                    title={new Date(item.createdAt).toLocaleString(locale)}
                    className="shrink-0 text-xs text-neutral-soft"
                  >
                    {formatRelativeTime(item.createdAt, locale)}
                  </time>
                </div>
                <p className="mt-1 text-sm">{labels[item.kind]}</p>
                {item.text && (
                  <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-neutral-muted">
                    {item.text}
                  </p>
                )}
              </div>
            </article>
          );
        })
      ) : (
        <p className="py-16 text-center text-sm text-neutral-muted">
          {c("아직 새로운 소식이 없습니다.", "No updates yet.")}
        </p>
      )}
    </section>
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
    roles.find((role) => role.roleId === router.query.feedRole)?.roleId ??
    roles[0]?.roleId ??
    "";
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
    <div className="flex h-[calc(100dvh-116px)] min-h-0 flex-col">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-medium">Home</h1>
        <OrgSearchHistory workspaceId={workspaceId} />
      </header>
      <Tabs
        activeValue={feed ? "feed" : "inbox"}
        aria-label={c("Home 보기", "Home view")}
        className="mb-5 w-fit"
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
      {boardQuery.isError || entitlements.isError ? (
        <OrgErrorState
          message={(boardQuery.error ?? entitlements.error)!.message}
          onRetry={() => {
            void boardQuery.refetch();
            void entitlements.refetch();
          }}
        />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(240px,28%)_minmax(0,1fr)] lg:grid-rows-1">
          <aside
            className="max-h-44 overflow-y-auto lg:max-h-none lg:pr-3"
            aria-label={c("역할별 작업", "Tasks by role")}
          >
            {feed
              ? roles.map((role) => (
                  <MuteButton
                    key={role.roleId}
                    onClick={() => routeTo({ feedRole: role.roleId })}
                    variant={
                      role.roleId === selectedFeedRole
                        ? "neutral"
                        : "transparent"
                    }
                    className="mb-1 w-full justify-start"
                  >
                    {role.name}
                  </MuteButton>
                ))
              : roles.map((role) => {
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
                                    ? "Accept or pass on an intro"
                                    : "Accept or pass on intros"
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
                })}
            {!feed && !groups.length && (
              <ReviewEmptyState
                loading={boardQuery.isLoading || entitlements.isLoading}
              />
            )}
          </aside>
          <div
            data-org-review-scroll={feed ? undefined : true}
            className={cn(
              "min-h-0 min-w-0",
              feed
                ? "flex flex-col overflow-hidden rounded-xl border border-neutral-1000-a10"
                : "overflow-y-auto overscroll-contain"
            )}
          >
            {feed ? (
              <RoleActivity
                workspaceId={workspaceId}
                roleId={selectedFeedRole}
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
