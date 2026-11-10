import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The real frame, pill and header; the feed, roles, To-do and filter are markers.
test("Home: no chat or 후보, 소식 with its 할 일, 역할 across the width, one role filter, old Home links", async () => {
  const workspaceId = "synthetic-workspace";
  let split = true;
  const router = {
    asPath: "",
    isReady: true,
    pathname: "/org/home",
    query: {} as Record<string, string>,
    push: async () => true,
  };
  const go = (query: Record<string, string>) => {
    router.query = { orgId: workspaceId, ...query };
    router.asPath = `/org/home?${new URLSearchParams(router.query)}`;
  };
  let feedProps: { roleId: string | null } | undefined;
  let rolesProps: { roleId: string | null; embedded?: boolean } | undefined;
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  const empty = new Proxy({}, { get: () => () => null });
  const loaded: string[] = [];
  loader._load = function (name, ...args) {
    loaded.push(name);
    if (name === "next/router") return { useRouter: () => router };
    if (name === "@/hooks/useMediaQuery") return { useMediaQuery: () => split };
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
    if (name === "@/hooks/org/useOrgRoleTodo") return {
      useOrgWorkspaceTodo: () => ({
        data: {
          // Two things to decide or read (one per role), one Harper is doing: 할 일 shows 2.
          items: [
            { id: "a", roleId: "r1", column: "my_turn", kind: "pending_connection", at: null },
            { id: "b", roleId: "r2", column: "notice", kind: "intro_accepted", at: null },
            { id: "c", roleId: "r1", column: "in_progress", kind: "search_running", at: null },
          ],
          myTurn: 1,
          suggestions: 0,
          roles: [],
        },
      }),
    };
    if (name === "@/components/org/workspace/OrgMobileNavigation") return {
      useOrgMobileNavigation: () => ({ openNavigation: () => {} }),
    };
    if (name.endsWith("/OrgHomeRoleFilter")) return {
      OrgHomeRoleFilter: ({ roleId }: { roleId: string | null }) => <div data-role-filter={roleId ?? "all"} />,
    };
    if (name === "@/components/org/OrgAllRolesOverview") return {
      OrgAllRolesOverview: (props: NonNullable<typeof rolesProps>) => {
        rolesProps = props;
        return <div data-roles={props.roleId ?? "all"} />;
      },
    };
    if (name.endsWith("/OrgHomeTodo")) return {
      OrgHomeTodo: ({ roleId }: { roleId?: string | null }) => <div data-todo={roleId ?? "all"} />,
    };
    if (name === "@/components/org/OrgHomeFeed") return {
      OrgHomeFeed: (props: NonNullable<typeof feedProps> & { navigationHeader: ReactNode }) => {
        feedProps = props;
        return <div data-feed={props.roleId ?? "all"}>{props.navigationHeader}</div>;
      },
    };
    // The list, with the person in its place when one is open (OrgCandidateInPlace's own test).
    if (name === "@/components/org/OrgCandidateInPlace") return {
      OrgCandidateInPlace: ({ backLabel, children }: { backLabel: string; children?: ReactNode }) => (
        <div data-in-place={backLabel}>
          {router.query.talentId ? <div data-person={router.query.talentId} /> : children}
        </div>
      ),
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
  const tabs = (html: string) => [...html.matchAll(/role="tab"[^>]*>(?:<span[^>]*><\/span>)?(?:<div[^>]*>)?<span[^>]*>([^<]+)</g)].map((match) => match[1]);
  const section = (html: string, id: string) =>
    html.match(new RegExp(`<section[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
  const mainLabel = (html: string) => section(html, "org-home-main-panel").match(/aria-label="([^"]+)"/)?.[1];
  const shown = (html: string, id: string) => {
    const tag = section(html, id);
    return Boolean(tag) && !/ hidden=""/.test(tag);
  };
  const solo = (html: string) => /class="career-workspace-body" data-org-home-solo=""/.test(html);
  const todoButton = (html: string) => html.includes('aria-label="할 일,');

  // No tab: Home opens on 소식, its first pill, with its 할 일 on the right.
  go({});
  let html = render();
  assert.deepEqual(tabs(html), ["소식", "역할"], "소식 | 역할: no 후보, no 채팅");
  assert.deepEqual(pill(html), ["소식"]);
  assert.ok(html.includes('data-feed="all"') && html.includes('data-todo="all"'));
  assert.ok(!html.includes("org-home-chat-panel") && !html.includes("career-nav-count"));
  assert.ok(shown(html, "org-home-main-panel") && shown(html, "org-home-todo-panel") && !solo(html));
  assert.ok(!todoButton(html), "no 할 일 button beside its panel");
  assert.ok(!html.includes('aria-label="돌아가기"'));
  assert.ok(html.includes('data-role-filter="all"'), "the filter sits first in 소식");

  // One role filter: 소식 and its 할 일 show that role.
  go({ roleId: "r1" });
  html = render();
  assert.ok(html.includes('data-role-filter="r1"') && html.includes('data-feed="r1"'));
  assert.ok(html.includes('data-todo="r1"'), "the 할 일 beside 소식 shows the same role");
  go({ roleId: "deleted-role" });
  html = render();
  assert.ok(html.includes('data-role-filter="all"') && html.includes('data-todo="all"'), "an unknown role reads as every role");
  go({ tab: "feed", feedRole: "r2" });
  render();
  assert.equal(feedProps?.roleId, "r2", "an older 소식 link's role");

  // 역할: every role with its numbers across the whole width, no 할 일 panel.
  go({ tab: "roles" });
  html = render();
  assert.deepEqual(pill(html), ["역할"]);
  assert.deepEqual(rolesProps, { embedded: true, roleId: null });
  assert.ok(solo(html), "one column");
  assert.equal(section(html, "org-home-todo-panel"), "");
  assert.ok(!html.includes("data-todo") && !todoButton(html));
  go({ tab: "roles", roleId: "r2" });
  html = render();
  assert.equal(rolesProps?.roleId, "r2");
  assert.ok(html.includes('data-role-filter="r2"'));

  // The former 후보 (and /org/inbox): 역할, narrowed to the role the link named.
  for (const [query, roleId] of [
    [{ tab: "candidates" }, "all"],
    [{ queue: "r1:company_intro" }, "r1"],
    [{ inboxStage: "company_intro", roleId: "r2" }, "r2"],
  ] as Array<[Record<string, string>, string]>) {
    go(query);
    html = render();
    assert.deepEqual(pill(html), ["역할"], JSON.stringify(query));
    assert.ok(html.includes(`data-roles="${roleId}"`), JSON.stringify(query));
  }

  // 할 일, and a former 채팅 link: 할 일 is already on the right, 소식 stays on the left.
  for (const tab of ["todo", "chat"]) {
    go({ tab });
    html = render();
    assert.ok(shown(html, "org-home-main-panel") && shown(html, "org-home-todo-panel"), tab);
    assert.equal(mainLabel(html), "소식", tab);
    assert.deepEqual(pill(html), ["소식"], tab);
  }

  // Below 1024px one column: 소식's 할 일 opens from the header, with a way back.
  split = false;
  go({});
  html = render();
  assert.ok(shown(html, "org-home-main-panel") && !shown(html, "org-home-todo-panel"));
  assert.ok(html.includes('aria-label="할 일, 결정할 것·막힌 것·알림 2개"'), "할 일 opens from the header");
  const button = html.slice(html.indexOf('career-settings-label">할 일'));
  assert.match(button.slice(0, button.indexOf("</button>")), />2</, "the 할 일 button carries its number");
  go({ roleId: "r2" });
  assert.ok(render().includes('aria-label="할 일, 결정할 것·막힌 것·알림 1개"'), "its number for the role 소식 shows");
  for (const tab of ["todo", "chat"]) {
    go({ tab });
    html = render();
    assert.ok(!shown(html, "org-home-main-panel") && shown(html, "org-home-todo-panel"), tab);
    assert.ok(html.includes('aria-label="돌아가기"'), tab);
    assert.match(html, /aria-current="page" aria-label="할 일,/, tab);
  }
  go({ tab: "roles" });
  assert.ok(!todoButton(render()), "역할 has no 할 일");
  split = true;

  // A person (a 소식 item, a Slack or email link) opens in place in the left
  // column, wherever it lands; 소식 stays mounted, hidden.
  const feedTag = (markup: string) => markup.match(/<div[^>]*class="org-home-feed"[^>]*>/)?.[0] ?? "";
  const detailLinks: Array<[Record<string, string>, string]> = [
    [{ talentId: "t1", recommendationId: "rec1", detailRoleId: "r1" }, "소식"],
    [{ tab: "chat", talentId: "t1", recommendationId: "rec1", detailRoleId: "r1" }, "소식"],
    [{ tab: "feed", talentId: "t1" }, "소식"],
    [{ tab: "roles", talentId: "t1" }, "역할"],
  ];
  for (const single of [false, true]) {
    split = !single;
    for (const [query, list] of detailLinks) {
      go(query);
      html = render();
      const label = `${JSON.stringify(query)} ${single ? "one column" : "two columns"}`;
      assert.ok(shown(html, "org-home-main-panel"), label);
      assert.equal(mainLabel(html), list, label);
      const start = html.indexOf('id="org-home-main-panel"');
      const end = html.indexOf('id="org-home-todo-panel"');
      const main = html.slice(start, end < 0 ? undefined : end);
      assert.ok(main.includes('data-person="t1"'), label);
      assert.ok(main.includes('data-in-place="목록으로 돌아가기"'), label);
      if (list === "소식") assert.match(feedTag(html), / hidden=""/, label);
      else assert.equal(feedTag(html), "", label);
    }
  }
  split = true;
  // Without a person, 소식 shows.
  go({});
  assert.doesNotMatch(feedTag(render()), / hidden=""/);
});
