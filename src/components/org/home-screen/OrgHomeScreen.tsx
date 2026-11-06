import { ArrowLeft, ListTodo, Menu } from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { OrgAgentChatSurface } from "@/components/org/agent/OrgAgentPanel";
import { OrgHomeFeed } from "@/components/org/OrgHomeFeed";
import { TalentDetailSimpleView } from "@/components/org/TalentDetailSimpleView";
import { useOrgMobileNavigation } from "@/components/org/workspace/OrgMobileNavigation";
import { OrgTeamPage } from "@/components/org/workspace/pages/OrgTeamPage";
import { MuteButton } from "@/components/ui/button";
import { TabBoxes, type TabBoxItem } from "@/components/ui/tab-boxes";
import { useOrgWorkspaceTodo } from "@/hooks/org/useOrgRoleTodo";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { OrgAgentMention } from "@/lib/org/agent/types";
import {
  orgHomeCandidateTabQuery,
  orgHomeLocation,
  orgHomePaneQuery,
  type OrgHomeCandidateTab,
} from "@/lib/org/homeScreen";
import type { OrgBoardItem } from "@/lib/org/server";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import {
  OrgHomeCandidateCaption,
  OrgHomeCandidateList,
  OrgHomeCandidateTabs,
  OrgHomeFeedRoleFilter,
  type OrgHomeCandidateCounts,
} from "./OrgHomeCandidates";
import { OrgHomeTodo } from "./OrgHomeTodo";

/** Two columns from here, the role screen's breakpoint. */
const ORG_HOME_SPLIT_MEDIA_QUERY = "(min-width: 1024px)";

type Pill = "chat" | "candidates";

/** Candidate detail addresses: a list change closes the open candidate. */
const DETAIL_KEYS = ["talentId", "recommendationId", "detailRoleId", "detailWorkspaceId"];

function queryText(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Home in the candidate side's frame, like the role screen: the company's
 * Harper chat on the left, a 채팅 | 후보 pill that switches only the right
 * column, and a right column that scrolls on its own. 채팅 shows every role's
 * To-do as cards; 후보 the decision lists across roles and 소식. Below 1024px
 * one column: the pill switches the chat and 후보, and 할 일 opens from the header.
 */
export function OrgHomeScreen() {
  const { c } = useOrgLocale();
  const router = useRouter();
  const { openNavigation } = useOrgMobileNavigation();
  const { permissions, workspace } = useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const split = useMediaQuery(ORG_HOME_SPLIT_MEDIA_QUERY);
  const query = router.isReady ? router.query : {};
  const location = orgHomeLocation(query);
  const todo = useOrgWorkspaceTodo({ workspaceId });
  const counts = (todo.data?.roles ?? []).reduce<OrgHomeCandidateCounts>(
    (sum, role) => ({
      company_intro: sum.company_intro + role.counts.company_intro,
      pending_connection: sum.pending_connection + role.counts.pending_connection,
      reviewing: sum.reviewing + role.counts.reviewing,
    }),
    { company_intro: 0, pending_connection: 0, reviewing: 0 }
  );
  const candidateCount = counts.pending_connection + counts.company_intro;
  const [companyInfoOpen, setCompanyInfoOpen] = useState(false);
  const [composerSeed, setComposerSeed] = useState<{
    key: string;
    mention: OrgAgentMention;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // On two columns 할 일 is the 채팅 side's right column.
  const pane = split && location.pane === "todo" ? "chat" : location.pane;
  const pill: Pill = pane === "candidates" && !companyInfoOpen ? "candidates" : "chat";
  const detail = companyInfoOpen
    ? ct(c, COMPANY_TERMS.nav.company)
    : pane === "todo"
      ? ct(c, COMPANY_TERMS.todo.button)
      : null;
  const chatVisible = split ? true : pane === "chat" && !companyInfoOpen;
  const feed = pill === "candidates" && location.tab === "feed";

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
  // 후보 reopens the list last shown.
  const [lastTab, setLastTab] = useState<OrgHomeCandidateTab>(location.tab);
  if (pane === "candidates" && lastTab !== location.tab) setLastTab(location.tab);
  const showPane = (next: "chat" | "candidates" | "todo") => {
    setCompanyInfoOpen(false);
    go(orgHomePaneQuery(next, lastTab));
  };
  const showTab = (tab: OrgHomeCandidateTab) => {
    setCompanyInfoOpen(false);
    go(orgHomeCandidateTabQuery(tab, tab === "feed" ? location.feedRoleId : null));
  };
  const selectPill = (value: Pill) => showPane(value);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pane, location.tab, companyInfoOpen]);

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

  return (
    <div
      className="career-workspace org-role-screen org-home-screen"
      data-layout={split ? "split" : "single"}
      data-org-home-screen=""
    >
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
        <TabBoxes<Pill>
          animateSelection
          activeValue={pill}
          aria-label={ct(c, COMPANY_TERMS.nav.home)}
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
          {!split ? (
            <MuteButton
              aria-current={pane === "todo" && !companyInfoOpen ? "page" : undefined}
              aria-label={ct(c, COMPANY_TERMS.todo.button)}
              onClick={() => showPane("todo")}
            >
              <ListTodo aria-hidden className="size-4" strokeWidth={1.6} />
              <span className="career-settings-label">{ct(c, COMPANY_TERMS.todo.button)}</span>
            </MuteButton>
          ) : null}
        </div>
      </header>
      <div
        className="career-workspace-body"
        data-panel={detail ? "detail" : pill === "candidates" ? "history" : "followups"}
      >
        <section
          aria-label={c("Harper 대화", "Harper chat")}
          className="career-chat-column"
          hidden={!chatVisible}
          id="org-home-chat-panel"
        >
          <OrgAgentChatSurface
            autoFocus={split}
            composerSeed={composerSeed}
            onCompanyInfoClick={() => setCompanyInfoOpen(true)}
            purpose="general"
            readOnly={!permissions.canManageCandidates}
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
          id="org-home-right-panel"
        >
          {/* 소식 scrolls itself (it loads more at its end), under the same tabs. */}
          {feed ? (
            <div className="org-home-feed">
              <OrgHomeFeed
                navigationHeader={
                  <OrgHomeFeedRoleFilter
                    feedRoleId={location.feedRoleId}
                    onChange={(roleId) => go(orgHomeCandidateTabQuery("feed", roleId))}
                  />
                }
                roleId={location.feedRoleId}
                scrollHeader={
                  <OrgHomeCandidateTabs counts={counts} onTabChange={showTab} tab="feed" />
                }
                workspaceId={workspaceId}
              />
            </div>
          ) : (
            <div className="career-right-scroll" data-org-review-scroll="" ref={scrollRef}>
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
              {companyInfoOpen ? (
                <OrgTeamPage companyOnly readOnlyCompany />
              ) : pill === "candidates" && location.tab !== "feed" ? (
                <div className="org-candidates" data-org-candidates={location.tab}>
                  <OrgHomeCandidateTabs counts={counts} onTabChange={showTab} tab={location.tab} />
                  <OrgHomeCandidateCaption counts={counts} tab={location.tab} />
                  <OrgHomeCandidateList
                    focusRoleId={location.focusRoleId}
                    onAskHarper={askHarper}
                    stage={location.tab}
                  />
                </div>
              ) : (
                <OrgHomeTodo />
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
