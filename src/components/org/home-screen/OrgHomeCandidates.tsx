import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ReviewEmptyState } from "@/components/org/OrgHomeInbox";
import { OrgReviewingLine } from "@/components/org/OrgReviewingLine";
import { OrgRoleTalentBoard } from "@/components/org/OrgRoleTalentBoard";
import { OrgCandidateListContext } from "@/components/org/role-screen/OrgRoleCandidateCard";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import { Badge } from "@/components/ui/badge";
import { CompactDropdown } from "@/components/ui/compact-dropdown";
import { TabBoxes, type TabBoxItem } from "@/components/ui/tab-boxes";
import { useOrgJobsBoard } from "@/hooks/org/useOrgJobs";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { OrgHomeCandidateTab } from "@/lib/org/homeScreen";
import { buildOrgHomeInboxGroups } from "@/lib/org/inboxPagination";
import { isOrgQueryBlockingError } from "@/lib/org/queryError";
import { buildOrgHref } from "@/lib/org/routes";
import type { OrgBoardItem } from "@/lib/org/server";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import { useOrgDeferredActionStore } from "@/store/useOrgDeferredActionStore";

/** Every role's numbers added up, by the inbox's one rule. */
export type OrgHomeCandidateCounts = {
  company_intro: number;
  pending_connection: number;
  reviewing: number;
};

/** 후보 on Home: the two decision lists across roles, and 소식. */
export function OrgHomeCandidateTabs({
  counts,
  onTabChange,
  tab,
}: {
  counts: OrgHomeCandidateCounts;
  onTabChange: (tab: OrgHomeCandidateTab) => void;
  tab: OrgHomeCandidateTab;
}) {
  const { c } = useOrgLocale();
  const items: TabBoxItem<OrgHomeCandidateTab>[] = [
    {
      value: "pending_connection",
      label: ct(c, COMPANY_TERMS.stage.pending_connection),
      countLabel: counts.pending_connection ? (
        <Badge radius="full" size="xs" variant="count">
          {String(counts.pending_connection)}
        </Badge>
      ) : undefined,
    },
    {
      value: "company_intro",
      label: ct(c, COMPANY_TERMS.stage.company_intro),
      count: counts.company_intro ? String(counts.company_intro) : undefined,
    },
    { value: "feed", label: ct(c, COMPANY_TERMS.tab.activity) },
  ];
  return (
    <div className="career-opportunity-tabs org-candidate-tabs flex min-w-0 items-start">
      <TabBoxes<OrgHomeCandidateTab>
        activeValue={tab}
        aria-label={ct(c, COMPANY_TERMS.candidate)}
        className="min-w-0 flex-1"
        items={items}
        listClassName="min-w-0 flex-wrap"
        onValueChange={onTabChange}
        size="lg"
        variant="neutral"
      />
    </div>
  );
}

/** What a list holds and what deciding does, once under the tabs. */
export function OrgHomeCandidateCaption({
  counts,
  tab,
}: {
  counts: OrgHomeCandidateCounts;
  tab: OrgHomeCandidateTab;
}) {
  const { c } = useOrgLocale();
  if (tab === "feed") return null;
  return (
    <>
      <OrgReviewingLine className="org-candidate-caption" count={counts.reviewing} />
      <p className="org-candidate-caption">
        {tab === "pending_connection"
          ? c(
              "역할을 듣고 만나보겠다고 한 후보예요. 연결하면 바로 메일로 이어드려요.",
              "They heard about the role and want to meet. Connect and we'll email you both."
            )
          : c(
              "아직 역할에 좋다고 하지 않은 후보예요. 연결 요청하면 Harper가 먼저 물어봐요.",
              "They haven't said yes to the role yet. Request an intro and Harper will ask them first."
            )}
      </p>
    </>
  );
}

const listLayout = (cards: OrgBoardItem[], renderCard: (item: OrgBoardItem) => ReactNode) => (
  <div className="org-candidate-list">{cards.map(renderCard)}</div>
);

/**
 * One decision list across roles, grouped by role (the role name opens that
 * role's list). Cards open in place, one at a time, with the role screen's
 * decisions.
 */
export function OrgHomeCandidateList({
  focusRoleId,
  onAskHarper,
  stage,
}: {
  focusRoleId: string | null;
  onAskHarper: (item: OrgBoardItem) => void;
  stage: "pending_connection" | "company_intro";
}) {
  const { roles, workspace } = useOrgWorkspace();
  const { board, boardQuery } = useOrgJobsBoard();
  const deferredStages = useOrgDeferredActionStore((state) => state.deferredStages);
  const groups = useMemo(
    () =>
      buildOrgHomeInboxGroups(
        roles,
        (board?.items ?? []).filter((item) => !deferredStages.has(item.recommendationId))
      ).filter((group) => group.stage === stage),
    [board?.items, deferredStages, roles, stage]
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const list = useMemo(
    () => ({
      expandedId,
      onAskHarper,
      onToggle: (id: string) => setExpandedId((current) => (current === id ? null : id)),
    }),
    [expandedId, onAskHarper]
  );
  const hasGroups = groups.length > 0;
  // A ?queue= or ?roleId= link lands on its role's group.
  useEffect(() => {
    if (!focusRoleId || !hasGroups) return;
    document
      .getElementById(`org-home-group-${focusRoleId}`)
      ?.scrollIntoView({ block: "start" });
  }, [focusRoleId, hasGroups]);

  if (isOrgQueryBlockingError(boardQuery.error, boardQuery.data)) {
    return (
      <OrgErrorState
        message={boardQuery.error?.message ?? ""}
        onRetry={() => void boardQuery.refetch()}
      />
    );
  }
  if (boardQuery.isLoading) return <ReviewEmptyState loading />;
  if (!hasGroups) return <ReviewEmptyState />;
  return (
    <OrgCandidateListContext.Provider value={list}>
      {groups.map((group) => (
        <section
          aria-label={group.role.name}
          className="org-candidate-group org-home-group"
          id={`org-home-group-${group.role.roleId}`}
          key={group.id}
        >
          <h2 className="career-content-heading org-home-group-heading">
            <Link
              href={buildOrgHref({
                orgId: workspace.workspaceId,
                page: "role",
                roleId: group.role.roleId,
                tab: "inbox",
                inboxStage: stage,
              })}
            >
              <span className="truncate">{group.role.name}</span>
              <ChevronRight aria-hidden className="size-3.5 shrink-0" />
            </Link>
            <span>{group.remaining}</span>
          </h2>
          <OrgRoleTalentBoard
            card="expandable"
            inboxItems={group.items}
            renderLayout={listLayout}
            section="inbox"
          />
        </section>
      ))}
    </OrgCandidateListContext.Provider>
  );
}

/** 소식 for every role, or one: today's feed, narrowed from here. */
export function OrgHomeFeedRoleFilter({
  feedRoleId,
  onChange,
}: {
  feedRoleId: string | null;
  onChange: (roleId: string | null) => void;
}) {
  const { c } = useOrgLocale();
  const { roles } = useOrgWorkspace();
  const all = "__all__";
  return (
    <CompactDropdown<string>
      ariaLabel={c("소식을 볼 역할", "Role for activity")}
      className="w-auto max-w-[240px]"
      onValueChange={(value) => onChange(value === all ? null : value)}
      options={[
        { value: all, label: c("모든 역할", "All roles") },
        ...roles.map((role) => ({ value: role.roleId, label: role.name })),
      ]}
      value={feedRoleId && roles.some((role) => role.roleId === feedRoleId) ? feedRoleId : all}
    />
  );
}
