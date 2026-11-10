import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OrgRole } from "@/lib/org/server";

// The real frame, pill and header; the chat, lists and editors are markers.
test("the role screen: 채팅 | 후보 pill, right column per link, 역할 정보 and 설정 in the header", async () => {
  const workspaceId = "synthetic-workspace";
  const roleId = "synthetic-role";
  const router = {
    asPath: "",
    isReady: true,
    pathname: "/org/role",
    query: {} as Record<string, string>,
    push: async () => true,
  };
  const go = (query: Record<string, string>, hash = "") => {
    router.query = { orgId: workspaceId, roleId, ...query };
    router.asPath = `/org/role?${new URLSearchParams(router.query)}${hash}`;
  };
  const role: OrgRole = {
    roleId, workspaceId, status: "active", name: "ML Engineer", description: null,
    locationText: null, workMode: null, employmentTypes: [], criteria: [],
    createdAt: "", updatedAt: "", externalJdUrl: null, request: null,
  };
  let split = true;
  let externalEnabled = true;
  let chatProps: { todoTarget: unknown; purpose: string; roleId: string; composerSeed?: unknown } | undefined;
  let candidateProps: { tab: string; wideAvailable: boolean } | undefined;
  let infoProps: { section: string | null; visible: boolean } | undefined;
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
      useOrgWorkspace: () => ({ permissions: { canManageCandidates: true }, roles: [role], workspace: { workspaceId } }),
    };
    if (name === "@/hooks/useMediaQuery") return { useMediaQuery: () => split };
    // Home's "Harper에게 묻기": the person's detail is already read, so the name is there.
    if (name === "@/hooks/org/useOrg") return {
      useOrgTalentDetail: ({ enabled, talentId }: { enabled?: boolean; talentId?: string }) => ({
        data: enabled && talentId === "t-ask" ? { talent: { name: "김하늘", email: null } } : undefined,
      }),
    };
    if (name === "@/hooks/org/useOrgRoleInbox") return {
      useOrgInboxCounts: () => ({ data: { counts: { pending_connection: 3, company_intro: 2, saved: 1 } } }),
    };
    if (name === "@/hooks/org/useOrgExternalCandidates") return {
      useOrgExternalCandidates: () => ({ data: { enabled: externalEnabled, candidates: [] } }),
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
    if (name === "@/components/org/role-overview/OrgRoleInfoContent") return {
      OrgRoleInfoContent: (props: NonNullable<typeof infoProps>) => {
        infoProps = props;
        return <div data-role-info={props.section ?? ""} />;
      },
    };
    if (name === "@/components/org/role-overview/OrgRoleSettingsContent") return {
      OrgRoleSettingsContent: () => <div data-role-settings />,
    };
    if (name.endsWith("/OrgRoleCandidatesPanel")) return {
      OrgRoleCandidatesPanel: (props: NonNullable<typeof candidateProps>) => {
        candidateProps = props;
        return <div data-candidates={props.tab} />;
      },
    };
    if (name.endsWith("/OrgRoleStatusCard")) return { OrgRoleStatusCard: () => <div data-status-card /> };
    if (name === "@/components/ui/document-editor") return {
      DocumentEditorPanelProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    };
    if (
      name.startsWith("@/components/") &&
      !["@/components/ui/button", "@/components/ui/tab-boxes", "@/components/ui/badge"].includes(name)
    )
      return empty;
    if (name === "@/hooks/org/useOrgJobs") return empty;
    return original.call(this, name, ...args);
  };
  let OrgRoleScreen: typeof import("./OrgRoleScreen")["OrgRoleScreen"];
  try {
    ({ OrgRoleScreen } = await import("./OrgRoleScreen"));
  } finally {
    loader._load = original;
  }
  const render = () => renderToStaticMarkup(<OrgRoleScreen role={role} />);
  const pill = (html: string) =>
    // The selected tab starts with the moving dark pill (empty, aria-hidden), as on the candidate side.
    [...html.matchAll(/role="tab" aria-selected="(true|false)"[^>]*>(?:<span[^>]*data-tab-selection[^>]*><\/span>)?(?:<div[^>]*>)?<span[^>]*>([^<]+)</g)]
      .filter((match) => match[1] === "true")
      .map((match) => match[2]);
  const rightLabel = (html: string) => html.match(/aria-label="([^"]+)" class="career-right-column"/)?.[1];

  // No tab: 후보 with 연결을 기다리는 후보, as the role page opens today.
  go({});
  let html = render();
  assert.deepEqual(pill(html), ["후보"]);
  assert.equal(rightLabel(html), "후보");
  assert.equal(candidateProps?.tab, "pending_connection");
  assert.ok(html.includes('class="career-nav-count">5<'), "후보 N = 기다리는 3 + 요청할 2; 저장 is left out");
  assert.ok(html.includes(">역할 정보<") && html.includes(">설정<"));
  assert.equal(chatProps?.purpose, "role");
  assert.ok(html.includes('data-layout="split"'));

  // 채팅: the right column is the To-do (the chat puts its cards there).
  go({ tab: "chat" });
  html = render();
  assert.deepEqual(pill(html), ["채팅"]);
  assert.equal(rightLabel(html), "할 일");
  assert.ok(!html.includes("data-candidates"));

  // Old 확인할 기준 links and #criteria open 역할 정보 at the criteria.
  go({ tab: "matching" });
  html = render();
  assert.equal(rightLabel(html), "역할 정보");
  assert.deepEqual(infoProps, { ...infoProps, section: "criteria", visible: true });
  go({ tab: "role" }, "#criteria");
  render();
  assert.equal(infoProps?.section, "criteria");
  go({ tab: "settings" });
  html = render();
  assert.equal(rightLabel(html), "설정");
  assert.match(html, /aria-current="page" aria-label="설정"/);

  // Inbox, external and stored start links land on a 후보 list.
  const lists: Array<[Record<string, string>, string]> = [
    [{ tab: "external" }, "external"],
    [{ tab: "inbox", review: "external" }, "external"],
    [{ tab: "inbox", review: "saved" }, "saved"],
    [{ tab: "inbox", inboxStage: "company_intro" }, "company_intro"],
    [{ tab: "start" }, "pending_connection"],
    [{ tab: "pipeline", view: "pipeline", talentId: "t", detailRoleId: roleId, source: "slack" }, "pipeline"],
    // The former 진행 종료 list opens 파이프라인 (its last stage).
    [{ tab: "pipeline", pipelineStage: "closed" }, "pipeline"],
  ];
  for (const [query, tab] of lists) {
    go(query);
    html = render();
    assert.equal(candidateProps?.tab, tab, JSON.stringify(query));
    assert.deepEqual(pill(html), ["후보"], JSON.stringify(query));
  }
  externalEnabled = false;
  go({ tab: "external" });
  render();
  assert.equal(candidateProps?.tab, "pending_connection", "no external sourcing: the plain inbox");
  externalEnabled = true;

  // One column: the pill shows either the chat or the right column; 전체 화면 stays reachable.
  split = false;
  go({ tab: "chat" });
  html = render();
  assert.ok(html.includes('data-layout="single"'));
  assert.match(html, /class="career-right-column" hidden=""/);
  assert.equal(chatProps?.todoTarget, null, "the To-do stays the chip above the input");
  go({});
  html = render();
  assert.match(html, /class="career-chat-column" hidden=""/);
  assert.equal(candidateProps?.wideAvailable, true);

  // "Harper에게 묻기" from Home (no chat there): this role's chat, the person already in the input.
  split = true;
  go({ tab: "chat", askRecommendationId: "rec-ask", askTalentId: "t-ask" });
  render();
  assert.deepEqual(chatProps?.composerSeed, {
    key: "ask:rec-ask",
    mention: { displayName: "김하늘", recommendationId: "rec-ask", roleId, talentId: "t-ask" },
  });
  go({ tab: "chat" });
  render();
  assert.equal(chatProps?.composerSeed, null, "without the ask, nothing goes into the input");
});
