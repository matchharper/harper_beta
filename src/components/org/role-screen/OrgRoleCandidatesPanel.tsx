import { ChevronsLeftRight, ChevronsRightLeft, LoaderCircle } from "lucide-react";
import { useRouter } from "next/router";
import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { OrgCandidateSortMenu } from "@/components/org/OrgCandidateToolbar";
import { ReviewEmptyState } from "@/components/org/OrgHomeInbox";
import { OrgCriteriaReviewPanel } from "@/components/org/OrgCriteriaRecheck";
import { OrgExternalCandidates } from "@/components/org/OrgExternalCandidates";
import { OrgReviewingLine } from "@/components/org/OrgReviewingLine";
import { OrgRoleTalentBoard } from "@/components/org/OrgRoleTalentBoard";
import { OrgSearchHistory } from "@/components/org/OrgSearchHistory";
import { TalentDetailSimpleView } from "@/components/org/TalentDetailSimpleView";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import { TabBoxes, type TabBoxItem } from "@/components/ui/tab-boxes";
import {
  OrgJobsProvider,
  useOrgJobsBoard,
  useOrgJobsNavigation,
} from "@/hooks/org/useOrgJobs";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import {
  compareOrgCandidates,
  type OrgCandidateSort,
} from "@/lib/org/candidateBoardSort";
import type { OrgInboxCounts } from "@/lib/org/inboxPagination";
import { isOrgQueryBlockingError } from "@/lib/org/queryError";
import {
  isOrgRoleOpenPipelineStage,
  type OrgRoleCandidateTab,
} from "@/lib/org/roleScreen";
import type { OrgBoardItem, OrgRole, OrgStage } from "@/lib/org/server";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import { useOrgDeferredActionStore } from "@/store/useOrgDeferredActionStore";
import {
  OrgRoleCandidatesTab,
  RoleStartRegisteredNotice,
  type RolePipelineDisplay,
} from "./OrgRoleBoardViews";
import { OrgCandidateListContext } from "./OrgRoleCandidateCard";

type ListProps = { onAskHarper: (item: OrgBoardItem) => void };

/** One open card at a time, like the candidate side's opportunity list. */
function CandidateList({
  children,
  onAskHarper,
}: ListProps & { children: ReactNode }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const value = useMemo(
    () => ({
      expandedId,
      onAskHarper,
      onToggle: (id: string) =>
        setExpandedId((current) => (current === id ? null : id)),
    }),
    [expandedId, onAskHarper]
  );
  return (
    <OrgCandidateListContext.Provider value={value}>
      {children}
    </OrgCandidateListContext.Provider>
  );
}

const listLayout = (cards: OrgBoardItem[], renderCard: (item: OrgBoardItem) => ReactNode) => (
  <div className="org-candidate-list">{cards.map(renderCard)}</div>
);

/** 연결을 기다리는 후보 · 연결을 요청할 후보 · 저장: the inbox pages, newest first. */
function InboxList({ onAskHarper }: ListProps) {
  const router = useRouter();
  const { c } = useOrgLocale();
  const { board, boardQuery, inboxQuery } = useOrgJobsBoard();
  const { activeRole, selectTalent, workspaceId } = useOrgJobsNavigation();
  const deferredStages = useOrgDeferredActionStore((state) => state.deferredStages);
  const savedReview = router.query.review === "saved";
  const stage =
    router.query.inboxStage === "company_intro" ? "company_intro" : "pending_connection";
  const sort: OrgCandidateSort =
    router.query.sort === "recommended" ? "recommended" : "latest";
  const items = useMemo(
    () =>
      (board?.items ?? [])
        .filter(
          (item) =>
            !deferredStages.has(item.recommendationId) &&
            (savedReview ? Boolean(item.savedAt) : !item.savedAt && item.stage === stage)
        )
        .sort((left, right) => compareOrgCandidates(left, right, sort)),
    [board?.items, deferredStages, savedReview, sort, stage]
  );
  if (isOrgQueryBlockingError(boardQuery.error, boardQuery.data)) {
    return (
      <OrgErrorState
        message={boardQuery.error?.message ?? ""}
        onRetry={() => void boardQuery.refetch()}
      />
    );
  }
  return (
    <CandidateList onAskHarper={onAskHarper}>
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
      {boardQuery.isLoading ? (
        <ReviewEmptyState loading />
      ) : items.length ? (
        <OrgRoleTalentBoard
          card="expandable"
          inboxItems={items}
          renderLayout={listLayout}
          section="inbox"
        />
      ) : (
        <ReviewEmptyState />
      )}
      {inboxQuery?.hasNextPage && !inboxQuery.isFetchNextPageError ? (
        <div className="flex justify-center py-4">
          <MuteButton
            disabled={inboxQuery.isFetchingNextPage}
            onClick={() => void inboxQuery.fetchNextPage()}
            size="sm"
          >
            {inboxQuery.isFetchingNextPage ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
            ) : null}
            {c("더 보기", "Load more")}
          </MuteButton>
        </div>
      ) : null}
    </CandidateList>
  );
}

function stageLabel(stage: OrgStage, roleName: string | null) {
  const prefix = roleName ? `${roleName} · ` : "";
  return prefix && stage.label.startsWith(prefix)
    ? stage.label.slice(prefix.length)
    : stage.label;
}

/**
 * A decision in its undo window already shows in the stage it goes to, as the
 * old pipeline board did, so the toast's 보기 finds the person. A decision
 * that only takes the person off the list hides them until it runs.
 */
function withDeferredStage(
  item: OrgBoardItem,
  deferredStages: ReadonlyMap<string, string | null>
): OrgBoardItem[] {
  if (!deferredStages.has(item.recommendationId)) return [item];
  const stage = deferredStages.get(item.recommendationId);
  return stage ? [{ ...item, stage: stage as OrgBoardItem["stage"] }] : [];
}

/** 파이프라인 (open stages, grouped) and 진행 종료, from the role's full board. */
function PipelineList({ closed, onAskHarper }: ListProps & { closed: boolean }) {
  const sourceT = useOrgSourceT();
  const { board, boardQuery } = useOrgJobsBoard();
  const { activeRole } = useOrgJobsNavigation();
  const { internalOpsAccess } = useOrgWorkspace();
  const deferredStages = useOrgDeferredActionStore((state) => state.deferredStages);
  const items = useMemo(
    () =>
      (board?.items ?? [])
        .flatMap((item) => withDeferredStage(item, deferredStages))
        .filter(
          (item) =>
            !item.savedAt &&
            (closed
              ? item.stage === "process_stopped"
              : isOrgRoleOpenPipelineStage(item.stage, internalOpsAccess))
        )
        .sort((left, right) => compareOrgCandidates(left, right, "latest")),
    [board?.items, closed, deferredStages, internalOpsAccess]
  );
  if (isOrgQueryBlockingError(boardQuery.error, boardQuery.data)) {
    return (
      <OrgErrorState
        message={boardQuery.error?.message ?? ""}
        onRetry={() => void boardQuery.refetch()}
      />
    );
  }
  if (boardQuery.isLoading) return <ReviewEmptyState loading />;
  if (!items.length) return <ReviewEmptyState />;
  const stages = [...(board?.stages ?? [])].sort(
    (left, right) => left.sortOrder - right.sortOrder
  );
  return (
    <CandidateList onAskHarper={onAskHarper}>
      <OrgRoleTalentBoard
        card="expandable"
        inboxItems={items}
        renderLayout={(cards, renderCard) =>
          stages
            .map((stage) => ({ stage, group: cards.filter((item) => item.stage === stage.id) }))
            .filter(({ group }) => group.length > 0)
            .map(({ stage, group }) => (
              <section
                aria-label={sourceT(stageLabel(stage, activeRole?.name ?? null))}
                className="org-candidate-group"
                key={stage.id}
              >
                <h2 className="career-content-heading">
                  {sourceT(stageLabel(stage, activeRole?.name ?? null))} {group.length}
                </h2>
                <div className="org-candidate-list">{group.map(renderCard)}</div>
              </section>
            ))
        }
        section="pipeline"
      />
    </CandidateList>
  );
}

/** 진행 종료 in 전체 화면: the closed candidates as a grid, newest or best first. */
function ClosedGrid({ toolbarTarget }: { toolbarTarget: HTMLElement | null }) {
  const router = useRouter();
  const { board, boardQuery } = useOrgJobsBoard();
  const { activeRole, workspaceId } = useOrgJobsNavigation();
  const deferredStages = useOrgDeferredActionStore((state) => state.deferredStages);
  const sort: OrgCandidateSort =
    router.query.sort === "recommended" ? "recommended" : "latest";
  const items = useMemo(
    () =>
      (board?.items ?? [])
        .flatMap((item) => withDeferredStage(item, deferredStages))
        .filter((item) => !item.savedAt && item.stage === "process_stopped")
        .sort((left, right) => compareOrgCandidates(left, right, sort)),
    [board?.items, deferredStages, sort]
  );
  const setSort = (next: OrgCandidateSort) =>
    void router.push(
      { pathname: router.pathname, query: { ...router.query, sort: next } },
      undefined,
      { scroll: false, shallow: true }
    );
  const toolbar = toolbarTarget
    ? createPortal(
        <>
          <OrgCandidateSortMenu onChange={setSort} value={sort} />
          <OrgSearchHistory workspaceId={workspaceId} roleId={activeRole?.roleId} />
        </>,
        toolbarTarget
      )
    : null;
  if (isOrgQueryBlockingError(boardQuery.error, boardQuery.data)) {
    return (
      <OrgErrorState
        message={boardQuery.error?.message ?? ""}
        onRetry={() => void boardQuery.refetch()}
      />
    );
  }
  return (
    <>
      {toolbar}
      {boardQuery.isLoading ? (
        <ReviewEmptyState loading />
      ) : items.length ? (
        <OrgRoleTalentBoard inboxItems={items} section="pipeline" />
      ) : (
        <ReviewEmptyState />
      )}
    </>
  );
}

/**
 * 후보: the role's lists as sub-tabs under the pill, each a column of cards
 * that open in place. 전체 화면 keeps the same tabs and swaps in the wide
 * views (grid, list, card, board, pipeline board) with selection and sorting;
 * their sort, view and search history sit at the end of the tabs' row.
 */
export function OrgRoleCandidatesPanel({
  counts,
  externalCount,
  externalEnabled,
  onAskHarper,
  onTabChange,
  onWideChange,
  pipelineDisplay,
  onPipelineDisplayChange,
  role,
  tab,
  wide,
  wideAvailable,
}: {
  counts: OrgInboxCounts | null;
  externalCount: number | null;
  externalEnabled: boolean;
  onAskHarper: (item: OrgBoardItem) => void;
  onPipelineDisplayChange: (display: RolePipelineDisplay) => void;
  onTabChange: (tab: OrgRoleCandidateTab) => void;
  onWideChange: (wide: boolean) => void;
  pipelineDisplay: RolePipelineDisplay;
  role: OrgRole;
  tab: OrgRoleCandidateTab;
  wide: boolean;
  wideAvailable: boolean;
}) {
  const { c } = useOrgLocale();
  const { workspace } = useOrgWorkspace();
  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null);
  const count = (value: number | null | undefined) =>
    typeof value === "number" ? String(value) : undefined;
  const items: TabBoxItem<OrgRoleCandidateTab>[] = [
    {
      value: "pending_connection",
      label: ct(c, COMPANY_TERMS.stage.pending_connection),
      countLabel: counts?.pending_connection ? (
        <Badge radius="full" size="xs" variant="count">
          {String(counts.pending_connection)}
        </Badge>
      ) : undefined,
    },
    {
      value: "company_intro",
      label: ct(c, COMPANY_TERMS.stage.company_intro),
      count: count(counts?.company_intro),
    },
    { value: "saved", label: ct(c, COMPANY_TERMS.inbox.saved), count: count(counts?.saved) },
    ...(externalEnabled || tab === "external"
      ? [
          {
            value: "external" as const,
            label: ct(c, COMPANY_TERMS.inbox.external),
            count: externalCount ? String(externalCount) : undefined,
          },
        ]
      : []),
    { value: "pipeline", label: ct(c, COMPANY_TERMS.tab.pipeline) },
    { value: "closed", label: ct(c, COMPANY_TERMS.stage.process_stopped) },
  ];
  const inbox = tab === "pending_connection" || tab === "company_intro" || tab === "saved";
  // Labeled, so it reads as "show the chat again" / "use the whole width".
  const wideToggle = wideAvailable ? (
    <MuteButton
      aria-label={
        wide ? c("분할 화면으로 보기", "Split view") : c("전체 화면으로 보기", "Full screen")
      }
      aria-pressed={wide}
      className="org-wide-toggle"
      onClick={() => onWideChange(!wide)}
      title={wide ? c("분할 화면으로 보기", "Split view") : c("전체 화면으로 보기", "Full screen")}
      variant="transparent"
    >
      {wide ? (
        <ChevronsRightLeft aria-hidden className="size-4" strokeWidth={1.7} />
      ) : (
        <ChevronsLeftRight aria-hidden className="size-4" strokeWidth={1.7} />
      )}
      {/* Same length both ways, in the same spot: it can be pressed again without moving. */}
      <span>{wide ? c("분할 화면", "Split view") : c("전체 화면", "Full screen")}</span>
    </MuteButton>
  ) : null;

  const tabBoxes = (
    <TabBoxes<OrgRoleCandidateTab>
      activeValue={tab}
      aria-label={ct(c, COMPANY_TERMS.candidate)}
      className="min-w-0 flex-1"
      items={items}
      listClassName="min-w-0 flex-wrap"
      onValueChange={onTabChange}
      size="lg"
      variant="neutral"
    />
  );

  if (wide) {
    // The split view's tabs, so every list can be opened without leaving 전체 화면.
    return (
      <div className="org-role-wide-views" data-org-candidates={tab}>
        <div className="org-role-wide-header">{wideToggle}</div>
        <div className="org-role-wide-tabs">
          {tabBoxes}
          <div className="org-role-wide-toolbar" ref={setToolbarTarget} />
        </div>
        <div
          className={
            inbox || tab === "external"
              ? "min-h-0 flex-1 overflow-hidden"
              : "min-h-0 flex-1 overflow-y-auto"
          }
        >
          {inbox || tab === "external" ? (
            <>
              <RoleStartRegisteredNotice roleId={role.roleId} workspaceId={workspace.workspaceId} />
              <OrgRoleCandidatesTab
                display="board"
                onDisplayChange={onPipelineDisplayChange}
                stageTabs={false}
                tab="inbox"
                toolbarTarget={toolbarTarget}
              />
            </>
          ) : tab === "closed" ? (
            <OrgJobsProvider routePage="role">
              <ClosedGrid toolbarTarget={toolbarTarget} />
              <TalentDetailSimpleView />
            </OrgJobsProvider>
          ) : (
            <OrgRoleCandidatesTab
              display={pipelineDisplay}
              onDisplayChange={onPipelineDisplayChange}
              tab="pipeline"
              toolbarTarget={toolbarTarget}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="org-candidates" data-org-candidates={tab}>
      <RoleStartRegisteredNotice roleId={role.roleId} workspaceId={workspace.workspaceId} />
      <div className="career-opportunity-tabs org-candidate-tabs flex min-w-0 items-start">
        {tabBoxes}
        {wideToggle}
      </div>
      {inbox ? <OrgReviewingLine className="org-candidate-caption" count={counts?.reviewing} /> : null}
      {tab === "pending_connection" || tab === "company_intro" ? (
        <p className="org-candidate-caption">
          {tab === "pending_connection"
            ? c(
                "이 역할을 듣고 만나보겠다고 한 후보예요. 연결하면 바로 메일로 이어드려요.",
                "They heard about this role and want to meet. Connect and we'll email you both."
              )
            : c(
                "아직 이 역할에 좋다고 하지 않은 후보예요. 연결 요청하면 Harper가 먼저 물어봐요.",
                "They haven't said yes to this role yet. Request an intro and Harper will ask them first."
              )}
        </p>
      ) : null}
      {tab === "external" ? (
        <OrgExternalCandidates
          roleId={role.roleId}
          view="rows"
          workspaceId={workspace.workspaceId}
        />
      ) : inbox ? (
        <OrgJobsProvider inbox routePage="role">
          <InboxList onAskHarper={onAskHarper} />
          <TalentDetailSimpleView />
        </OrgJobsProvider>
      ) : (
        <OrgJobsProvider routePage="role">
          <PipelineList closed={tab === "closed"} onAskHarper={onAskHarper} />
          <TalentDetailSimpleView />
        </OrgJobsProvider>
      )}
    </div>
  );
}
