import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { OrgRole } from "@/lib/org/server";

// Render the real page; child surfaces and network hooks are isolated.
test("new-role keeps the composer and draft onboarding belongs to the role page", async () => {
  const workspaceId = "synthetic-workspace";
  const roleId = "synthetic-role";
  let chatProps: { purpose: string; roleId: string | null; initialMessage?: string; onRoleCreated: (id: string) => void } | undefined;
  const context = {
    page: "new-role", permissions: { canManageCandidates: true }, roles: [] as OrgRole[],
    workspace: { workspaceId },
  };
  const router = {
    isReady: true, query: { orgId: workspaceId } as Record<string, string>,
    pathname: "/org/new",
    replace: async (href: string) => {
      const url = new URL(href, "http://localhost");
      router.pathname = url.pathname;
      router.query = Object.fromEntries(url.searchParams);
    },
  };
  let startData: { role: { status: string } } | undefined;
  const enabledReads: boolean[] = [];
  const noOp = () => {};
  const uiState = { chatPanelWidthPct: 42, setChatPanelWidthPct: noOp };
  const liveState = { chats: {} as Record<string, { isCreatingRole: boolean; isStreaming: boolean; error: string | null; thinkingLogs: unknown[] }> };
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  const emptyComponents = new Proxy({}, { get: () => () => null });
  loader._load = function (name, ...args) {
    if (name === "next/router") return { useRouter: () => router };
    if (name === "@tanstack/react-query") return { useQueryClient: () => ({ invalidateQueries: noOp }) };
    if (name === "@/i18n/org/OrgLocaleProvider") return {
      useOrgLocale: () => ({ c: (ko: string) => ko }), useOrgSourceT: () => (text: string) => text,
    };
    if (name === "@/hooks/org/useOrgWorkspace") return { useOrgWorkspace: () => context };
    if (name === "@/hooks/useMediaQuery") return { useMediaQuery: () => true };
    if (name === "@/hooks/useResizableSplitPanel") return { useResizableSplitPanel: () => ({ widthPct: 42 }) };
    if (name === "@/store/useOrgRoleCreationUiStore") return {
      useOrgRoleCreationUiStore: (select: (state: typeof uiState) => unknown) => select(uiState),
    };
    if (name === "@/store/useOrgAgentLiveChatStore") return {
      EMPTY_ORG_AGENT_LIVE_CHAT: { isCreatingRole: false },
      getOrgAgentLiveChatKey: () => roleId,
      useOrgAgentLiveChatStore: (select: (state: typeof liveState) => unknown) => select(liveState),
    };
    if (name === "@/components/org/role-start/RoleStartPreparation") return {
      RoleStartPreparation: ({ error }: { error?: string }) => <div data-preparing>{error || "Working"}</div>,
    };
    if (name === "@/components/org/workspace/OrgMobileNavigation") return {
      useOrgMobileNavigation: () => ({ openNavigation: noOp, setNavigationTriggerHidden: noOp }),
    };
    if (name === "@/components/org/role-start/RoleStartOnboarding") return {
      useRoleStartQuery: (_role: string, _workspace: string, enabled: boolean) => {
        enabledReads.push(enabled);
        return { data: startData, isLoading: false, isError: false };
      },
      isRoleStartOnboarding: (role: OrgRole | null) => role?.status === "draft",
      RoleStartOnboarding: ({ role }: { role: OrgRole }) => <div data-onboarding={role.roleId}>Setup</div>,
    };
    if (name === "@/components/org/agent/OrgAgentPanel") return {
      OrgAgentChatSurface: (props: NonNullable<typeof chatProps>) => {
        chatProps = props;
        return <div data-new-role-composer>Existing role composer</div>;
      },
    };
    if (name.startsWith("@/components/") || name === "@/hooks/org/useOrg" || name === "@/hooks/org/useOrgJobs") return emptyComponents;
    return original.call(this, name, ...args);
  };
  let OrgRoleCreationPage: typeof import("./OrgRoleCreationPage")["OrgRoleCreationPage"];
  try {
    ({ OrgRoleCreationPage } = await import("./OrgRoleCreationPage"));
  } finally {
    loader._load = original;
  }

  const entry = renderToStaticMarkup(<OrgRoleCreationPage />);
  assert.ok(entry.includes("data-new-role-composer"));
  assert.ok(!entry.includes("data-onboarding"));
  assert.equal(chatProps?.purpose, "role-creation");
  assert.equal(chatProps?.roleId, null);
  assert.deepEqual(enabledReads, [false], "entry does not query a nonexistent role");

  router.query.prefill = "https://example.com/jobs/research\n\nResearch Engineer 역할을 채용하고 싶어요.";
  renderToStaticMarkup(<OrgRoleCreationPage />);
  assert.equal(chatProps?.initialMessage, router.query.prefill);

  // This is the callback the existing chat invokes on its role_created event.
  chatProps!.onRoleCreated(roleId);
  assert.equal(router.pathname, "/org/role");
  assert.equal(router.query.roleId, roleId);
  context.page = "role";
  liveState.chats[roleId] = { isCreatingRole: true, isStreaming: true, error: null, thinkingLogs: [] };
  const preparing = renderToStaticMarkup(<OrgRoleCreationPage />);
  assert.ok(preparing.includes("data-preparing"));
  assert.ok(!preparing.includes("data-onboarding") && !preparing.includes("data-new-role-composer"));
  assert.equal(enabledReads.at(-1), false, "creation does not read the role before the server creates it");
  liveState.chats[roleId].isStreaming = false;
  liveState.chats[roleId].error = "Creation failed";
  const failed = renderToStaticMarkup(<OrgRoleCreationPage />);
  assert.ok(failed.includes("Creation failed"));
  assert.equal(enabledReads.at(-1), false, "failure keeps the error screen instead of an empty form");
  delete liveState.chats[roleId];
  startData = { role: { status: "draft" } };
  const started = renderToStaticMarkup(<OrgRoleCreationPage />);
  assert.ok(started.includes(`data-onboarding="${roleId}"`), "new draft opens before the workspace list refreshes");
  assert.ok(!started.includes("data-new-role-composer"));
  assert.deepEqual(enabledReads, [false, false, false, false, true]);

  context.roles = [{
    roleId, workspaceId, status: "draft", name: "기존 초안", description: null,
    locationText: null, workMode: null, employmentTypes: [], criteria: [],
    createdAt: "", updatedAt: "", externalJdUrl: null, request: null,
  }];
  startData = undefined;
  const reopened = renderToStaticMarkup(<OrgRoleCreationPage />);
  assert.ok(reopened.includes(`data-onboarding="${roleId}"`), "an existing draft opens onboarding before its session loads");
  assert.ok(!reopened.includes("data-new-role-composer"));

  // A route transition can leave the previous role ID and cached draft visible
  // to shared components. /org/new must still own only the entry composer.
  context.page = "new-role";
  router.pathname = "/org/new";
  startData = { role: { status: "draft" } };
  const newEntry = renderToStaticMarkup(<OrgRoleCreationPage />);
  assert.ok(newEntry.includes("data-new-role-composer"));
  assert.ok(!newEntry.includes("data-onboarding"));
  assert.equal(chatProps?.roleId, null);
  assert.equal(enabledReads.at(-1), false, "/org/new never starts an onboarding read");

  context.page = "home";
  context.roles = [];
  router.pathname = "/org/home";
  const homeEntry = renderToStaticMarkup(<OrgRoleCreationPage />);
  assert.ok(homeEntry.includes("data-new-role-composer"));
  assert.ok(!homeEntry.includes("data-onboarding"));
  assert.equal(chatProps?.roleId, null);
  chatProps!.onRoleCreated(roleId);
  assert.equal(router.pathname, "/org/role", "Home creation continues on the draft's own page");
});
