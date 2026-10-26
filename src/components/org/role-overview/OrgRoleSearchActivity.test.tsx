import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

test("live Role status appears, advances, clears, and hides stale data after access loss", async () => {
  const dom = new JSDOM("<div id='root'></div>", {url: "https://activity.invalid"});
  const keys = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "getComputedStyle", "CustomEvent", "BroadcastChannel"];
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: (dom.window as any)[key] });
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { OrgLocaleScope } = await import("@/i18n/org/OrgLocaleProvider");
  const { OrgRoleSearchActivity } = await import("./OrgRoleSearchActivity");
  const node = dom.window.document.getElementById("root")!;
  const root = createRoot(node);
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  // Cache-driven UI fixture: no API, Supabase, worker or external requests.
  onlineManager.setOnline(false);
  const key = queryKeys.org.matchingSearchStatus("workspace", "role");
  const setActivity = (activity: unknown) => client.setQueryData(key, {ok: true,active: false,activity});
  try {
    setActivity(null);
    await act(async () => root.render(<QueryClientProvider client={client}><OrgLocaleScope locale="ko"><OrgRoleSearchActivity workspaceId="workspace" roleId="role" /></OrgLocaleScope></QueryClientProvider>));
    assert.equal(node.textContent, "");
    await act(async () => { setActivity({trigger: "role_activated",phase: "queued"}); await new Promise(resolve => setTimeout(resolve, 10)); });
    assert.match(node.textContent!, /첫 후보자 검색 대기 중/);
    assert.equal(node.querySelectorAll('[role="status"]').length, 1);
    await act(async () => { setActivity({trigger: "scheduled",phase: "searching"}); await new Promise(resolve => setTimeout(resolve, 10)); });
    assert.match(node.textContent!, /정기 후보자 검색 중/);
    await act(async () => { setActivity({trigger: "scheduled",phase: "preparing"}); await new Promise(resolve => setTimeout(resolve, 10)); });
    assert.match(node.textContent!, /후보자 추천 준비 중/);
    await act(async () => {
      client.getQueryCache().find({queryKey:key})!.setState({status:"error",error:Object.assign(new Error("offline"),{status:500})});
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    assert.match(node.textContent!, /검색 상태를 새로 확인하지 못했어요/);
    assert.equal(node.querySelector('[role="status"]'), null, "stale state does not pretend to be current");
    await act(async () => {
      client.getQueryCache().find({queryKey:key})!.setState({status:"error",error:Object.assign(new Error("forbidden"),{status:403})});
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    assert.equal(node.textContent, "");
    await act(async () => { setActivity(null); await new Promise(resolve => setTimeout(resolve, 10)); });
    assert.equal(node.textContent, "");
  } finally {
    await act(async () => root.unmount());
    client.clear(); onlineManager.setOnline(true); dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis,key,descriptor);
      else delete (globalThis as any)[key];
    }
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});
