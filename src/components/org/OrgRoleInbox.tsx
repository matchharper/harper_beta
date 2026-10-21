import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  ArrowDownWideNarrow,
  LayoutPanelLeft,
  List,
  Bookmark,
} from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
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
import { OrgPendingConnectionGate } from "./billing/OrgPendingConnectionGate";
import { OrgErrorState } from "./workspace/OrgErrorState";
import { ReviewEmptyState } from "./OrgHomeInbox";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import { getOrgCandidateCardDate } from "@/lib/org/candidateCardDate";

export function OrgRoleInbox() {
  const router = useRouter();
  const { c, locale } = useOrgLocale();
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
  const [actionError, setActionError] = useState("");
  const entitlements = useOrgEntitlements(workspaceId);
  const stage =
    router.query.inboxStage === "company_intro"
      ? "company_intro"
      : "pending_connection";
  const card = router.query.inboxView === "card";
  const sort: OrgCandidateSort =
    router.query.sort === "recommended" ? "recommended" : "latest";
  const items = useMemo(
    () =>
      (board?.items ?? [])
        .filter((item) => !item.savedAt && item.stage === stage)
        .sort((a, b) => compareOrgCandidates(a, b, sort)),
    [board?.items, stage, sort]
  );
  const locked =
    stage === "pending_connection" &&
    Boolean(entitlements.data) &&
    !canUsePendingConnections(entitlements.data, activeRole?.roleId);
  const change = (patch: Record<string, string>) => {
    const query = { ...router.query, ...patch };
    for (const key of [
      "talentId",
      "recommendationId",
      "detailRoleId",
      "detailWorkspaceId",
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
  return (
    <section className="flex h-full min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
        <Tabs
          activeValue={stage}
          aria-label={c("인박스 유형", "Inbox type")}
          className="mr-auto w-fit"
          items={[
            { value: "pending_connection", label: c("연결 대기", "Inbound") },
            {
              value: "company_intro",
              label: c("먼저 제안 가능한 후보", "Suggested"),
            },
          ]}
          onValueChange={(inboxStage) => change({ inboxStage })}
          variant="pills"
          size="small"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MuteButton aria-label={c("정렬", "Sort")} variant="transparent">
              <ArrowDownWideNarrow className="size-4" />
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
              variant="transparent"
            >
              {card ? (
                <LayoutPanelLeft className="size-4" />
              ) : (
                <List className="size-4" />
              )}
            </MuteButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={card ? "card" : "list"}
              onValueChange={(inboxView) => change({ inboxView })}
            >
              <DropdownMenuRadioItem value="list">
                {c("리스트", "List")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="card">
                {c("카드", "Card")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-1000-a10">
          <TalentDetailSimpleView
            presentation="inline"
            showBack={!card}
            navigationItems={items}
          />
        </div>
      ) : !items.length ? (
        <ReviewEmptyState />
      ) : (
        <div className="min-h-0 overflow-y-auto divide-y divide-neutral-1000-a05">
          {items.map((item) => (
            <div
              key={item.recommendationId}
              onClick={() => selectTalent(item, items)}
              className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-md px-3 py-5 hover:bg-bg-weak/50 focus-within:bg-bg-weak/50 lg:grid-cols-[minmax(160px,1fr)_minmax(140px,1fr)_100px_70px_auto]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bg-weak text-sm text-neutral-muted">
                  {item.talent.name?.slice(0, 1) || "·"}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-medium">
                    <MuteButton
                      variant="transparent"
                      className="max-w-full justify-start p-0 text-left"
                      aria-label={c(
                        "{name} 프로필 보기",
                        "View {name}'s profile",
                        {
                          name: item.talent.name || c("후보자", "Candidate"),
                        }
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectTalent(item, items);
                      }}
                    >
                      <span className="truncate">
                        {item.talent.name || c("후보자", "Candidate")}
                      </span>
                    </MuteButton>
                  </h3>
                  <p className="mt-1 truncate text-xs text-neutral-muted">
                    {item.talent.headline || item.talent.location}
                  </p>
                </div>
              </div>
              <div className="hidden min-w-0 lg:block">
                <p className="truncate text-xs">
                  {item.talent.recentCompanies[0]?.label}
                </p>
                <p className="mt-1 truncate text-xs text-neutral-muted">
                  {item.talent.recentSchools[0]?.label}
                </p>
              </div>
              <OrgCriteriaBars evaluations={item.criteriaEvaluations} />
              <time className="hidden text-xs text-neutral-soft lg:block">
                {formatKstRelativeDate(getOrgCandidateCardDate(item), {
                  locale,
                })}
              </time>
              {permissions.canManageCandidates && (
                <MuteButton
                  aria-label={c("{name} 저장", "Save {name}", {
                    name: item.talent.name || c("후보자", "Candidate"),
                  })}
                  variant="transparent"
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
                  <span className="text-xs">Save</span>
                </MuteButton>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
