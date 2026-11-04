import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { MessagesProvider } from "@/i18n/useMessage";
import {
  CareerChatPanelProvider,
  type CareerChatPanelContextValue,
} from "../CareerChatPanelContext";
import {
  CareerSuggestionItemView,
  CareerSuggestionProvider,
  CareerSuggestionComposerSlot,
  CareerSuggestionHistory,
} from "./CareerSuggestionComposer";
import { supabase } from "@/lib/supabase";
import type { CareerForm, CareerFormResponse } from "@/lib/career/forms/schema";

test("pending questions survive chat turns; partial answers save immediately without a second chat call", async (t) => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/career" });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent, sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.mock.method(supabase.auth, "getSession", async () => ({ data: { session: { access_token: "fixture" } }, error: null }));
  const form: CareerForm = { formId: 10, revision: 1, kind: "suggestion", title: "지난 지원 질문",
    items: [{ id: "a", label: "첫 경험", type: "textarea", content: "" }, { id: "b", label: "둘째 경험", type: "textarea", content: "" }] };
  const review: CareerForm = { formId: 20, revision: 1, kind: "form", title: "다른 지원 검토", items: [], positive: { id: "approve", label: "승인", message: "제출해줘" } };
  let pendingForms = [form, review];
  const responses: CareerFormResponse[] = [];
  const posts: any[] = [];
  let fail = true;
  let secondPostResolve: (() => void) | undefined;
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (String(url).includes("/api/talent/work")) return Response.json({ forms: pendingForms, latestMessageId: 100 + responses.length, pending: 1 });
    if (init?.method !== "POST") return Response.json({ responses: responses.map(response => ({ response })) });
    const input = JSON.parse(String(init.body)); posts.push(input);
    if (fail) { fail = false; return Response.json({ error: "Temporary failure" }, { status: 503 }); }
    if (input.formId === 20) await new Promise<void>(resolve => { secondPostResolve = resolve; });
    const response = { ...input, formSnapshot: input.formId === 10 ? form : review }; responses.push(response);
    return Response.json({ message: { id: 100 + responses.length, content: "응답", formResponse: response } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  let chatCalls = 0;
  let messages: any[] = [{ id: 99, role: "user", content: "다른 얘기도 하자" }];
  const render = () => act(async () => root.render(
    <QueryClientProvider client={client}><RouterContext.Provider value={{ locale: "ko", query: {} } as NextRouter}><MessagesProvider locale="ko">
      <CareerChatPanelProvider value={{ conversationId: "conversation", user: { id: "user" }, messages,
        onSendChatMessage: async () => { chatCalls++; } } as unknown as CareerChatPanelContextValue}>
        <CareerSuggestionProvider><CareerSuggestionHistory form={form} /><CareerSuggestionComposerSlot><input data-ordinary-composer="" /></CareerSuggestionComposerSlot></CareerSuggestionProvider>
      </CareerChatPanelProvider>
    </MessagesProvider></RouterContext.Provider></QueryClientProvider>
  ));
  const button = (label: string) => [...dom.window.document.querySelectorAll("button")].find(b => b.textContent?.includes(label))!;
  const current = () => dom.window.document.querySelector("[data-suggestion-id]")?.getAttribute("data-suggestion-id");
  const submit = async () => act(async () => {
    const input = dom.window.document.querySelector<HTMLTextAreaElement>("[data-preparation-questions] form textarea")!;
    const props = (input as any)[Object.keys(input).find(key => key.startsWith("__reactProps$"))!];
    props.onChange({ target: { value: "확인된 경험" } });
  });
  const enter = () => act(async () => {
    const input = dom.window.document.querySelector<HTMLTextAreaElement>("[data-preparation-questions] form textarea")!;
    const props = (input as any)[Object.keys(input).find(key => key.startsWith("__reactProps$"))!];
    props.onKeyDown({ key: "Enter", keyCode: 13, shiftKey: false, repeat: false, nativeEvent: { isComposing: false }, preventDefault() {} });
  });
  try {
    await render();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    assert.equal(current(), undefined, "questions do not take over the composer");
    await act(async () => button("답변 대기 2개").click());
    assert.equal(current(), "a");
    assert.ok(dom.window.document.querySelector("[data-ordinary-composer]"), "chat stays available for delegation");
    await submit(); await enter();
    assert.equal(posts.length, 1); assert.equal(current(), "a", "failed save does not advance");
    await act(async () => button("닫기").click());
    await act(async () => button("지난 지원 질문").click());
    await enter();
    assert.equal(posts.length, 2); assert.equal(posts[0].requestId, posts[1].requestId, "reopen retries the same response identity");
    assert.deepEqual(posts[1].answers.map((answer: any) => answer.itemId), ["a"]);
    assert.equal(current(), "b", "first answer resumes work while the second question remains");
    assert.equal(chatCalls, 0, "the server owns resumption");
    messages = [...messages, { id: 200, role: "user", content: "나머지는 알아서 해" }]; await render();
    assert.equal(current(), "b", "a different chat turn does not lose the selected question");
    await act(async () => button("다음").click());
    await act(async () => button("닫기").click());
    assert.equal(dom.window.document.activeElement, button("답변 대기 2개"), "closing restores keyboard focus");
    await act(async () => button("답변 대기 2개").click());
    assert.ok(button("승인"), "reopening resumes the last review instead of the first question");
    await act(async () => button("승인").click());
    assert.ok(dom.window.document.querySelector("[data-ordinary-composer]"));
    await act(async () => button("다음").click());
    assert.equal(current(), "b", "another review saving does not lock this question");
    await act(async () => { secondPostResolve?.(); await new Promise(resolve => setTimeout(resolve, 40)); });
    await act(async () => button("다음").click());
    pendingForms = [form];
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["career-open-forms", "conversation"] });
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    assert.equal(current(), "b", "resolving the selected review displays the remaining question");
    await act(async () => button("닫기").click());
    assert.equal(current(), undefined, "the automatically selected question can still be closed");
    await act(async () => button("답변 대기 1개").click());
    assert.equal(current(), "b");
  } finally {
    await act(async () => root.unmount()); client.clear();
    await new Promise(resolve => setTimeout(resolve, 50)); dom.window.close();
    for (const [key, value] of previous) { if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key); }
  }
});

test("only proposals show decision buttons, including when a question carries legacy item or form actions", () => {
  const positive = { id: "accept", label: "적용", message: "적용해줘" };
  const negative = {
    id: "ignore",
    label: "적용하지 않기",
    message: "유지해줘",
  };
  const form: CareerForm = {
    formId: 42,
    revision: 1,
    kind: "suggestion",
    positive,
    negative,
    items: [],
  };
  const render = (type: string, withActions = true) => {
    const item = {
      id: "item",
      label: "확인할 내용",
      description: "정확히 작성하는 데 필요한 정보입니다.",
      type,
      content: {
        originalText: "원문",
        suggestedText: "수정안",
        options: [{ id: "one", label: "첫 선택" }],
      },
      positive: withActions ? positive : undefined,
      negative: withActions ? negative : undefined,
    };
    return renderToStaticMarkup(
      <MessagesProvider locale="ko">
        <CareerSuggestionItemView
          form={{
            ...form,
            positive: withActions ? positive : undefined,
            negative: withActions ? negative : undefined,
            items: [item],
          }}
          item={item}
          index={0}
          values={{ item: "수정안" }}
          text=""
          busy={false}
          onChangeText={() => {}}
          onChangeValue={() => {}}
          onNavigate={() => {}}
          onRespond={async () => {}}
          onClose={() => {}}
        />
      </MessagesProvider>
    );
  };
  for (const type of ["text", "textarea", "select"]) {
    const html = render(type);
    assert.doesNotMatch(html, /grid-cols-2/);
    assert.doesNotMatch(html, />적용<|>적용하지 않기</);
    assert.match(html, /건너뛰기/);
    assert.match(html, /정확히 작성하는 데 필요한 정보/);
  }
  for (const withActions of [true, false]) {
    const html = render("change", withActions);
    assert.equal(html.match(/>적용</g)?.length, 1);
    assert.equal(html.match(/>적용하지 않기</g)?.length, 1);
  }
});
