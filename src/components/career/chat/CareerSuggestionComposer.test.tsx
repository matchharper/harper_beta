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

test("suggestions collect locally, send one complete batch, and preserve the batch identity through a failed submission and reopen", async (t) => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/career",
  });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    sessionStorage: dom.window.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  t.mock.method(supabase.auth, "getSession", async () => ({
    data: { session: { access_token: "fixture" } },
    error: null,
  }));
  const form: CareerForm = {
    formId: 10,
    revision: 1,
    kind: "suggestion",
    title: "경험 보완",
    items: [
      {
        id: "first",
        label: "첫 경험",
        description:
          "실제 담당 범위를 확인해 경력 문장을 정확하게 쓰기 위한 질문입니다.",
        type: "textarea",
        content: {
          value: "",
          reason: "공고에서 관련 경험을 요구하고 있습니다.",
        },
        positive: { id: "answer", label: "답변", message: "반영해줘" },
      },
      {
        id: "second",
        label: "둘째 경험",
        description: "본인의 기여를 구체적으로 전달하는 수정안입니다.",
        type: "change",
        content: { originalText: "원문", suggestedText: "수정안" },
        positive: { id: "accept", label: "적용", message: "수정해줘" },
        negative: { id: "ignore", label: "적용하지 않기", message: "유지해줘" },
      },
      {
        id: "third",
        label: "다른 수정안",
        type: "change",
        description: "다른 문장을 확인합니다.",
        content: {
          originalText: "유지할 원문",
          suggestedText: "거절할 수정안",
        },
        positive: { id: "accept", label: "적용", message: "수정해줘" },
        negative: { id: "ignore", label: "적용하지 않기", message: "유지해줘" },
      },
      {
        id: "fourth",
        label: "추가 경험",
        type: "textarea",
        description: "관련 경험이 더 있는지 확인합니다.",
        content: "",
      },
    ],
  };
  const posts: any[] = [];
  const savedResponses: CareerFormResponse[] = [];
  let failNextSubmission = true;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init?: RequestInit) => {
      if (init?.method !== "POST")
        return Response.json({
          responses: savedResponses.map((response) => ({ response })),
        });
      const input = JSON.parse(String(init.body));
      posts.push(input);
      if (
        !savedResponses.some(
          (response) => response.requestId === input.requestId
        )
      )
        savedResponses.push({ ...input, formSnapshot: form });
      const payload = {
        message: {
          id: 101,
          content: "모든 항목의 응답",
          formResponse: savedResponses.find(
            (response) => response.requestId === input.requestId
          ),
        },
      };
      return Response.json(payload);
    }
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const chatSubmissions: Parameters<CareerChatPanelContextValue["onSendChatMessage"]>[0][] = [];
  const context = {
    conversationId: "conversation",
    user: { id: "user" },
    messages: [{ id: 10, role: "assistant", content: "", careerForm: form }],
    stage: "chat",
    onSendChatMessage: async (args: Parameters<CareerChatPanelContextValue["onSendChatMessage"]>[0]) => {
      chatSubmissions.push(args);
      if (failNextSubmission) {
        failNextSubmission = false;
        args.onError?.();
      } else args.onSuccess?.();
    },
  } as unknown as CareerChatPanelContextValue;
  const button = (label: string) =>
    [...dom.window.document.querySelectorAll("button")].find(
      (b) => b.textContent === label || [...b.querySelectorAll("span")].some(span => span.textContent === label)
    )!;
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <RouterContext.Provider value={{ locale: "ko", query: {} } as NextRouter}>
          <MessagesProvider locale="ko">
            <CareerChatPanelProvider value={context}>
              <CareerSuggestionProvider>
                <CareerSuggestionHistory form={form} />
                <CareerSuggestionComposerSlot>
                  <div data-ordinary-composer="" />
                </CareerSuggestionComposerSlot>
              </CareerSuggestionProvider>
            </CareerChatPanelProvider>
          </MessagesProvider>
          </RouterContext.Provider>
        </QueryClientProvider>
      )
    );
    assert.equal(
      dom.window.document.querySelector("[data-ordinary-composer]"),
      null
    );
    assert.equal(
      dom.window.document
        .querySelector("[data-suggestion-id]")
        ?.getAttribute("data-suggestion-id"),
      "first"
    );
    assert.match(
      dom.window.document.body.textContent!,
      /실제 담당 범위를 확인해 경력 문장을 정확하게/
    );
    assert.match(
      dom.window.document.body.textContent!,
      /공고에서 관련 경험을 요구/
    );
    const textarea = () =>
      dom.window.document.querySelector<HTMLTextAreaElement>(
        "[data-preparation-questions] form textarea"
      )!;
    const edit = (input: HTMLTextAreaElement, value: string) => {
      const key = Object.keys(input).find((key) =>
        key.startsWith("__reactProps$")
      )!;
      (input as any)[key].onChange({ target: { value } });
    };
    const keydown = (
      keyCode: number,
      isComposing = false,
      shiftKey = false
    ) => {
      const input = textarea();
      const key = Object.keys(input).find((key) =>
        key.startsWith("__reactProps$")
      )!;
      (input as any)[key].onKeyDown({
        key: "Enter",
        keyCode,
        shiftKey,
        repeat: false,
        nativeEvent: { isComposing },
        preventDefault() {},
      });
    };
    await act(async () => edit(textarea(), "확인된 경험"));
    const close = () =>
      dom.window.document
        .querySelector<HTMLButtonElement>('button[aria-label="닫기"]')!
        .click();
    await act(async () => close());
    await act(async () => button("경험 보완").click());
    assert.equal(
      textarea().value,
      "확인된 경험",
      "unsent reply survives closing and reopening"
    );
    await act(async () => keydown(229, true));
    await act(async () => keydown(13, false, true));
    assert.equal(
      posts.length,
      0,
      "IME confirmation and Shift+Enter do not submit"
    );
    await act(async () => keydown(13));
    assert.equal(
      posts.length,
      0,
      "an item reply is local and cannot start an agent turn"
    );
    assert.equal(
      dom.window.document
        .querySelector("[data-suggestion-id]")
        ?.getAttribute("data-suggestion-id"),
      "second"
    );
    assert.match(
      dom.window.document.body.textContent!,
      /본인의 기여를 구체적으로 전달/
    );
    const editProposal = () =>
      dom.window.document.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="제안 문구 수정"]'
      )!;
    const proposalScroll = editProposal().closest(
      '[class*="overflow-y-auto"]'
    )!;
    assert.ok(proposalScroll);
    assert.equal(
      proposalScroll.contains(button("적용")),
      false,
      "decision buttons remain outside the scrolling edit body"
    );
    assert.equal(
      dom.window.document.querySelector(
        "[data-preparation-questions] [data-career-form-id]"
      ),
      null,
      "the composer does not contain a nested form card"
    );
    await act(async () => edit(editProposal(), "직접 수정한 문장"));
    await act(async () => edit(textarea(), "수정안에 대한 질문"));
    await act(async () => close());
    await act(async () => button("경험 보완").click());
    assert.equal(editProposal().value, "직접 수정한 문장");
    assert.equal(textarea().value, "수정안에 대한 질문");
    await act(async () =>
      dom.window.document
        .querySelector<HTMLButtonElement>('button[aria-label="이전 항목"]')!
        .click()
    );
    assert.equal(
      textarea().value,
      "확인된 경험",
      "saved reply is restored from the exact form revision"
    );
    await act(async () => edit(textarea(), "확인된 최신 경험"));
    await act(async () =>
      dom.window.document
        .querySelector<HTMLButtonElement>('button[aria-label="다음 항목"]')!
        .click()
    );
    assert.equal(editProposal().value, "직접 수정한 문장");
    await act(async () => button("적용").click());
    assert.equal(posts.length, 0, "accepting a proposal is also local");
    assert.equal(
      dom.window.document
        .querySelector("[data-suggestion-id]")
        ?.getAttribute("data-suggestion-id"),
      "first",
      "editing an earlier answer makes that item outstanding again"
    );
    const next = () =>
      dom.window.document
        .querySelector<HTMLButtonElement>('button[aria-label="다음 항목"]')!
        .click();
    await act(async () => next());
    await act(async () => next());
    assert.equal(
      dom.window.document
        .querySelector("[data-suggestion-id]")
        ?.getAttribute("data-suggestion-id"),
      "third"
    );
    await act(async () => button("적용하지 않기").click());
    assert.equal(posts.length, 0, "rejecting a proposal is local");
    await act(async () => next());
    await act(async () => next());
    await act(async () => next());
    assert.equal(
      dom.window.document
        .querySelector("[data-suggestion-id]")
        ?.getAttribute("data-suggestion-id"),
      "fourth"
    );
    await act(async () => button("건너뛰기").click());
    assert.equal(
      posts.length,
      0,
      "reaching the last item cannot submit an unconfirmed earlier edit"
    );
    assert.equal(textarea().value, "확인된 최신 경험");
    await act(async () => keydown(13));
    assert.equal(
      posts.length,
      1,
      "only handling the final outstanding item submits a request"
    );
    assert.equal(posts[0].itemId, undefined);
    assert.equal(chatSubmissions.length, 1);
    assert.equal(chatSubmissions[0].formResponseMessageId, 101);
    assert.equal(chatSubmissions[0].text, "모든 항목의 응답");
    assert.equal(posts[0].actionId, undefined);
    assert.deepEqual(posts[0].values, {});
    assert.deepEqual(posts[0].answers, [
      { itemId: "first", message: "확인된 최신 경험", values: {} },
      {
        itemId: "second",
        actionId: "accept",
        values: { second: "직접 수정한 문장" },
      },
      {
        itemId: "third",
        actionId: "ignore",
        values: { third: "거절할 수정안" },
      },
      { itemId: "fourth", skipped: true, message: "건너뛰기", values: {} },
    ]);
    assert.ok(
      dom.window.document.querySelector('[role="alert"]'),
      "a failed continuation remains retryable"
    );
    assert.equal(
      dom.window.document.querySelector("[data-ordinary-composer]"),
      null
    );
    await act(async () => close());
    await act(async () => button("경험 보완").click());
    assert.equal(
      dom.window.document
        .querySelector("[data-suggestion-id]")
        ?.getAttribute("data-suggestion-id"),
      "first"
    );
    await act(async () => keydown(13));
    assert.equal(posts.length, 2);
    assert.equal(chatSubmissions.length, 2);
    assert.equal(chatSubmissions[1].formResponseMessageId, 101);
    assert.deepEqual(
      posts[1],
      posts[0],
      "a retry after remount preserves the entire batch and request identity"
    );
    assert.equal(
      savedResponses.length,
      1,
      "the batch corresponds to one user message"
    );
    assert.ok(dom.window.document.querySelector("[data-ordinary-composer]"));
    await act(async () => button("경험 보완").click());
    assert.ok(
      dom.window.document.querySelector("[data-preparation-questions]")
    );
    await act(async () =>
      dom.window.document
        .querySelector<HTMLButtonElement>('button[aria-label="닫기"]')!
        .click()
    );
    assert.ok(dom.window.document.querySelector("[data-ordinary-composer]"));
  } finally {
    await act(async () => root.unmount());
    client.clear();
    dom.window.close();
    for (const [key, value] of previous) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("only unanswered questions in the current reply open automatically; history can reopen older questions until the next user message", async (t) => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/career" });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
    Event: dom.window.Event, CustomEvent: dom.window.CustomEvent,
    sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.mock.method(supabase.auth, "getSession", async () => ({
    data: { session: { access_token: "fixture" } }, error: null,
  }));
  t.mock.method(globalThis, "fetch", async () => Response.json({ responses: [] }));
  const oldForm: CareerForm = {
    formId: 10, revision: 1, kind: "suggestion", title: "지난 지원 질문",
    items: [{ id: "old", type: "textarea", label: "지난 경험", content: "" }],
  };
  const newForm: CareerForm = {
    ...oldForm, formId: 20, title: "최근 지원 질문",
    items: [{ id: "new", type: "textarea", label: "최근 경험", content: "" }],
  };
  type Message = CareerChatPanelContextValue["messages"][number];
  const message = (id: number | string, role: Message["role"], content: string): Message => ({
    id, role, content, messageType: "chat", createdAt: "2026-11-02T01:00:00Z",
  });
  const history: Message[] = [
    message(1, "user", "첫 지원을 도와줘"),
    message(9, "assistant", "경험을 알려주세요."),
    { ...message(10, "assistant", ""), careerForm: oldForm },
  ];
  let messages = history;
  let mount = 0;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = () => act(async () => root.render(
    <QueryClientProvider client={client}>
      <RouterContext.Provider value={{ locale: "ko", query: {} } as NextRouter}>
      <MessagesProvider locale="ko">
        <CareerChatPanelProvider value={{
          conversationId: "visibility", user: { id: "user" }, messages, stage: "chat",
        } as CareerChatPanelContextValue}>
          <CareerSuggestionProvider key={mount}>
            <CareerSuggestionHistory form={oldForm} />
            <CareerSuggestionComposerSlot><div data-ordinary-composer="" /></CareerSuggestionComposerSlot>
          </CareerSuggestionProvider>
        </CareerChatPanelProvider>
      </MessagesProvider>
      </RouterContext.Provider>
    </QueryClientProvider>
  ));
  const activeItem = () => dom.window.document.querySelector("[data-suggestion-id]")?.getAttribute("data-suggestion-id");
  const openHistory = () => act(async () => {
    [...dom.window.document.querySelectorAll("button")].find(button => button.textContent?.includes("지난 지원 질문"))!.click();
  });
  try {
    await render();
    assert.equal(activeItem(), "old");
    messages = [...history, message("temp-user-1", "user", "다른 회사부터 볼게")];
    await render();
    assert.equal(activeItem(), undefined, "an ordinary optimistic user message closes the question immediately");
    messages = [...history, message(11, "user", "다른 회사부터 볼게"), message(12, "assistant", "다른 회사들을 살펴볼게요.")];
    await render();
    assert.equal(activeItem(), undefined, "a later reply without questions cannot revive old questions");
    mount++;
    await render();
    assert.equal(activeItem(), undefined, "returning to the conversation does not revive old questions");
    await openHistory();
    assert.equal(activeItem(), "old", "history explicitly reopens an old question");
    messages = [...messages, message(13, "user", "그 질문은 나중에")];
    await render();
    assert.equal(activeItem(), undefined, "a later user message also clears a manual selection");
    messages = [...messages, message(19, "assistant", "새 질문에 답해주세요."), { ...message(20, "assistant", ""), careerForm: newForm }];
    await render();
    assert.equal(activeItem(), "new", "only the current reply is eligible, despite older unanswered questions");
    messages = [...messages, { ...message(21, "user", "답변했어요"), formResponse: {
      formId: 20, revision: 1, values: {}, requestId: "answer", formSnapshot: newForm,
      answers: [{ itemId: "new", values: {}, message: "경험" }],
    } }];
    await render();
    assert.equal(activeItem(), undefined);
    mount++;
    await render();
    assert.equal(activeItem(), undefined, "answered questions stay closed on return");
    messages = [...messages, message(22, "assistant", "답변을 반영했어요."), { ...message(23, "assistant", ""), careerForm: newForm }];
    await render();
    assert.equal(activeItem(), undefined, "re-presenting an answered revision does not automatically open it");
    await openHistory();
    assert.equal(activeItem(), "old");
    await act(async () => dom.window.document.querySelector<HTMLButtonElement>('button[aria-label="닫기"]')!.click());
    assert.ok(dom.window.document.querySelector("[data-ordinary-composer]"));
  } finally {
    await act(async () => root.unmount());
    client.clear();
    dom.window.close();
    for (const [key, value] of previous) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
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
