import { ArrowLeft, ListTodo, Menu } from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { OrgAllRolesOverview } from "@/components/org/OrgAllRolesOverview";
import { OrgHomeFeed } from "@/components/org/OrgHomeFeed";
import { TalentDetailSimpleView } from "@/components/org/TalentDetailSimpleView";
import { useOrgMobileNavigation } from "@/components/org/workspace/OrgMobileNavigation";
import { MuteButton } from "@/components/ui/button";
import { TabBoxes, type TabBoxItem } from "@/components/ui/tab-boxes";
import { Badge } from "@/components/ui/badge";
import { orgTodoBadge } from "@/lib/org/todo";
import { useOrgWorkspaceTodo } from "@/hooks/org/useOrgRoleTodo";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  orgHomeCandidateTabQuery,
  orgHomeLocation,
  orgHomePaneQuery,
  type OrgHomeCandidateTab,
  type OrgHomePane,
  type OrgHomePill,
} from "@/lib/org/homeScreen";
import { orgRoleAskHarperHref } from "@/lib/org/roleScreen";
import type { OrgBoardItem } from "@/lib/org/server";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import {
  OrgHomeCandidateCaption,
  OrgHomeCandidateList,
  OrgHomeCandidateTabs,
  OrgHomeRoleFilter,
  type OrgHomeCandidateCounts,
} from "./OrgHomeCandidates";
import { OrgHomeTodo } from "./OrgHomeTodo";

/** Candidate detail addresses: a list change closes the open candidate. */
const DETAIL_KEYS = ["talentId", "recommendationId", "detailRoleId", "detailWorkspaceId"];

const isPill = (pane: OrgHomePane): pane is OrgHomePill =>
  pane === "feed" || pane === "candidates" || pane === "roles";

function queryText(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Home in the candidate side's frame, without a chat (each role keeps its
 * own; a card's "Harper에게 묻기" opens that role's chat): a 소식 | 후보 | 역할
 * pill and one column that scrolls on its own, centered at a reading width.
 * One role filter narrows all three. 할 일 opens in the same column from the
 * header.
 */
export function OrgHomeScreen() {
  const { c } = useOrgLocale();
  const router = useRouter();
  const { openNavigation } = useOrgMobileNavigation();
  const { roles, workspace } = useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const query = router.isReady ? router.query : {};
  const location = orgHomeLocation(query);
  const pane = location.pane;
  // An unknown or deleted role reads as every role.
  const roleId =
    location.roleId && roles.some((role) => role.roleId === location.roleId)
      ? location.roleId
      : null;
  const todo = useOrgWorkspaceTodo({ workspaceId });
  const counts = (todo.data?.roles ?? [])
    .filter((role) => !roleId || role.roleId === roleId)
    .reduce<OrgHomeCandidateCounts>(
      (sum, role) => ({
        company_intro: sum.company_intro + role.counts.company_intro,
        pending_connection: sum.pending_connection + role.counts.pending_connection,
        reviewing: sum.reviewing + role.counts.reviewing,
      }),
      { company_intro: 0, pending_connection: 0, reviewing: 0 }
    );
  const candidateCount = counts.pending_connection + counts.company_intro;
  const todoBadge = orgTodoBadge(todo.data?.items ?? []);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The pill keeps the list last shown while 할 일 is open.
  const [lastPill, setLastPill] = useState<OrgHomePill>(isPill(pane) ? pane : "feed");
  if (isPill(pane) && lastPill !== pane) setLastPill(pane);
  const [lastTab, setLastTab] = useState<OrgHomeCandidateTab>(location.tab);
  if (pane === "candidates" && lastTab !== location.tab) setLastTab(location.tab);
  const pillLabels: Record<OrgHomePill, string> = {
    candidates: ct(c, COMPANY_TERMS.candidate),
    feed: ct(c, COMPANY_TERMS.tab.activity),
    roles: ct(c, COMPANY_TERMS.nav.roles),
  };

  const go = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = { ...router.query };
      for (const key of DETAIL_KEYS) delete next[key];
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete next[key];
        else next[key] = value;
      }
      void router.push({ pathname: router.pathname, query: next }, undefined, {
        scroll: false,
        shallow: true,
      });
    },
    [router]
  );
  const showPane = (next: OrgHomePane) => go(orgHomePaneQuery(next, lastTab, roleId));
  const showTab = (tab: OrgHomeCandidateTab) => go(orgHomeCandidateTabQuery(tab, roleId));
  // The same pane and list, for another role or every role.
  const filterRole = (next: string | null) =>
    go(
      pane === "candidates"
        ? orgHomeCandidateTabQuery(location.tab, next)
        : orgHomePaneQuery(pane, location.tab, next)
    );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pane, location.tab, roleId]);

  // Home has no chat: "Harper에게 묻기" opens the person's role chat with them in the input.
  const askHarper = (item: OrgBoardItem) =>
    void router.push(
      orgRoleAskHarperHref({
        orgId: workspaceId,
        recommendationId: item.recommendationId,
        roleId: item.roleId,
        talentId: item.talentId,
      })
    );

  const pillItems: TabBoxItem<OrgHomePill>[] = [
    { value: "feed", label: pillLabels.feed },
    {
      value: "candidates",
      label: pillLabels.candidates,
      countLabel:
        candidateCount > 0 ? (
          <span className="career-nav-count">{candidateCount}</span>
        ) : undefined,
    },
    { value: "roles", label: pillLabels.roles },
  ];
  const roleFilter = <OrgHomeRoleFilter onChange={filterRole} roleId={roleId} />;

  return (
    <div className="career-workspace org-role-screen org-home-screen" data-org-home-screen="">
      <header className="career-topbar org-role-topbar">
        <div className="org-role-title">
          <MuteButton
            aria-label={c("메뉴 열기", "Open menu")}
            className="md:hidden"
            onClick={openNavigation}
            variant="transparent"
          >
            <Menu aria-hidden className="size-4.5" strokeWidth={1.7} />
          </MuteButton>
          <h1 className="truncate">{ct(c, COMPANY_TERMS.nav.home)}</h1>
        </div>
        <TabBoxes<OrgHomePill>
          animateSelection
          activeValue={lastPill}
          aria-label={ct(c, COMPANY_TERMS.nav.home)}
          className="career-top-tabs career-glass"
          items={pillItems}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            const index = pillItems.findIndex((item) => item.value === lastPill);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? pillItems.length - 1
                  : (index + (event.key === "ArrowRight" ? 1 : -1) + pillItems.length) %
                    pillItems.length;
            event.preventDefault();
            showPane(pillItems[next].value);
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
          }}
          onValueChange={showPane}
          size="lg"
          variant="neutral"
        />
        <div className="career-topbar-actions">
          <MuteButton
            aria-current={pane === "todo" ? "page" : undefined}
            aria-label={c(
              "할 일, 결정할 것·막힌 것·알림 {n}개",
              "To-do, {n} to decide, blocked or new",
              { n: todoBadge }
            )}
            onClick={() => showPane("todo")}
          >
            <ListTodo aria-hidden className="size-4" strokeWidth={1.6} />
            <span className="career-settings-label">{ct(c, COMPANY_TERMS.todo.button)}</span>
            {todoBadge ? (
              // The same number as the role chat's 할 일 button.
              <Badge size="xs" variant="count">
                {String(todoBadge)}
              </Badge>
            ) : null}
          </MuteButton>
        </div>
      </header>
      <div
        className="career-workspace-body"
        data-org-home-solo=""
        data-panel={pane === "todo" ? "followups" : "history"}
      >
        <section
          aria-label={pane === "todo" ? ct(c, COMPANY_TERMS.todo.button) : pillLabels[lastPill]}
          className="career-right-column"
          id="org-home-right-panel"
        >
          {/* 소식 scrolls itself (it loads more at its end). */}
          {pane === "feed" ? (
            <div className="org-home-feed">
              <OrgHomeFeed navigationHeader={roleFilter} roleId={roleId} workspaceId={workspaceId} />
            </div>
          ) : (
            <div className="career-right-scroll" data-org-review-scroll="" ref={scrollRef}>
              {pane === "todo" ? (
                <>
                  <header className="career-panel-heading">
                    <h1>{ct(c, COMPANY_TERMS.todo.button)}</h1>
                    <MuteButton
                      aria-label={c("돌아가기", "Back")}
                      onClick={() => showPane(lastPill)}
                      variant="transparent"
                    >
                      <ArrowLeft aria-hidden className="size-4" />
                    </MuteButton>
                  </header>
                  <OrgHomeTodo />
                </>
              ) : pane === "roles" ? (
                <>
                  {roleFilter}
                  <OrgAllRolesOverview embedded roleId={roleId} />
                </>
              ) : (
                <div className="org-candidates" data-org-candidates={location.tab}>
                  {roleFilter}
                  <OrgHomeCandidateTabs counts={counts} onTabChange={showTab} tab={location.tab} />
                  <OrgHomeCandidateCaption counts={counts} tab={location.tab} />
                  <OrgHomeCandidateList
                    focusRoleId={location.focusRoleId}
                    onAskHarper={askHarper}
                    stage={location.tab}
                  />
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      {/* A candidate link (Slack, email, a card's full profile) opens over the screen. */}
      {queryText(query.talentId) ? <TalentDetailSimpleView /> : null}
    </div>
  );
}
