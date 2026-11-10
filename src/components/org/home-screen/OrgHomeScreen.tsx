import { ArrowLeft, ListTodo, Menu } from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { OrgAllRolesOverview } from "@/components/org/OrgAllRolesOverview";
import { OrgCandidateInPlace } from "@/components/org/OrgCandidateInPlace";
import { OrgHomeFeed } from "@/components/org/OrgHomeFeed";
import { useOrgMobileNavigation } from "@/components/org/workspace/OrgMobileNavigation";
import { MuteButton } from "@/components/ui/button";
import { TabBoxes, type TabBoxItem } from "@/components/ui/tab-boxes";
import { Badge } from "@/components/ui/badge";
import { orgTodoBadge } from "@/lib/org/todo";
import { useOrgWorkspaceTodo } from "@/hooks/org/useOrgRoleTodo";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  orgHomeLocation,
  orgHomePaneQuery,
  type OrgHomePane,
  type OrgHomePill,
} from "@/lib/org/homeScreen";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import { OrgHomeRoleFilter } from "./OrgHomeRoleFilter";
import { OrgHomeTodo } from "./OrgHomeTodo";

/** Two columns from here, the role screen's breakpoint. */
const ORG_HOME_SPLIT_MEDIA_QUERY = "(min-width: 1024px)";

/** Candidate detail addresses: a list change closes the open candidate. */
const DETAIL_KEYS = ["talentId", "recommendationId", "detailRoleId", "detailWorkspaceId"];

function queryText(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Home in the candidate side's frame, without a chat or candidate lists (each
 * role keeps its own). The 소식 | 역할 pill: 소식 takes the left column the
 * chat had, with its 할 일 in the panel on the right; 역할 is every role with
 * its numbers across the whole width, no panel. One role filter narrows 소식,
 * its 할 일 and 역할. Below 1024px one column: 할 일 opens from the header. A
 * person (a 소식 item, a Slack or email link) opens in place in the left
 * column, as on the role screen.
 */
export function OrgHomeScreen() {
  const { c } = useOrgLocale();
  const router = useRouter();
  const { openNavigation } = useOrgMobileNavigation();
  const { roles, workspace } = useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const split = useMediaQuery(ORG_HOME_SPLIT_MEDIA_QUERY);
  const query = router.isReady ? router.query : {};
  const location = orgHomeLocation(query);
  const pane = location.pane;
  const detailOpen = Boolean(queryText(query.talentId));
  // An unknown or deleted role reads as every role.
  const roleId =
    location.roleId && roles.some((role) => role.roleId === location.roleId)
      ? location.roleId
      : null;
  const todo = useOrgWorkspaceTodo({ workspaceId });
  const todoBadge = orgTodoBadge(
    (todo.data?.items ?? []).filter((item) => !roleId || item.roleId === roleId)
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  // 할 일 belongs to 소식: the pill shows 소식 while it is open.
  const list: OrgHomePill = pane === "roles" ? "roles" : "feed";
  const todoOnly = !split && pane === "todo" && !detailOpen;
  const pillLabels: Record<OrgHomePill, string> = {
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
  const showPane = (next: OrgHomePane) => go(orgHomePaneQuery(next, roleId));
  // The same pane, for another role or every role.
  const filterRole = (next: string | null) => go(orgHomePaneQuery(pane, next));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [list, roleId]);

  // 소식 scrolls itself and is hidden, not unmounted, behind a person (its
  // search and loaded pages stay); hiding resets its scroll, so Back restores it.
  const feedRef = useRef<HTMLDivElement>(null);
  const feedTop = useRef(0);
  useEffect(() => {
    feedTop.current = 0;
  }, [list, roleId]);
  useEffect(() => {
    const wrapper = feedRef.current;
    if (!wrapper || detailOpen) return;
    const remember = (event: Event) => {
      if (event.target instanceof HTMLElement && event.target.parentElement === wrapper)
        feedTop.current = event.target.scrollTop;
    };
    wrapper.addEventListener("scroll", remember, { capture: true, passive: true });
    return () => wrapper.removeEventListener("scroll", remember, { capture: true });
  }, [detailOpen, list]);
  useLayoutEffect(() => {
    if (detailOpen || !feedTop.current) return;
    feedRef.current?.querySelector<HTMLElement>(":scope > section")?.scrollTo({ top: feedTop.current });
  }, [detailOpen]);

  const pillItems: TabBoxItem<OrgHomePill>[] = [
    { value: "feed", label: pillLabels.feed },
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
          activeValue={list}
          aria-label={ct(c, COMPANY_TERMS.nav.home)}
          className="career-top-tabs career-glass"
          items={pillItems}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            const index = pillItems.findIndex((item) => item.value === list);
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
          {/* Two columns show 소식's 할 일 on the right; one column opens it from here. */}
          {split || list !== "feed" ? null : (
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
          )}
        </div>
      </header>
      <div
        className="career-workspace-body"
        data-org-home-solo={list === "roles" ? "" : undefined}
        data-panel="followups"
      >
        <section
          aria-label={pillLabels[list]}
          className="career-right-column org-home-main"
          hidden={todoOnly}
          id="org-home-main-panel"
        >
          {/* 소식 scrolls itself (it loads more at its end). */}
          {list === "feed" ? (
            <div className="org-home-feed" hidden={detailOpen} ref={feedRef}>
              <OrgHomeFeed navigationHeader={roleFilter} roleId={roleId} workspaceId={workspaceId} />
            </div>
          ) : null}
          {list === "roles" || detailOpen ? (
            <div className="career-right-scroll" data-org-review-scroll="" ref={scrollRef}>
              <OrgCandidateInPlace backLabel={c("목록으로 돌아가기", "Back to list")}>
                {list === "roles" ? (
                  <>
                    {roleFilter}
                    <OrgAllRolesOverview embedded roleId={roleId} />
                  </>
                ) : null}
              </OrgCandidateInPlace>
            </div>
          ) : null}
        </section>
        {/* 소식's 할 일, for the role 소식 shows; 역할 has no panel. */}
        {list === "feed" ? (
          <section
            aria-label={ct(c, COMPANY_TERMS.todo.button)}
            className="career-right-column"
            hidden={!split && !todoOnly}
            id="org-home-todo-panel"
          >
            <div className="career-right-scroll">
              {todoOnly ? (
                <header className="career-panel-heading">
                  <h1>{ct(c, COMPANY_TERMS.todo.button)}</h1>
                  <MuteButton
                    aria-label={c("돌아가기", "Back")}
                    onClick={() => showPane("feed")}
                    variant="transparent"
                  >
                    <ArrowLeft aria-hidden className="size-4" />
                  </MuteButton>
                </header>
              ) : null}
              <OrgHomeTodo roleId={roleId} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
