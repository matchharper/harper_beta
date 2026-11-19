import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { MessagesProvider } from "@/i18n/useMessage";
import { supabase } from "@/lib/supabase";
import type { CareerForm } from "@/lib/career/forms/schema";
import { CareerChatPanelProvider, type CareerChatPanelContextValue } from "../CareerChatPanelContext";
import { OpportunityReviews } from "./OpportunityReviews";

test("an opportunity review submits only the checked preparation in its originating conversation", async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/career/history" });
  const restore = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    restore.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const origin = "1d3183c9-b644-4c31-8f07-3997d243fbeb";
  const roleId = "ef47a136-ce11-41e6-8c27-64fb31e00956";
  const form: CareerForm = { formId: 12, revision: 2, kind: "form", title: "지원 준비", state: "open",
    items: [
      { id: "resume", label: "사례를 이력서에 반영", type: "checkbox", content: "워크숍 메모에서 확인한 내용" },
      { id: "email", label: "대표에게 메일", type: "checkbox", content: "담당자에게 보낼 초안" },
    ], relatedRefs: [{ type: "role", id: roleId }] };
  let linked = true;
  const posts: { conversationId: string; responses: { values: Record<string,boolean> }[] }[] = [];
  t.mock.method(supabase.auth, "getSession", async () => ({ data: { session: { access_token: "test" } }, error: null }));
  t.mock.method(globalThis, "fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(input, "http://localhost");
    if (url.pathname.endsWith("/opportunity")) {
      assert.equal(url.searchParams.get("roleId"), roleId);
      return Response.json({ reviews: linked ? [{ conversationId: origin, formId: 12, revision: 2 }] : [], next: null });
    }
    if (init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      form.state = "answered";
      return Response.json({ message: {} });
    }
    assert.equal(url.searchParams.get("conversationId"), origin);
    assert.equal(url.searchParams.get("formId"), "12");
    return Response.json({ form, responses: [] });
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><RouterContext.Provider value={{ locale: "ko", query: {} } as NextRouter}>
      <MessagesProvider locale="ko"><CareerChatPanelProvider value={{ conversationId: "current-chat", user: { id: "owner" } } as CareerChatPanelContextValue}>
        <OpportunityReviews roleId={roleId} />
      </CareerChatPanelProvider></MessagesProvider></RouterContext.Provider></QueryClientProvider>));
    await settle(); await settle();
    const boxes = dom.window.document.querySelectorAll<HTMLInputElement>('[data-career-form-id="12"] input[type=checkbox]');
    assert.equal(boxes.length, 2);
    assert.ok(!boxes[0].checked && !boxes[1].checked);
    await act(async () => boxes[0].click());
    assert.equal(posts.length, 0);
    const button = [...dom.window.document.querySelectorAll("button")].find(item => item.textContent === "답변 보내기");
    assert.ok(button);
    await act(async () => button.click());
    assert.equal(posts.length, 1);
    assert.equal(posts[0].conversationId, origin);
    assert.deepEqual(posts[0].responses[0].values, { resume: true, email: false });
    // A revision has been moved to a different opportunity since this view was opened.
    form.revision = 3; form.title = "다른 회사의 준비"; form.state = "open"; linked = false;
    await act(async () => { await client.invalidateQueries({ queryKey: ["career-form-references"] }); });
    await settle();
    assert.ok(!dom.window.document.body.textContent?.includes(form.title));
    const reload = [...dom.window.document.querySelectorAll("button")].find(item => item.textContent === "최신 질문 확인");
    assert.ok(reload);
    await act(async () => reload.click());
    await settle();
    assert.ok(!dom.window.document.querySelector("button"));
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    for (const [key, descriptor] of restore) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
