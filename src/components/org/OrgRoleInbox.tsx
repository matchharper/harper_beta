import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useIsMutating } from "@tanstack/react-query";
import {
  ArrowDownWideNarrow,
  LayoutPanelLeft,
  LayoutGrid,
  List,
  Bookmark,
} from "lucide-react";
import { CardButton, MuteButton } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import { ORG_STAGE_DESCRIPTIONS } from "@/lib/org/pipelineStage";
import { useOrgJobsBoard, useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgCandidateSave } from "@/hooks/org/useOrgCandidateSave";
import { useOrgEntitlements } from "@/hooks/org/useOrgBilling";
import { canUsePendingConnections } from "@/lib/org/billing/types";
import {
  compareOrgCandidates,
  type OrgCandidateSort,
} from "@/lib/org/candidateBoardSort";
import { TalentDetailSimpleView } from "./TalentDetailSimpleView";
import { OrgCriteriaBars } from "./OrgCriteriaBars";
import { OrgSearchHistory } from "./OrgSearchHistory";
import { OrgRoleTalentBoard } from "./OrgRoleTalentBoard";
import { OrgPendingConnectionGate } from "./billing/OrgPendingConnectionGate";
import { OrgErrorState } from "./workspace/OrgErrorState";
import { ReviewEmptyState } from "./OrgHomeInbox";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import { getOrgCandidateCardDate } from "@/lib/org/candidateCardDate";

export function OrgRoleInbox() {
  const router = useRouter();
  const { c, locale } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const { board, boardQuery } = useOrgJobsBoard();
  const {
    activeRole,
    detailRecommendationId,
    detailTalentId,
    selectTalent,
    workspaceId,
  } = useOrgJobsNavigation();
  const { permissions } = useOrgWorkspace();
  const save = useOrgCandidateSave();
  const listScrollTop = useRef(0);
  const scrollRef = useRef<HTMLElement>(null);
  const [actionError, setActionError] = useState("");
  const entitlements = useOrgEntitlements(workspaceId);
  const mutationCount = useIsMutating();
  const savedReview = router.query.review === "saved";
  const stage =
    router.query.inboxStage === "company_intro"
      ? "company_intro"
      : "pending_connection";
  const view =
    router.query.inboxView === "card"
      ? "card"
      : router.query.inboxView === "grid"
        ? "grid"
        : "list";
  const card = view === "card";
  const sort: OrgCandidateSort =
    router.query.sort === "recommended" ? "recommended" : "latest";
  const items = useMemo(
    () =>
      (board?.items ?? [])
        .filter((item) =>
          savedReview
            ? Boolean(item.savedAt) &&
              (item.stage !== "pending_connection" ||
                canUsePendingConnections(entitlements.data, item.roleId))
            : !item.savedAt && item.stage === stage
        )
        .sort((a, b) => compareOrgCandidates(a, b, sort)),
    [board?.items, stage, sort, savedReview, entitlements.data]
  );
  const locked =
    !savedReview &&
    stage === "pending_connection" &&
    Boolean(entitlements.data) &&
    !canUsePendingConnections(entitlements.data, activeRole?.roleId);
  const change = (patch: Record<string, string>, preserveSelection = false) => {
    if (patch.inboxStage || patch.sort) listScrollTop.current = 0;
    const query = { ...router.query, ...patch };
    if (!preserveSelection)
      for (const key of [
        "talentId",
        "recommendationId",
        "detailRoleId",
        "detailWorkspaceId",
        "review",
      ])
        delete query[key];
    void router.push({ pathname: router.pathname, query }, undefined, {
      shallow: true,
      scroll: false,
    });
  };
  useEffect(() => {
    if (
      card &&
      !savedReview &&
      !mutationCount &&
      !locked &&
      boardQuery.isSuccess &&
      !boardQuery.isFetching &&
      items.length &&
      !items.some((item) => item.recommendationId === detailRecommendationId)
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
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2 pt-5 md:pt-6">
        {savedReview ? (
          <h2 className="mr-auto text-sm font-medium">
            {c("저장함", "Saved")}
          </h2>
        ) : (
          <>
            <Tabs
              activeValue={stage}
              aria-label={c("인박스 유형", "Inbox type")}
              className="mr-auto w-fit"
              items={[
                {
                  value: "pending_connection",
                  label: c("연결 대기", "Inbound"),
                  tooltip: sourceT(ORG_STAGE_DESCRIPTIONS.pending_connection),
                },
                {
                  value: "company_intro",
                  label: c("먼저 제안 가능한 후보", "Suggested"),
                  tooltip: sourceT(ORG_STAGE_DESCRIPTIONS.company_intro),
                },
              ]}
              onValueChange={(inboxStage) => change({ inboxStage })}
              variant="pills"
              size="small"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <MuteButton
                  aria-label={c("정렬", "Sort")}
                  title={c("정렬", "Sort")}
                  variant="transparent"
                >
                  <ArrowDownWideNarrow className="size-4" />
                </MuteButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={sort}
                  onValueChange={(sort) => change({ sort }, true)}
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
                  variant="transparent"
                >
                  {card ? (
                    <LayoutPanelLeft className="size-4" />
                  ) : view === "grid" ? (
                    <LayoutGrid className="size-4" />
                  ) : (
                    <List className="size-4" />
                  )}
                </MuteButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={view}
                  onValueChange={(inboxView) =>
                    change({ inboxView }, inboxView === "card")
                  }
                >
                  <DropdownMenuRadioItem value="list">
                    {c("리스트", "List")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="card">
                    {c("카드", "Card")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="grid">
                    {c("그리드", "Grid")}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        <OrgSearchHistory
          workspaceId={workspaceId}
          roleId={activeRole?.roleId}
        />
      </div>
      {actionError && (
        <p role="alert" className="mb-3 text-xs text-critical">
          {actionError}
        </p>
      )}
      {boardQuery.isError ? (
        <OrgErrorState
          message={boardQuery.error.message}
          onRetry={() => void boardQuery.refetch()}
        />
      ) : stage === "pending_connection" && !entitlements.data ? (
        entitlements.isError ? (
          <OrgErrorState
            message={entitlements.error.message}
            onRetry={() => void entitlements.refetch()}
          />
        ) : (
          <ReviewEmptyState loading />
        )
      ) : locked ? (
        <OrgPendingConnectionGate workspaceId={workspaceId} />
      ) : boardQuery.isLoading ? (
        <ReviewEmptyState loading />
      ) : reviewing && (detailTalentId || items.length) ? (
        <div>
          <TalentDetailSimpleView
            presentation="inline"
            showBack={savedReview || !card}
            navigationItems={items}
            advanceAfterAction={card || savedReview}
            backLabel={
              savedReview
                ? c("저장함으로 돌아가기", "Back to Saved")
                : view === "grid"
                  ? c("그리드로 돌아가기", "Back to grid")
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
      ) : view === "grid" ? (
        <OrgRoleTalentBoard section="inbox" inboxItems={items} />
      ) : (
        <div className="divide-y divide-neutral-1000-a05">
          {items.map((item) => (
            <article
              key={item.recommendationId}
              className="relative isolate grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-md px-2 py-5 @min-[700px]/inbox:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_64px_auto]"
            >
              <CardButton
                className="absolute inset-0 z-0 h-full border-0 bg-transparent p-0 shadow-none"
                aria-label={c("{name} 프로필 보기", "View {name}'s profile", {
                  name: item.talent.name || c("후보자", "Candidate"),
                })}
                onClick={() => selectTalent(item, items)}
              >
                <span className="sr-only">{item.talent.name}</span>
              </CardButton>
              <div className="pointer-events-none relative z-10 flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bg-weak text-sm text-neutral-muted">
                  {item.talent.name?.slice(0, 1) || "·"}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-medium">
                    {item.talent.name || c("후보자", "Candidate")}
                  </h3>
                  <p className="mt-1 truncate text-xs text-neutral-muted">
                    {item.talent.headline || item.talent.location}
                    {item.talent.recentCompanies[0]?.label && (
                      <span className="@min-[700px]/inbox:hidden">
                        {" "}
                        · {item.talent.recentCompanies[0].label}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="pointer-events-none relative z-10 hidden min-w-0 @min-[700px]/inbox:block">
                <p className="truncate text-xs">
                  {item.talent.recentCompanies[0]?.label}
                </p>
                <p className="mt-1 truncate text-xs text-neutral-muted">
                  {item.talent.recentSchools[0]?.label}
                </p>
              </div>
              <div className="relative z-10">
                <OrgCriteriaBars evaluations={item.criteriaEvaluations} />
              </div>
              <time className="pointer-events-none relative z-10 hidden text-xs text-neutral-soft @min-[700px]/inbox:block">
                {formatKstRelativeDate(getOrgCandidateCardDate(item), {
                  locale,
                })}
              </time>
              {permissions.canManageCandidates && (
                <MuteButton
                  title="Save"
                  aria-label={c("{name} 저장", "Save {name}", {
                    name: item.talent.name || c("후보자", "Candidate"),
                  })}
                  variant="transparent"
                  className="relative z-10"
                  disabled={save.isPending}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActionError("");
                    save.mutate(
                      {
                        workspaceId,
                        roleId: item.roleId,
                        talentId: item.talentId,
                        recommendationId: item.recommendationId,
                        saved: true,
                      },
                      { onError: (error) => setActionError(error.message) }
                    );
                  }}
                >
                  <Bookmark className="size-4" />
                </MuteButton>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
