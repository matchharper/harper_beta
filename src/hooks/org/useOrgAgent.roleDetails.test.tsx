import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { OrgLocaleScope } from "@/i18n/org/OrgLocaleProvider";
import { useOrgAgentChat } from "./useOrgAgent";
import { getOrgAgentLiveChatKey, useOrgAgentLiveChatStore } from "@/store/useOrgAgentLiveChatStore";

test("role details preserve the request and notify completion only after a successful stream and refresh", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const originalGetSession = supabase.auth.getSession;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let refreshes = 0;
  client.invalidateQueries = async () => { refreshes++; };
  (supabase.auth as any).getSession = async () => ({ data: { session: { access_token: "synthetic-only" } } });
  let succeed = false;
  const request = "근무 지역을 부산으로 바꿔 주세요.";
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/org/agent/chat");
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.message, request);
    assert.equal(payload.roleCreationView, "role_details");
    assert.equal(payload.mode, "role_creation");
    assert.equal(payload.roleId, "synthetic-role");
    const events = succeed
      ? 'event: done\ndata: {"ok":true}\n\n'
      : 'event: error\ndata: {"error":"Could not save"}\n\nevent: done\ndata: {"ok":false}\n\n';
    return new Response(events, { headers: { "Content-Type": "text/event-stream" } });
  };
  let chat!: ReturnType<typeof useOrgAgentChat>;
  function Harness() {
    chat = useOrgAgentChat({ workspaceId: "synthetic-workspace", roleId: "synthetic-role", mode: "role_creation", appendMessagesToCache: () => {} });
    return null;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  let completed = 0;
  const send = () => chat.sendMessage({ message: request, roleCreationView: "role_details", onComplete: () => { assert.ok(refreshes > 0); completed++; } });
  try {
    await act(async () => { root.render(<QueryClientProvider client={client}><OrgLocaleScope locale="en"><Harness /></OrgLocaleScope></QueryClientProvider>); });
    await act(async () => { await send(); });
    assert.equal(completed, 0);
    assert.ok(chat.error);
    succeed = true;
    refreshes = 0;
    await act(async () => { await send(); });
    assert.equal(completed, 1);
    assert.equal(chat.error, null);
  } finally {
    await act(async () => { root.unmount(); });
    client.clear();
    useOrgAgentLiveChatStore.getState().finish(getOrgAgentLiveChatKey({ workspaceId: "synthetic-workspace", roleId: "synthetic-role", mode: "role_creation" }));
    globalThis.fetch = originalFetch;
    supabase.auth.getSession = originalGetSession;
    Object.assign(globalThis, { window: originalWindow, document: originalDocument, IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  }
});

test("new-role navigates with the live draft before the request and keeps progress until saved data refreshes", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, getSession: supabase.auth.getSession };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const key = getOrgAgentLiveChatKey({ workspaceId: "synthetic-workspace", roleId: "synthetic-draft", mode: "role_creation" });
  const navigations: string[] = [];
  const request = "프로덕트 매니저를 채용하려고 해요.";
  let requestBody: Record<string, unknown> | undefined;
  (supabase.auth as any).getSession = async () => ({ data: { session: { access_token: "synthetic-only" } } });
  client.invalidateQueries = async () => {
    assert.equal(useOrgAgentLiveChatStore.getState().chats[key]?.isStreaming, true);
    assert.equal(useOrgAgentLiveChatStore.getState().chats[key]?.thinkingLogs[0]?.label, "웹 검색 완료");
  };
  globalThis.fetch = async (_url, init) => {
    assert.deepEqual(navigations, ["synthetic-draft"], "navigation must not wait for the server");
    assert.equal(useOrgAgentLiveChatStore.getState().chats[key]?.isCreatingRole, true);
    requestBody = JSON.parse(String(init?.body));
    return new Response([
      'event: role_created\ndata: {"roleId":"synthetic-draft"}\n\n',
      'event: tool_status\ndata: {"id":"search","label":"웹 검색 완료","status":"done","at":"2026-10-25T12:00:00Z"}\n\n',
      'event: done\ndata: {"ok":true}\n\n',
    ].join(""));
  };
  let chat!: ReturnType<typeof useOrgAgentChat>;
  function Harness() {
    chat = useOrgAgentChat({ workspaceId: "synthetic-workspace", mode: "role_creation", appendMessagesToCache: () => {}, onRoleCreated: id => navigations.push(id) });
    return null;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><OrgLocaleScope locale="ko"><Harness /></OrgLocaleScope></QueryClientProvider>));
    await act(async () => { await chat.sendMessage({ message: request, draftRoleId: "synthetic-draft" }); });
    assert.deepEqual(navigations, ["synthetic-draft"], "the server event must not navigate again");
    assert.equal(requestBody?.draftRoleId, "synthetic-draft");
    assert.equal(requestBody?.message, request);
    assert.equal(requestBody?.roleId, null);
    assert.equal(useOrgAgentLiveChatStore.getState().chats[key], undefined);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    useOrgAgentLiveChatStore.setState({ chats: {} });
    globalThis.fetch = previous.fetch;
    supabase.auth.getSession = previous.getSession;
    Object.assign(globalThis, { window: previous.window, document: previous.document, IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  }
});
