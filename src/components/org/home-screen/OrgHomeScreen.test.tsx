import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The real frame, pill and header; the chat, lists, To-do and feed are markers.
test("Home: 채팅 | 후보 pill, right column per link, old Home links, one column", async () => {
  const workspaceId = "synthetic-workspace";
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
  let split = true;
  let chatProps: { purpose: string; roleId?: string } | undefined;
  let listProps: { stage: string; focusRoleId: string | null } | undefined;
  let feedProps: { roleId: string | null } | undefined;
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  const empty = new Proxy({}, { get: () => () => null });
  loader._load = function (name, ...args) {
    if (name === "next/router") return { useRouter: () => router };
    if (name === "lucide-react") return empty;
    if (name === "@/i18n/org/OrgLocaleProvider") return {
      useOrgLocale: () => ({ c: (ko: string) => ko, locale: "ko" }),
      useOrgSourceT: () => (text: string) => text,
    };
    if (name === "@/hooks/org/useOrgWorkspace") return {
      useOrgWorkspace: () => ({ permissions: { canManageCandidates: true }, roles: [], workspace: { workspaceId } }),
    };
    if (name === "@/hooks/useMediaQuery") return { useMediaQuery: () => split };
    // Two roles: 3 + 1 waiting, 0 + 2 to reach out (the inbox's numbers per role).
    if (name === "@/hooks/org/useOrgRoleTodo") return {
      useOrgWorkspaceTodo: () => ({
        data: {
          items: [],
          myTurn: 0,
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
    if (name === "@/components/org/agent/OrgAgentPanel") return {
      OrgAgentChatSurface: (props: NonNullable<typeof chatProps>) => {
        chatProps = props;
        return <div data-chat />;
      },
    };
    if (name.endsWith("/OrgHomeCandidates")) return {
      OrgHomeCandidateTabs: ({ tab }: { tab: string }) => <div data-tabs={tab} />,
      OrgHomeCandidateCaption: () => <div data-caption />,
      OrgHomeCandidateList: (props: NonNullable<typeof listProps>) => {
        listProps = props;
        return <div data-list={props.stage} />;
      },
      OrgHomeFeedRoleFilter: () => <div data-feed-filter />,
    };
    if (name.endsWith("/OrgHomeTodo")) return { OrgHomeTodo: () => <div data-todo /> };
    if (name === "@/components/org/OrgHomeFeed") return {
      OrgHomeFeed: (props: NonNullable<typeof feedProps> & { scrollHeader: ReactNode }) => {
        feedProps = props;
        return <div data-feed={props.roleId ?? "all"}>{props.scrollHeader}</div>;
      },
    };
    if (name === "@/components/org/TalentDetailSimpleView") return {
      TalentDetailSimpleView: () => <div data-talent-detail />,
    };
    if (name === "@/components/org/workspace/pages/OrgTeamPage") return { OrgTeamPage: () => <div data-company /> };
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
  const render = () => renderToStaticMarkup(<OrgHomeScreen />);
  // The selected tab starts with the moving dark pill (empty, aria-hidden), as on the candidate side.
  const pill = (html: string) =>
    [...html.matchAll(/role="tab" aria-selected="(true|false)"[^>]*>(?:<span[^>]*data-tab-selection[^>]*><\/span>)?(?:<div[^>]*>)?<span[^>]*>([^<]+)</g)]
      .filter((match) => match[1] === "true")
      .map((match) => match[2]);
  const section = (html: string, id: string) =>
    html.match(new RegExp(`<section[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
  const hidden = (html: string, id: string) => section(html, id).includes("hidden");
  const rightLabel = (html: string) => section(html, "org-home-right-panel").match(/aria-label="([^"]+)"/)?.[1];

  // No tab: today's Home opens on its inbox, 연결을 기다리는 후보.
  go({});
  let html = render();
  assert.deepEqual(pill(html), ["후보"]);
  assert.equal(rightLabel(html), "후보");
  assert.ok(html.includes("data-list=\"pending_connection\""));
  assert.ok(html.includes('class="career-nav-count">6<'), "후보 N = waiting 3 + 1, to reach out 0 + 2");
  assert.equal(chatProps?.purpose, "general", "the company's Harper chat, not a role's");
  assert.equal(chatProps?.roleId, undefined);
  assert.equal(hidden(html, "org-home-chat-panel"), false, "two columns: the chat stays");
  assert.ok(!html.includes("data-talent-detail"));
  assert.ok(!html.includes('aria-label="할 일"'), "two columns: no 할 일 button, it is the 채팅 side");

  // 채팅: every role's To-do as cards.
  go({ tab: "chat" });
  html = render();
  assert.deepEqual(pill(html), ["채팅"]);
  assert.ok(html.includes("data-todo"));
  go({ tab: "todo" });
  assert.ok(render().includes("data-todo"), "two columns: 할 일 is the 채팅 side");

  // 소식, for every role or one, under the same tabs.
  go({ tab: "feed" });
  html = render();
  assert.deepEqual(pill(html), ["후보"]);
  assert.ok(html.includes('data-feed="all"'));
  assert.ok(html.includes('data-tabs="feed"'));
  go({ tab: "feed", feedRole: "r2" });
  render();
  assert.equal(feedProps?.roleId, "r2");

  // A role's group on today's Home, and /org/inbox links.
  go({ queue: "r1:company_intro" });
  html = render();
  assert.ok(html.includes('data-list="company_intro"'));
  assert.equal(listProps?.focusRoleId, "r1");
  go({ inboxStage: "company_intro", roleId: "r2" });
  render();
  assert.deepEqual(listProps, { ...listProps, stage: "company_intro", focusRoleId: "r2" });

  // A candidate link from Slack or email opens over the screen, wherever it lands.
  const detailLinks: Array<Record<string, string>> = [
    { talentId: "t1", recommendationId: "rec1", detailRoleId: "r1" },
    { tab: "chat", talentId: "t1", recommendationId: "rec1", detailRoleId: "r1" },
    { tab: "feed", talentId: "t1" },
  ];
  for (const query of detailLinks) {
    go(query);
    assert.ok(render().includes("data-talent-detail"), JSON.stringify(query));
  }

  // One column: the pill switches the chat and 후보; 할 일 opens from the header.
  split = false;
  go({});
  html = render();
  assert.equal(hidden(html, "org-home-chat-panel"), true);
  assert.equal(hidden(html, "org-home-right-panel"), false);
  assert.ok(html.includes('aria-label="할 일"'));
  go({ tab: "chat" });
  html = render();
  assert.equal(hidden(html, "org-home-chat-panel"), false);
  assert.equal(hidden(html, "org-home-right-panel"), true);
  go({ tab: "todo" });
  html = render();
  assert.equal(hidden(html, "org-home-chat-panel"), true);
  assert.equal(rightLabel(html), "할 일");
  assert.ok(html.includes("data-todo"));
  assert.ok(html.includes('aria-label="채팅으로 돌아가기"'));
});
