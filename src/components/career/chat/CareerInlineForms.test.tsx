import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { MessagesProvider } from "@/i18n/useMessage";
import { CareerChatPanelProvider, type CareerChatPanelContextValue } from "../CareerChatPanelContext";
import { CareerInlineForms } from "./CareerInlineForms";
import { supabase } from "@/lib/supabase";
import type { CareerForm, CareerFormResponse } from "@/lib/career/forms/schema";

test("inline groups retain drafts and reviewed revisions, then submit once without replacing chat", async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/career" });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    CustomEvent: dom.window.CustomEvent, sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.mock.method(supabase.auth, "getSession", async () => ({ data: { session: { access_token: "fixture" } }, error: null }));
  const forms: CareerForm[] = [10,20].map(id => ({ formId: id, revision: 1, kind: "form", state: "open", title: `지원 ${id}`,
    items: [{ id: "experience", label: "경험", type: "textarea", content: "" }, { id: "consent", label: "동의", type: "checkbox", content: "" },
      { id: "start", label: "입사 가능 시기", type: "select", content: { value: "month", options: [{ id: "month", label: "한 달 이내" }] } }],
    positive: { id: "submit", label: "이 내용으로 지원", message: "이 내용으로 지원해줘" } }));
  const responses: CareerFormResponse[] = [], posts: any[] = [];
  let fail = true, failAfterSave = false;
  let unavailableForm: number | undefined;
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (init?.method !== "POST") {
      const form = forms.find(form => form.formId === Number(new URL(String(url), "http://localhost").searchParams.get("formId")));
      if (form?.formId === unavailableForm) return Response.json({ error: "Unavailable" }, { status: 503 });
      return Response.json({ form, responses: responses.filter(r => r.formId === form?.formId).map(response => ({ response })) });
    }
    const input = JSON.parse(String(init.body)); posts.push(input);
    if (fail) { fail = false; return Response.json({ error: "Temporary failure" }, { status: 503 }); }
    for (const answer of input.responses) {
      const form = forms.find(form => form.formId === answer.formId)!;
      responses.push({ ...answer, requestId: `${input.requestId}:${answer.formId}`, formSnapshot: structuredClone(form) });
      form.state = "answered";
    }
    if (failAfterSave) { failAfterSave = false; throw new TypeError("Connection lost after commit"); }
    return Response.json({ message: { id: 100, content: "두 답변을 보냈어요.", formResponses: responses.filter(response => response.requestId.startsWith(input.requestId + ":")) } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const button = (label: string) => [...dom.window.document.querySelectorAll("button")].find(b => b.textContent === label)!;
  const field = (id: number) => dom.window.document.querySelector<HTMLTextAreaElement>(`[data-career-form-id="${id}"] textarea`)!;
  const props = (element: HTMLElement) => (element as any)[Object.keys(element).find(key => key.startsWith("__reactProps$"))!];
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  const refresh = async () => { await act(async () => { await client.invalidateQueries({ queryKey: ["career-form-references"] }); }); await settle(); };
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><RouterContext.Provider value={{ locale: "ko", query: {} } as NextRouter}><MessagesProvider locale="ko">
      <CareerChatPanelProvider value={{ conversationId: "conversation", user: { id: "user" } } as CareerChatPanelContextValue}>
        <CareerInlineForms formIds={[10,20]} grouped /><CareerInlineForms formIds={[10]} grouped /><input aria-label="Ordinary chat" />
      </CareerChatPanelProvider>
    </MessagesProvider></RouterContext.Provider></QueryClientProvider>));
    await settle();
    assert.equal(field(10), null, "group begins as a button");
    assert.equal(client.getQueryCache().findAll({ queryKey: ["career-form-references"] }).length, 2, "multiple references share a canonical query per form");
    await act(async () => button("질문 2개 보기").click());
    assert.equal(dom.window.document.querySelector('[data-career-form-id="10"] [data-slot="select-value"]')?.textContent, "한 달 이내", "selected options show their label, not their internal ID");
    await act(async () => props(field(10)).onChange({ target: { value: "내 경험" } }));
    await act(async () => props(field(20)).onChange({ target: { value: "다른 경험" } }));
    assert.equal(posts.length, 0, "editing fields is never a conversation input");
    assert.ok(dom.window.document.querySelector('[aria-label="Ordinary chat"]'));
    forms[0] = { ...forms[0], revision: 2, title: "수정된 지원 10" };
    await refresh();
    assert.equal(field(10).value, "내 경험");
    assert.equal(field(10).disabled, true);
    assert.ok(button("답변 보내기").disabled);
    await act(async () => button("최신 질문 확인").click());
    assert.equal(field(10).value, "내 경험", "unchanged text fields retain user edits");
    assert.equal(dom.window.document.querySelector<HTMLInputElement>('[data-career-form-id="10"] input[type="checkbox"]')!.checked, false);
    await act(async () => dom.window.document.querySelector<HTMLInputElement>('[data-career-form-id="10"] input[type="radio"]')!.click());
    assert.equal(posts.length, 0, "a group action remains a local choice until batch submit");
    await act(async () => { button("답변 보내기").click(); button("답변 보내기").click(); });
    await settle();
    assert.equal(posts.length, 1, "double click shares one in-flight submission");
    assert.equal(field(10).value, "내 경험", "a failed request preserves edits");
    await act(async () => button("답변 보내기").click()); await settle();
    assert.equal(posts.length, 2);
    assert.equal(posts[0].requestId, posts[1].requestId, "retry uses the same idempotency identity");
    assert.deepEqual(posts[1].responses.map((r: any) => [r.formId,r.revision,r.values.experience,r.actionId]), [[10,2,"내 경험","submit"],[20,1,"다른 경험",undefined]]);
    assert.ok(field(20).disabled);
    assert.equal(field(20).value, "다른 경험", "completed form shows saved answers");
    forms[0] = { ...forms[0], revision: 3, state: "open" };
    await refresh();
    assert.equal(field(10).disabled, false, "a new revision is a new review, not permanently marked sent");
    await act(async () => props(field(10)).onChange({ target: { value: "아직 보내지 않은 초안" } }));
    forms[0] = { ...forms[0], revision: 4, state: "answered" };
    responses.push({ formId: 10, revision: 4, values: { experience: "다른 창에서 실제 보낸 답변" }, requestId: "another-window:10", formSnapshot: structuredClone(forms[0]) });
    forms[1] = { ...forms[1], revision: 2, state: "open" };
    await refresh();
    assert.equal(field(10).value, "다른 창에서 실제 보낸 답변", "read-only answers never use an unsent local draft");
    assert.equal(button("답변 보내기").disabled, false, "a stale draft for a closed form cannot block an open form");
    await act(async () => button("질문 1개 보기").click());
    assert.deepEqual([...dom.window.document.querySelectorAll<HTMLTextAreaElement>('[data-career-form-id="10"] textarea')].map(field => field.value), ["다른 창에서 실제 보낸 답변", "다른 창에서 실제 보낸 답변"]);
    await act(async () => props(field(20)).onChange({ target: { value: "저장 후 연결이 끊긴 답변" } }));
    failAfterSave = true;
    await act(async () => button("답변 보내기").click()); await settle();
    assert.equal(posts.length, 3);
    assert.deepEqual(posts[2].responses.map((response: any) => response.formId), [20]);
    assert.equal(field(20).value, "저장 후 연결이 끊긴 답변");
    assert.equal(field(20).disabled, true);
    assert.equal(dom.window.document.querySelector('[role="alert"]'), null, "a committed answer is not shown as failed when its HTTP response is lost");
    assert.equal(button("답변 보내기"), undefined);
    assert.equal(JSON.parse(dom.window.sessionStorage.getItem("career-inline-forms:user:conversation") ?? "{}")[20], undefined);
    forms[1] = { ...forms[1], revision: 3, state: "open" };
    unavailableForm = 10;
    await refresh();
    assert.ok(field(20), "a failed member does not erase other loaded forms");
    assert.equal(button("답변 보내기").disabled, true, "a partially loaded group cannot silently submit a subset");
    unavailableForm = undefined;
    forms[1].state = "resolved";
    await refresh();
    assert.equal(field(20).disabled, true);
    assert.ok(dom.window.document.body.textContent?.includes("종료된 질문이에요."));
    assert.equal(button("답변 보내기"), undefined);
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key];
  }
});
