import { ArrowLeft, BriefcaseBusiness, Menu, Settings } from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { OrgAgentChatSurface } from "@/components/org/agent/OrgAgentPanel";
import { OrgCriteriaRecheckWatcher } from "@/components/org/OrgCriteriaRecheck";
import { OrgRoleStatusDot } from "@/components/org/OrgRoleStatusDot";
import { OrgRoleInfoContent } from "@/components/org/role-overview/OrgRoleInfoContent";
import { OrgRoleSettingsContent } from "@/components/org/role-overview/OrgRoleSettingsContent";
import { TalentDetailSimpleView } from "@/components/org/TalentDetailSimpleView";
import { useOrgMobileNavigation } from "@/components/org/workspace/OrgMobileNavigation";
import { OrgTeamPage } from "@/components/org/workspace/pages/OrgTeamPage";
import { MuteButton } from "@/components/ui/button";
import { DocumentEditorPanelProvider } from "@/components/ui/document-editor";
import { TabBoxes, type TabBoxItem } from "@/components/ui/tab-boxes";
import { useOrgExternalCandidates } from "@/hooks/org/useOrgExternalCandidates";
import { OrgJobsProvider } from "@/hooks/org/useOrgJobs";
import { useOrgInboxCounts } from "@/hooks/org/useOrgRoleInbox";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import type { OrgAgentMention } from "@/lib/org/agent/types";
import { getOrgRoleStatusPresentation } from "@/lib/org/roleStatus";
import {
  orgRoleCandidateTab,
  orgRoleCandidateTabQuery,
  orgRolePane,
  type OrgRoleCandidateTab,
} from "@/lib/org/roleScreen";
import { resolveOrgRoleLocation } from "@/lib/org/routes";
import type { OrgBoardItem, OrgRole } from "@/lib/org/server";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import type { RolePipelineDisplay } from "./OrgRoleBoardViews";
import { OrgRoleCandidatesPanel } from "./OrgRoleCandidatesPanel";
import { OrgRoleStatusCard } from "./OrgRoleStatusCard";

/** Two columns from here; below it the pill switches one column, like the candidate side on a phone. */
export const ORG_ROLE_SPLIT_MEDIA_QUERY = "(min-width: 1024px)";

type Pill = "chat" | "candidates";

/** Candidate detail addresses: a list change closes the open candidate. */
const DETAIL_KEYS = [
  "talentId",
  "recommendationId",
  "detailRoleId",
  "detailWorkspaceId",
  "externalCandidateId",
];

function queryText(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

// Editors mount on first visit and keep their drafts while another view shows.
function VisitedPanel({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return active || visited ? children : null;
}

/**
 * A registered role in the candidate side's frame (CareerWorkspaceScreen):
 * the role's Harper chat on the left, a 채팅 | 후보 pill that switches only
 * the right column, and a right column that scrolls on its own. 역할 정보 and
 * 설정 open in the right column from the header. Every role link resolves
 * through resolveOrgRoleLocation, so links already sent keep working.
 */
export function OrgRoleScreen({ role }: { role: OrgRole }) {
  const { c } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const router = useRouter();
  const { openNavigation } = useOrgMobileNavigation();
  const { permissions, workspace } = useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const split = useMediaQuery(ORG_ROLE_SPLIT_MEDIA_QUERY);
  const externalQuery = useOrgExternalCandidates({ roleId: role.roleId, workspaceId });
  const externalEnabled = Boolean(externalQuery.data?.enabled);
  const countsQuery = useOrgInboxCounts({ roleId: role.roleId, workspaceId });
  const counts = countsQuery.data?.counts ?? null;
  const query = router.isReady ? router.query : {};
  const location = resolveOrgRoleLocation(query, {
    // Until the list loads, keep a 외부 후보 link on its sub-tab.
    externalEnabled: externalQuery.data ? externalEnabled : true,
    hash: router.isReady ? router.asPath.split("#")[1] ?? "" : "",
    isDraft: false,
  });
  const pane = orgRolePane(location);
  const candidateTab = orgRoleCandidateTab(location, query.pipelineStage);
  const pipelineDisplay: RolePipelineDisplay =
    queryText(query.view) === "board" ? "board" : "pipeline";
  const [companyInfoOpen, setCompanyInfoOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [todoTarget, setTodoTarget] = useState<HTMLElement | null>(null);
  const [composerSeed, setComposerSeed] = useState<{
    key: string;
    mention: OrgAgentMention;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wideActive = split && wide && pane === "candidates" && !companyInfoOpen;
  const pill: Pill = pane === "candidates" && !companyInfoOpen ? "candidates" : "chat";
  const detail = companyInfoOpen
    ? ct(c, COMPANY_TERMS.nav.company)
    : pane === "role"
      ? ct(c, COMPANY_TERMS.tab.roleInfo)
      : pane === "settings"
        ? ct(c, COMPANY_TERMS.tab.settings)
        : null;
  const chatVisible = split ? !wideActive : pane === "chat" && !companyInfoOpen;
  const status = getOrgRoleStatusPresentation(role.status);
  const candidateCount = counts ? counts.pending_connection + counts.company_intro : 0;

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
  const showPane = (next: "chat" | "role" | "settings") => {
    setCompanyInfoOpen(false);
    go({
      inboxStage: undefined,
      pipelineStage: undefined,
      review: undefined,
      section: undefined,
      tab: next,
      view: undefined,
    });
  };
  const showCandidates = (tab: OrgRoleCandidateTab) => {
    setCompanyInfoOpen(false);
    go(orgRoleCandidateTabQuery(tab));
  };
  // 후보 reopens the list last shown.
  const [lastCandidateTab, setLastCandidateTab] = useState(candidateTab);
  if (pane === "candidates" && lastCandidateTab !== candidateTab)
    setLastCandidateTab(candidateTab);
  const selectPill = (value: Pill) =>
    value === "chat" ? showPane("chat") : showCandidates(lastCandidateTab);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pane, candidateTab, companyInfoOpen]);

  // The way the candidate side passes a picked opportunity: the input starts with them.
  const askHarper = (item: OrgBoardItem) => {
    setComposerSeed({
      key: `${item.recommendationId}:${Date.now()}`,
      mention: {
        displayName: item.talent.name || item.talent.email || c("이름 없음", "No name"),
        recommendationId: item.recommendationId,
        roleId: item.roleId,
        talentId: item.talentId,
      },
    });
    // One column: the chat has to be on screen to type.
    if (!split) showPane("chat");
  };

  const pillItems: TabBoxItem<Pill>[] = [
    { value: "chat", label: ct(c, COMPANY_TERMS.tab.chat) },
    {
      value: "candidates",
      label: ct(c, COMPANY_TERMS.candidate),
      countLabel:
        candidateCount > 0 ? (
          <span className="career-nav-count">{candidateCount}</span>
        ) : undefined,
    },
  ];
  const headerButton = (
    value: "role" | "settings",
    icon: ReactNode,
    label: string
  ) => (
    <MuteButton
      aria-current={pane === value && !companyInfoOpen ? "page" : undefined}
      aria-label={label}
      onClick={() => showPane(value)}
    >
      {icon}
      <span className="career-settings-label">{label}</span>
    </MuteButton>
  );

  return (
    <div
      className="career-workspace org-role-screen"
      data-layout={split ? "split" : "single"}
      data-org-role-screen={role.roleId}
    >
      <OrgCriteriaRecheckWatcher roleId={role.roleId} workspaceId={workspaceId} />
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
          <OrgRoleStatusDot decorative status={role.status} />
          <h1 className="truncate">{role.name}</h1>
          <span className="org-role-status-label">{sourceT(status.label)}</span>
        </div>
        <TabBoxes<Pill>
          activeValue={pill}
          aria-label={ct(c, COMPANY_TERMS.role)}
          className="career-top-tabs career-glass"
          items={pillItems}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            const index = pillItems.findIndex((item) => item.value === pill);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? pillItems.length - 1
                  : (index + (event.key === "ArrowRight" ? 1 : -1) + pillItems.length) %
                    pillItems.length;
            event.preventDefault();
            selectPill(pillItems[next].value);
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
          }}
          onValueChange={selectPill}
          size="lg"
          variant="neutral"
        />
        <div className="career-topbar-actions">
          {headerButton(
            "role",
            <BriefcaseBusiness aria-hidden className="size-4" strokeWidth={1.6} />,
            ct(c, COMPANY_TERMS.tab.roleInfo)
          )}
          {headerButton(
            "settings",
            <Settings aria-hidden className="size-4" strokeWidth={1.6} />,
            ct(c, COMPANY_TERMS.tab.settings)
          )}
        </div>
      </header>
      <div
        className="career-workspace-body"
        data-panel={detail ? "detail" : pill === "candidates" ? "history" : "followups"}
        data-wide={wideActive ? "true" : undefined}
      >
        <section
          aria-label={c("역할 대화", "Role chat")}
          className="career-chat-column"
          hidden={!chatVisible}
          id="org-role-chat-panel"
        >
          <OrgAgentChatSurface
            autoFocus={split}
            composerSeed={composerSeed}
            onCompanyInfoClick={() => setCompanyInfoOpen(true)}
            purpose="role"
            readOnly={!permissions.canManageCandidates}
            roleId={role.roleId}
            todoTarget={split ? todoTarget : null}
          />
        </section>
        <section
          aria-label={
            detail ??
            (pill === "candidates"
              ? ct(c, COMPANY_TERMS.candidate)
              : ct(c, COMPANY_TERMS.todo.button))
          }
          className="career-right-column"
          hidden={chatVisible && !split}
          id="org-role-right-panel"
        >
          <DocumentEditorPanelProvider
            key={role.roleId}
            onOpenDocument={() => scrollRef.current?.scrollTo({ top: 0 })}
          >
            <div
              className="career-right-scroll"
              data-org-review-scroll=""
              hidden={wideActive}
              ref={scrollRef}
            >
              {detail ? (
                <header className="career-panel-heading">
                  <h1>{detail}</h1>
                  <MuteButton
                    aria-label={c("채팅으로 돌아가기", "Back to chat")}
                    onClick={() => showPane("chat")}
                    variant="transparent"
                  >
                    <ArrowLeft aria-hidden className="size-4" />
                  </MuteButton>
                </header>
              ) : null}
              {!detail ? <OrgRoleStatusCard role={role} /> : null}
              {split ? (
                <div hidden={pill !== "chat" || Boolean(detail)} ref={setTodoTarget} />
              ) : null}
              {pill === "candidates" && !wideActive ? (
                <OrgRoleCandidatesPanel
                  counts={counts}
                  externalCount={externalQuery.data?.candidates.length ?? null}
                  externalEnabled={externalEnabled}
                  onAskHarper={askHarper}
                  onPipelineDisplayChange={(view) => go({ tab: "pipeline", view })}
                  onTabChange={showCandidates}
                  onWideChange={setWide}
                  pipelineDisplay={pipelineDisplay}
                  role={role}
                  tab={candidateTab}
                  wide={false}
                  wideAvailable={split}
                />
              ) : null}
              <VisitedPanel active={pane === "role" && !companyInfoOpen}>
                <div hidden={pane !== "role" || companyInfoOpen}>
                  <OrgRoleInfoContent
                    role={role}
                    section={location.section}
                    visible={pane === "role" && !companyInfoOpen}
                    workspaceId={workspaceId}
                  />
                </div>
              </VisitedPanel>
              <VisitedPanel active={pane === "settings" && !companyInfoOpen}>
                <div hidden={pane !== "settings" || companyInfoOpen}>
                  <OrgRoleSettingsContent
                    layout="panel"
                    role={role}
                    roleCreation={false}
                    workspaceId={workspaceId}
                  />
                </div>
              </VisitedPanel>
              {companyInfoOpen ? <OrgTeamPage companyOnly readOnlyCompany /> : null}
            </div>
            {wideActive ? (
              <div className="org-role-wide">
                <OrgRoleCandidatesPanel
                  counts={counts}
                  externalCount={externalQuery.data?.candidates.length ?? null}
                  externalEnabled={externalEnabled}
                  onAskHarper={askHarper}
                  onPipelineDisplayChange={(view) => go({ tab: "pipeline", view })}
                  onTabChange={showCandidates}
                  onWideChange={setWide}
                  pipelineDisplay={pipelineDisplay}
                  role={role}
                  tab={candidateTab}
                  wide
                  wideAvailable
                />
              </div>
            ) : null}
          </DocumentEditorPanelProvider>
        </section>
      </div>
      {/* A candidate link outside 후보 (a chat or To-do link) opens over the screen. */}
      {queryText(query.talentId) && (pane !== "candidates" || companyInfoOpen) ? (
        <OrgJobsProvider routePage="role">
          <TalentDetailSimpleView />
        </OrgJobsProvider>
      ) : null}
    </div>
  );
}
