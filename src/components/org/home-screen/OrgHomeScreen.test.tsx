import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The real frame, pill and header; the lists, roles, To-do and feed are markers.
test("Home: no chat, 소식 | 후보 | 역할 pill, one role filter, 할 일 from the header, old Home links", async () => {
  const workspaceId = "synthetic-workspace";
  const router = {
    asPath: "",
    isReady: true,
    pathname: "/org/home",
    query: {} as Record<string, string>,
    push: async (href: unknown) => {
      pushes.push(href);
      return true;
    },
  };
  const pushes: unknown[] = [];
  const go = (query: Record<string, string>) => {
    router.query = { orgId: workspaceId, ...query };
    router.asPath = `/org/home?${new URLSearchParams(router.query)}`;
  };
  let listProps:
    | { stage: string; focusRoleId: string | null; onAskHarper?: (item: unknown) => void }
    | undefined;
  let feedProps: { roleId: string | null } | undefined;
  let rolesProps: { roleId: string | null; embedded?: boolean } | undefined;
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  const empty = new Proxy({}, { get: () => () => null });
  const loaded: string[] = [];
  loader._load = function (name, ...args) {
    loaded.push(name);
    if (name === "next/router") return { useRouter: () => router };
    if (name === "lucide-react") return empty;
    if (name === "@/i18n/org/OrgLocaleProvider") return {
      useOrgLocale: () => ({
        c: (ko: string, _en?: string, values?: Record<string, unknown>) =>
          ko.replace(/\{(\w+)\}/g, (_, key) => String(values?.[key] ?? "")),
        locale: "ko",
      }),
      useOrgSourceT: () => (text: string) => text,
    };
    if (name === "@/hooks/org/useOrgWorkspace") return {
      useOrgWorkspace: () => ({
        permissions: { canManageCandidates: true },
        roles: [{ roleId: "r1" }, { roleId: "r2" }],
        workspace: { workspaceId },
      }),
    };
    // Two roles: 3 + 1 waiting, 0 + 2 to reach out (the inbox's numbers per role).
    if (name === "@/hooks/org/useOrgRoleTodo") return {
      useOrgWorkspaceTodo: () => ({
        data: {
          // Two things to decide or read, one Harper is doing: 할 일 shows 2.
          items: [
            { id: "a", roleId: "r1", column: "my_turn", kind: "pending_connection", at: null },
            { id: "b", roleId: "r2", column: "notice", kind: "intro_accepted", at: null },
            { id: "c", roleId: "r1", column: "in_progress", kind: "search_running", at: null },
          ],
          myTurn: 1,
          suggestions: 0,
          roles: [
            { roleId: "r1", counts: { pending_connection: 3, company_intro: 0, saved: 1, reviewing: 2 } },
            { roleId: "r2", counts: { pending_connection: 1, company_intro: 2, saved: 0, reviewing: 0 } },
          ],
        },
      }),
    };
    if (name === "@/components/org/workspace/OrgMobileNavigation") return {
      useOrgMobileNavigation: () => ({ openNavigation: () => {} }),
    };
    if (name.endsWith("/OrgHomeCandidates")) return {
      OrgHomeCandidateTabs: ({ tab }: { tab: string }) => <div data-tabs={tab} />,
      OrgHomeCandidateCaption: () => <div data-caption />,
      OrgHomeCandidateList: (props: NonNullable<typeof listProps>) => {
        listProps = props;
        return <div data-list={props.stage} />;
      },
      OrgHomeRoleFilter: ({ roleId }: { roleId: string | null }) => <div data-role-filter={roleId ?? "all"} />,
    };
    if (name === "@/components/org/OrgAllRolesOverview") return {
      OrgAllRolesOverview: (props: NonNullable<typeof rolesProps>) => {
        rolesProps = props;
        return <div data-roles={props.roleId ?? "all"} />;
      },
    };
    if (name.endsWith("/OrgHomeTodo")) return { OrgHomeTodo: () => <div data-todo /> };
    if (name === "@/components/org/OrgHomeFeed") return {
      OrgHomeFeed: (props: NonNullable<typeof feedProps> & { navigationHeader: ReactNode }) => {
        feedProps = props;
        return <div data-feed={props.roleId ?? "all"}>{props.navigationHeader}</div>;
      },
    };
    if (name === "@/components/org/TalentDetailSimpleView") return {
      TalentDetailSimpleView: () => <div data-talent-detail />,
    };
    if (
      name.startsWith("@/components/") &&
      !["@/components/ui/button", "@/components/ui/tab-boxes", "@/components/ui/badge"].includes(name)
    )
      return empty;
    return original.call(this, name, ...args);
  };
  let OrgHomeScreen: typeof import("./OrgHomeScreen")["OrgHomeScreen"];
  try {
    ({ OrgHomeScreen } = await import("./OrgHomeScreen"));
  } finally {
    loader._load = original;
  }
  assert.ok(!loaded.includes("@/components/org/agent/OrgAgentPanel"), "Home loads no chat");
  const render = () => renderToStaticMarkup(<OrgHomeScreen />);
  // The selected tab starts with the moving dark pill (empty, aria-hidden), as on the candidate side.
  const pill = (html: string) =>
    [...html.matchAll(/role="tab" aria-selected="(true|false)"[^>]*>(?:<span[^>]*data-tab-selection[^>]*><\/span>)?(?:<div[^>]*>)?<span[^>]*>([^<]+)</g)]
      .filter((match) => match[1] === "true")
      .map((match) => match[2]);
  const section = (html: string, id: string) =>
    html.match(new RegExp(`<section[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
  const rightLabel = (html: string) => section(html, "org-home-right-panel").match(/aria-label="([^"]+)"/)?.[1];

  // No tab: Home opens on 소식, its first pill.
  go({});
  let html = render();
  assert.deepEqual(pill(html), ["소식"]);
  assert.ok(html.includes('data-feed="all"'));
  assert.ok(html.includes(">후보<") && html.includes(">역할<"), "소식 | 후보 | 역할");
  assert.ok(!html.includes("org-home-chat-panel") && !html.includes(">채팅<"), "no chat on Home");
  assert.ok(html.includes("data-org-home-solo"), "one column");

  // 후보: 연결을 기다리는 후보 first.
  go({ tab: "candidates" });
  html = render();
  assert.deepEqual(pill(html), ["후보"]);
  assert.equal(rightLabel(html), "후보");
  assert.ok(html.includes("data-list=\"pending_connection\""));
  // No chat here: "Harper에게 묻기" opens the person's role chat with them in the input.
  listProps?.onAskHarper?.({ recommendationId: "rec1", roleId: "r1", talentId: "t1" });
  assert.deepEqual(pushes, [
    "/org/role?orgId=synthetic-workspace&roleId=r1&tab=chat&askRecommendationId=rec1&askTalentId=t1",
  ]);
  assert.ok(html.includes('data-role-filter="all"'));
  assert.ok(html.includes('class="career-nav-count">6<'), "후보 N = waiting 3 + 1, to reach out 0 + 2");
  assert.ok(!html.includes("data-talent-detail"));
  assert.ok(html.includes('aria-label="할 일, 결정할 것·막힌 것·알림 2개"'), "할 일 opens from the header");
  const todoButton = html.slice(html.indexOf('career-settings-label">할 일'));
  assert.match(todoButton.slice(0, todoButton.indexOf("</button>")), />2</, "the 할 일 button carries its number");

  // One role filter for 소식, 후보 and 역할.
  go({ roleId: "r1" });
  html = render();
  assert.ok(html.includes('data-role-filter="r1"'));
  assert.ok(html.includes('class="career-nav-count">3<'), "후보 N for r1 only");
  go({ roleId: "deleted-role" });
  assert.ok(render().includes('data-role-filter="all"'), "an unknown role reads as every role");

  // 소식, for every role or one (an older ?tab=feed link too).
  go({ tab: "feed" });
  html = render();
  assert.deepEqual(pill(html), ["소식"]);
  assert.ok(html.includes('data-feed="all"'));
  assert.ok(html.includes('data-role-filter="all"'), "the filter sits first in 소식 too");
  assert.ok(!html.includes("data-tabs"), "no 후보 sub-tabs in 소식");
  go({ tab: "feed", feedRole: "r2" });
  render();
  assert.equal(feedProps?.roleId, "r2", "an older 소식 link's role");
  go({ tab: "feed", roleId: "r1" });
  render();
  assert.equal(feedProps?.roleId, "r1");

  // 역할: every role with its numbers, narrowed by the same filter.
  go({ tab: "roles" });
  html = render();
  assert.deepEqual(pill(html), ["역할"]);
  assert.deepEqual(rolesProps, { embedded: true, roleId: null });
  go({ tab: "roles", roleId: "r2" });
  render();
  assert.equal(rolesProps?.roleId, "r2");

  // 할 일, and a former 채팅 link: the same column, with a way back.
  for (const tab of ["todo", "chat"]) {
    go({ tab });
    html = render();
    assert.ok(html.includes("data-todo"), tab);
    assert.equal(rightLabel(html), "할 일", tab);
    assert.ok(html.includes('aria-label="돌아가기"'), tab);
    assert.match(html, /aria-current="page" aria-label="할 일,/, tab);
  }

  // A role's group on today's Home, and /org/inbox links (their role is the filter).
  go({ queue: "r1:company_intro" });
  html = render();
  assert.ok(html.includes('data-list="company_intro"'));
  assert.equal(listProps?.focusRoleId, "r1");
  go({ inboxStage: "company_intro", roleId: "r2" });
  html = render();
  assert.deepEqual(listProps, { ...listProps, stage: "company_intro", focusRoleId: null });
  assert.ok(html.includes('data-role-filter="r2"'));

  // A candidate link from Slack or email opens over the screen, wherever it lands.
  const detailLinks: Array<Record<string, string>> = [
    { talentId: "t1", recommendationId: "rec1", detailRoleId: "r1" },
    { tab: "chat", talentId: "t1", recommendationId: "rec1", detailRoleId: "r1" },
    { tab: "feed", talentId: "t1" },
    { tab: "roles", talentId: "t1" },
  ];
  for (const query of detailLinks) {
    go(query);
    assert.ok(render().includes("data-talent-detail"), JSON.stringify(query));
  }
});
