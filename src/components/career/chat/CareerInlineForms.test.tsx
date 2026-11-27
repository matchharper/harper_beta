import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
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

function installFormDom(t: TestContext) {
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
  t.after(() => {
    dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key];
  });
  return dom;
}

test("inline groups retain drafts and reviewed revisions, then submit once without replacing chat", async t => {
  const dom = installFormDom(t);
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
    assert.equal(dom.window.document.querySelector('[data-career-form-id="20"]')?.textContent?.includes("답변을 보냈어요"), false,
      "an answered form does not add a sent-status line inside the form");
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
    await act(async () => root.unmount()); client.clear();
  }
});

test("모두 승인 sends every review in the group with its own approval and keeps a chosen decline", async t => {
  const dom = installFormDom(t);
  const review = (id: number): CareerForm => ({ formId: id, revision: 1, kind: "form", state: "open", title: `지원 ${id}`,
    items: [{ id: "experience", label: "경험", type: "textarea", content: "" }],
    negative: { id: `hold-${id}`, label: "보류", message: "보류할게" },
    positive: { id: `submit-${id}`, label: "이 내용으로 지원", message: "이 내용으로 지원해줘" } });
  const forms: CareerForm[] = [review(40), review(50), review(60),
    { formId: 70, revision: 1, kind: "form", state: "open", title: "질문", items: [{ id: "note", label: "메모", type: "textarea", content: "" }] }];
  const posts: any[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (init?.method !== "POST") {
      const form = forms.find(form => form.formId === Number(new URL(String(url), "http://localhost").searchParams.get("formId")));
      return Response.json({ form, responses: [] });
    }
    const input = JSON.parse(String(init.body)); posts.push(input);
    return Response.json({ message: { id: 100, content: "", formResponses: [] } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const button = (text: string) => [...dom.window.document.querySelectorAll("button")].find(b => b.textContent === text);
  const field = (id: number) => dom.window.document.querySelector<HTMLTextAreaElement>(`[data-career-form-id="${id}"] textarea`)!;
  const props = (element: HTMLElement) => (element as any)[Object.keys(element).find(key => key.startsWith("__reactProps$"))!];
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  const render = (ids: number[]) => act(async () => root.render(<QueryClientProvider client={client}><RouterContext.Provider value={{ locale: "ko", query: {} } as NextRouter}><MessagesProvider locale="ko">
      <CareerChatPanelProvider value={{ conversationId: "conversation", user: { id: "user" } } as CareerChatPanelContextValue}>
        <CareerInlineForms key={ids.join(",")} formIds={ids} grouped />
      </CareerChatPanelProvider>
    </MessagesProvider></RouterContext.Provider></QueryClientProvider>));
  try {
    await render([40, 70]);
    await settle();
    await act(async () => button("질문 2개 보기")!.click());
    assert.equal(button("모두 승인 (1)"), undefined, "one review needs no approve-all");
    await render([40, 50, 60, 70]);
    await settle();
    await act(async () => button("질문 4개 보기")!.click());
    assert.ok(button("모두 승인 (3)"), "the count is the reviews that will be approved");
    await act(async () => props(field(40)).onChange({ target: { value: "고친 경험" } }));
    await act(async () => dom.window.document.querySelector<HTMLInputElement>('[data-career-form-id="60"] input[type="radio"]')!.click());
    assert.equal(button("모두 승인 (3)"), undefined);
    await act(async () => button("모두 승인 (2)")!.click());
    await settle();
    assert.equal(posts.length, 1, "one request carries every review");
    assert.deepEqual(posts[0].responses.map((r: any) => [r.formId, r.values.experience ?? r.values.note, r.actionId]),
      [[40, "고친 경험", "submit-40"], [50, "", "submit-50"], [60, "", "hold-60"], [70, "", undefined]]);
  } finally {
    await act(async () => root.unmount()); client.clear();
  }
});

test("approving with a required answer empty names it once, then sends the same answers on the next press", async t => {
  const dom = installFormDom(t);
  const form: CareerForm = { formId: 80, revision: 1, kind: "form", state: "open", title: "지원 80",
    items: [{ id: "salary", label: "희망 연봉", type: "text", content: "", required: true },
      { id: "note", label: "메모", type: "textarea", content: "" }],
    negative: { id: "hold-80", label: "보류", message: "보류할게" },
    positive: { id: "submit-80", label: "이 내용으로 지원", message: "이 내용으로 지원해줘" } };
  const posts: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    if (init?.method !== "POST") return Response.json({ form, responses: [] });
    posts.push(JSON.parse(String(init.body)));
    return Response.json({ message: { id: 101, content: "", formResponses: [] } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const button = (text: string) => [...dom.window.document.querySelectorAll("button")].find(b => b.textContent === text);
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><RouterContext.Provider value={{ locale: "ko", query: {} } as NextRouter}><MessagesProvider locale="ko">
      <CareerChatPanelProvider value={{ conversationId: "conversation", user: { id: "user" } } as CareerChatPanelContextValue}>
        <CareerInlineForms formIds={[80]} />
      </CareerChatPanelProvider>
    </MessagesProvider></RouterContext.Provider></QueryClientProvider>));
    await settle();
    assert.match(dom.window.document.querySelector('[data-career-form-id="80"]')?.textContent ?? "", /희망 연봉필수/);
    await act(async () => button("이 내용으로 지원")!.click());
    await settle();
    assert.equal(posts.length, 0, "the first press only names the empty required answer");
    assert.match(dom.window.document.querySelector('[role="alert"]')?.textContent ?? "", /필수 칸이 비어 있어요: 희망 연봉/);
    await act(async () => button("이 내용으로 지원")!.click());
    await settle();
    assert.equal(posts.length, 1, "the person decides: the same answers go on the next press");
    assert.equal(posts[0].responses[0].actionId, "submit-80");
  } finally {
    await act(async () => root.unmount()); client.clear();
  }
});

test("each checklist row submits alone, retains its check after reload and leaves siblings available", async t => {
  const dom = installFormDom(t);
  const form: CareerForm = {
    formId: 30, revision: 1, kind: "suggestion", state: "open", title: "지원 준비",
    items: ["이력서 수정", "지원 양식 확인", "채용 담당자 문의"].map((label, index) => ({
      id: String(index), type: "action", label, content: {},
      positive: { id: "prepare", label: "준비하기", message: `${label}을 도와줘` },
    })),
  };
  const responses: CareerFormResponse[] = [];
  const posts: Array<Record<string, any>> = [];
  let finish: (() => void) | undefined;
  t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    if (init?.method !== "POST") return Response.json({ form, responses: responses.map(response => ({ response })) });
    const input = JSON.parse(String(init.body));
    posts.push(input);
    if (input.answers[0].itemId === "0") await new Promise<void>(resolve => { finish = resolve; });
    const response = { ...input, formSnapshot: structuredClone(form) };
    responses.push(response);
    if (responses.length === form.items.length) form.state = "answered";
    if (input.answers[0].itemId === "2") throw new TypeError("Lost connection after commit");
    return Response.json({ message: { formResponse: response } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = (key: number) => act(async () => root.render(<QueryClientProvider client={client}>
    <RouterContext.Provider value={{ locale: "ko", query: {} } as NextRouter}><MessagesProvider locale="ko">
      <CareerChatPanelProvider value={{ conversationId: "conversation", user: { id: "user" } } as CareerChatPanelContextValue}>
        <CareerInlineForms key={key} formIds={[30]} />
      </CareerChatPanelProvider>
    </MessagesProvider></RouterContext.Provider></QueryClientProvider>));
  const rows = () => [...dom.window.document.querySelectorAll("li")].map(li => ({
    check: li.querySelector("input")!, action: li.querySelector("button"), status: li.querySelector('[role="status"]'),
  }));
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  try {
    await render(1); await settle();
    assert.equal(rows().length, 3);
    assert.equal(dom.window.document.body.textContent?.includes("답변 보내기"), false);
    await act(async () => { rows()[0].action!.click(); rows()[0].action!.click(); });
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0].answers, [{ itemId: "0", actionId: "prepare", values: {} }]);
    assert.equal(rows()[0].check.checked, false, "the check represents a saved action");
    assert.equal(rows()[1].action?.disabled, false, "another row is available during a request");
    await act(async () => rows()[1].action!.click()); await settle();
    await act(async () => finish!()); await settle();
    assert.deepEqual(rows().map(row => row.check.checked), [true, true, false]);
    assert.deepEqual(rows().map(row => row.action?.textContent ?? null), [null, null, "준비하기"]);
    assert.deepEqual(rows().map(row => row.status?.textContent ?? null), ["완료", "완료", null]);
    const title = dom.window.document.getElementById(rows()[0].check.getAttribute("aria-labelledby")!);
    assert.ok(title?.classList.contains("line-through"));
    client.removeQueries({ queryKey: ["career-form-references"] });
    await render(2); await settle();
    assert.deepEqual(rows().map(row => row.check.checked), [true, true, false]);
    await act(async () => rows()[2].action!.click()); await settle();
    assert.deepEqual(rows().map(row => row.check.checked), [true, true, true]);
    assert.equal(dom.window.document.querySelector('[role="alert"]'), null);
    assert.equal(dom.window.document.body.textContent?.includes("답변을 보냈어요."), false);
    assert.deepEqual(posts.map(post => post.answers.map((a: { itemId: string }) => a.itemId)), [["0"], ["1"], ["2"]]);
  } finally {
    await act(async () => root.unmount()); client.clear();
  }
});

const harperDocumentId = "00000000-0000-4000-8000-000000000003";
// One review with a Harper-made document chosen as its file. `answer` decides what the server says to each approval.
async function renderReview(t: TestContext, answer: () => Response, origin?: { conversationId: string; revision: number }) {
  const dom = installFormDom(t);
  const form: CareerForm = { formId: 90, revision: 1, kind: "form", state: "open", title: "A사 지원",
    items: [{ id: "resume", label: "이력서", type: "document", content: { documentId: harperDocumentId, revision: 2, fileName: "A사 지원용 이력서" } }],
    positive: { id: "submit-90", label: "이 내용으로 지원", message: "이 내용으로 지원해줘" } };
  const posts: any[] = [], sent: any[] = [];
  let reads = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (String(url).startsWith("/api/talent/documents")) return Response.json({ documents: [] });
    if (init?.method !== "POST") { reads++; return Response.json({ form, responses: [] }); }
    posts.push(JSON.parse(String(init.body)));
    return answer();
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  const button = (label: string) => [...dom.window.document.querySelectorAll("button")].find(b => b.textContent === label);
  await act(async () => root.render(<QueryClientProvider client={client}><RouterContext.Provider value={{ locale: "ko", query: {} } as NextRouter}><MessagesProvider locale="ko">
    <CareerChatPanelProvider value={{ conversationId: "conversation", user: { id: "user" },
      onSendChatMessage: (args: any) => { sent.push(args); } } as CareerChatPanelContextValue}>
      <CareerInlineForms formIds={[90]} origin={origin} />
    </CareerChatPanelProvider>
  </MessagesProvider></RouterContext.Provider></QueryClientProvider>));
  await settle();
  return { dom, posts, sent, button, settle, reads: () => reads,
    alert: () => dom.window.document.querySelector('[role="alert"]')?.textContent ?? null,
    approve: async () => { await act(async () => button("이 내용으로 지원")!.click()); await settle(); },
    close: async () => { await act(async () => root.unmount()); client.clear(); } };
}

test("a document Harper cannot make into a PDF names the reason, never the server's text, and lets the person tell Harper", async t => {
  const review = await renderReview(t, () =>
    Response.json({ code: "file_render_unavailable", retryable: false, error: "PDF rendering is not configured." }, { status: 503 }));
  try {
    const before = review.reads();
    await review.approve();
    assert.equal(review.posts.length, 1);
    assert.equal(review.posts[0].responses[0].values.resume, harperDocumentId);
    assert.ok(review.reads() > before, "a 5xx reads the receipt before showing the failure");
    assert.equal(review.alert(), "지금은 Harper가 만든 문서를 PDF로 만들 수 없어요. 다시 눌러도 같아요. 직접 올린 파일을 고르거나 Harper에게 알려 주세요.");
    assert.doesNotMatch(review.dom.window.document.body.textContent ?? "", /not configured|file_render_unavailable/);
    const tell = review.button("Harper에게 알리기");
    assert.ok(tell, "pressing again cannot help, so telling Harper is offered at once");
    await act(async () => { tell!.click(); tell!.click(); });
    assert.equal(review.sent.length, 1, "a double click sends one message");
    assert.equal(review.sent[0].text, "답을 보내려는데 고른 문서를 지금은 PDF로 만들 수 없대. 내가 올린 원본 파일로 다시 보여줘.\n" +
      `A사 지원\n[A사 지원용 이력서](documentId:${harperDocumentId})`);
    await act(async () => review.sent[0].onSuccess());
    assert.equal(review.button("Harper에게 알리기"), undefined, "once sent, the offer goes away");
    assert.match(review.alert() ?? "", /PDF로 만들 수 없어요/);
    assert.equal(review.posts.length, 1, "telling Harper is a chat message, not another approval");
  } finally {
    await review.close();
  }
});

test("a PDF failure that may pass offers to tell Harper after the same press failed twice; a lost connection reads the receipt", async t => {
  let lost = false;
  const review = await renderReview(t, () => {
    if (lost) throw new TypeError("Failed to fetch");
    return Response.json({ code: "file_render_failed", retryable: true }, { status: 503 });
  });
  try {
    await review.approve();
    assert.match(review.alert() ?? "", /PDF로 만들지 못했어요. 잠시 뒤 다시 눌러 주세요/);
    assert.equal(review.button("Harper에게 알리기"), undefined, "the first failure may pass on its own");
    await review.approve();
    assert.equal(review.posts[1].requestId, review.posts[0].requestId, "the retry keeps its identity");
    assert.ok(review.button("Harper에게 알리기"), "the same failure twice is worth telling Harper");
    lost = true;
    const before = review.reads();
    await review.approve();
    assert.equal(review.posts.length, 3);
    assert.ok(review.reads() > before, "a lost connection still reads the receipt");
    assert.equal(review.alert(), "답변 전송을 확인하지 못했어요. 최신 질문을 확인한 뒤 다시 보내 주세요. 작성 내용은 유지돼요.");
    assert.equal(review.button("Harper에게 알리기"), undefined, "without the server's reason nothing is offered");
  } finally {
    await review.close();
  }
});

test("a refusal below 500 shows its reason without a receipt read; only a changed form is reloaded", async t => {
  let refusal = { status: 422, code: "file_unavailable" };
  const review = await renderReview(t, () => Response.json({ code: refusal.code, retryable: false }, { status: refusal.status }));
  try {
    let before = review.reads();
    await review.approve();
    assert.equal(review.reads(), before, "nothing was saved, so there is no receipt to read");
    assert.equal(review.alert(), "고른 파일을 지원서에 붙일 수 없어요. 다른 파일을 고르거나 Harper에게 알려 주세요.");
    assert.ok(review.button("Harper에게 알리기"));
    refusal = { status: 409, code: "form_changed" };
    before = review.reads();
    await review.approve();
    assert.ok(review.reads() > before, "a changed form is reloaded");
    assert.equal(review.alert(), "그사이 질문이 바뀌었거나 닫혔어요. 최신 질문을 확인한 뒤 다시 보내 주세요.");
    assert.equal(review.button("Harper에게 알리기"), undefined, "the latest questions are the answer, not Harper");
    refusal = { status: 400, code: "an_unknown_reason" };
    await review.approve();
    assert.equal(review.alert(), "답을 저장하지 못했어요. 작성 내용은 그대로예요. 잠시 뒤 다시 눌러 주세요.");
  } finally {
    await review.close();
  }
});

test("a review shown from another conversation does not offer to message the open chat", async t => {
  const review = await renderReview(t, () => Response.json({ code: "file_render_unavailable", retryable: false }, { status: 503 }),
    { conversationId: "another-conversation", revision: 1 });
  try {
    await review.approve();
    assert.match(review.alert() ?? "", /PDF로 만들 수 없어요/);
    assert.equal(review.button("Harper에게 알리기"), undefined);
  } finally {
    await review.close();
  }
});
