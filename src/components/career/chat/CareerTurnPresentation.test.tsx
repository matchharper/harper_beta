import { createRequire } from "node:module";
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { MessagesProvider } from "@/i18n/useMessage";
import type { CareerMessage } from "@/components/career/types";
import { createCareerMessageMerger } from "@/hooks/career/careerMessageMerge";

test("work shows one live step line while professional text stays mounted across tool steps, history races and completion", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-key";
  const dom = new JSDOM("<div id='root'></div>", {
    url: "http://localhost/career",
  });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    CustomEvent: dom.window.CustomEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  dom.window.matchMedia = (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as any;
  const require = createRequire(import.meta.url);
  const previousCss = require.extensions[".css"];
  require.extensions[".css"] = (module) => {
    module.exports = {};
  };
  const { TimelineMessageList } = await import("./CareerTimelineSection");
  if (previousCss) require.extensions[".css"] = previousCss;
  else delete require.extensions[".css"];
  const root = createRoot(dom.window.document.getElementById("root")!);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const router = {
    query: {},
    pathname: "/career",
    asPath: "/career",
    push: async () => true,
  } as any;
  const startedAt = new Date(Date.now() - 20_000).toISOString();
  const first: CareerMessage = {
    id: "stream-assistant-1",
    role: "assistant",
    content: "",
    workEvents: [{ id: "message:0", kind: "message", text: "이력서를 확인할게요." }],
    messageType: "career_turn_activity",
    createdAt: startedAt,
    workStartedAt: startedAt,
    workReplyId: "message:1",
    workPending: true,
    thinkingLogs: ["이력서 읽는 중"],
    typing: false,
    typingMode: "stream",
  };
  const render = async (messages: CareerMessage[]) =>
    act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <RouterContext.Provider value={router}>
            <MessagesProvider locale="ko">
              <TimelineMessageList
                messages={messages}
                assistantTyping={false}
                thinkingLogsByMessageId={{}}
                isStartingCall={false}
                assistantChoiceActionsDisabled={false}
                onboardingWrapupPending={false}
                onOpenOpportunity={() => {}}
              />
            </MessagesProvider>
          </RouterContext.Provider>
        </QueryClientProvider>
      )
    );
  try {
    await render([first]);
    const owner = dom.window.document.querySelector(
      "[data-career-message-container]"
    )!;
    const bubble = owner.querySelector("[data-chat-message-bubble]")!;
    const paragraph = bubble.querySelector("p")!;
    assert.ok(paragraph);
    assert.match(owner.textContent!, /이력서를 확인할게요\.20s/);
    assert.ok(paragraph.closest("[hidden]"), "working folds the steps under one live line");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    assert.match(owner.textContent!, /이력서를 확인할게요\.21s/);
    const next = {
      ...first,
      workEvents: [...first.workEvents!,
        { id: "tool:0", kind: "tool" as const, text: "이력서 읽는 중" },
        { id: "message:2", kind: "message" as const, text: "경험을 확인했어요." },
      ],
      thinkingLogs: ["이력서 읽는 중", "문서 수정 중"],
    };
    const merger = createCareerMessageMerger();
    await render(merger([{ ...first, id: 2, typing: false }], [next]));
    assert.equal(
      dom.window.document.querySelectorAll("[data-career-message-container]")
        .length,
      1
    );
    assert.equal(owner.querySelector("[data-chat-message-bubble]"), bubble);
    assert.equal(bubble.querySelector("p"), paragraph);
    assert.match(owner.textContent!, /경험을 확인했어요/);
    const steps = owner.querySelector("ol")!.textContent!;
    assert.ok(steps.indexOf("이력서 읽는 중") < steps.indexOf("경험을 확인했어요."));
    const completed = {
      ...next,
      id: 4,
      content: "최종 결과예요.",
      messageType: "chat",
      typing: false,
      workPending: false,
      workCompletedAt: new Date(Date.parse(startedAt) + 22_000).toISOString(),
    };
    await render([completed]);
    assert.equal(
      dom.window.document.querySelector("[data-career-message-container]"),
      owner
    );
    assert.equal(owner.querySelector("[data-chat-message-bubble]"), bubble);
    assert.equal(bubble.querySelector("p"), paragraph);
    assert.match(owner.textContent!, /Worked for 22s/);
    assert.ok(paragraph.closest("[hidden]"), "completion folds the log without unmounting its prose");
    await act(async () => (owner.querySelector("[aria-expanded]") as HTMLElement).click());
    assert.equal(paragraph.closest("[hidden]"), null);
    assert.equal(bubble.querySelector("p"), paragraph);
    assert.match(owner.textContent!, /최종 결과예요/);
    await render([
      completed,
      {
        ...completed,
        id: 3,
        workReplyId: "message:2",
        content: "다른 요청의 답변이에요.",
      },
    ]);
    assert.equal(
      dom.window.document.querySelectorAll("[data-career-message-container]")
        .length,
      2
    );
    await render([{ ...completed, workEvents: [], thinkingLogs: ["기존 도구 로그"] }]);
    assert.match(owner.textContent!, /기존 도구 로그/);
    assert.match(owner.textContent!, /Worked for 22s/);

    await render([{ ...completed, workEvents: [], thinkingLogs: [] }]);
    assert.match(owner.textContent!, /Thought for 22s/);
    assert.doesNotMatch(owner.textContent!, /Worked/);
    assert.equal(owner.querySelector("[aria-expanded]"), null);
    await render([{ ...completed, workPending: true, workEvents: [], thinkingLogs: [] }]);
    assert.match(owner.textContent!, /Thinking\d+s/);
    assert.equal(owner.querySelector("[aria-expanded]"), null);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
