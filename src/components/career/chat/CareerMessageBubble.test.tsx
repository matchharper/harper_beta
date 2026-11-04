import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCareerWorkspaceUiStore } from "@/store/useCareerWorkspaceUiStore";
import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { JSDOM } from "jsdom";

import { MessagesProvider } from "@/i18n/useMessage";
import { toUiMessage } from "@/hooks/career/careerHelpers";
import type { CareerMessage } from "@/components/career/types";
import { appendCareerOpportunityMentionMetadata } from "@/lib/career/opportunityMentionText";
import { toTalentMessageResponse } from "@/lib/talentOnboarding/models";
import CareerMessageBubble from "./CareerMessageBubble";
import { choiceRepliesByMessageId } from "@/lib/career/latestChoiceMessage";

const router: NextRouter = {
  query: {},
  isReady: true,
  pathname: "/career",
  asPath: "/career",
  basePath: "",
  route: "/career",
  push: async () => true,
  replace: async () => true,
  reload() {},
  back() {},
  forward() {},
  prefetch: async () => {},
  beforePopState() {},
  isFallback: false,
  isPreview: false,
  isLocaleDomain: false,
  events: { on() {}, off() {}, emit() {} },
};

test("choice selection follows sent history through reload, failure removal and later turns", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/career" });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent,
    IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let root = createRoot(dom.window.document.getElementById("root")!);
  const question: CareerMessage = { id: "question", role: "assistant", messageType: "chat",
    createdAt: "2026-11-04T01:00:00Z",
    content: '어떻게 할까요?[[bubble]][[CAREER_CHOICE_BUTTONS]]{"choices":[{"label":"진행","value":"진행해 주세요"},"보류"]}[[/CAREER_CHOICE_BUTTONS]]' };
  const reply: CareerMessage = { id: "reply", role: "user", messageType: "chat",
    createdAt: "2026-11-04T01:00:01Z", content: "진행해 주세요" };
  const followup: CareerMessage = { ...question, id: "followup", content: "진행할게요." };
  let history = [question];
  const render = async () => {
    const replies = choiceRepliesByMessageId(history);
    await act(async () => root.render(<RouterContext.Provider value={router}><MessagesProvider locale="ko">
      {history.map(message => <CareerMessageBubble key={message.id} message={message} isUser={message.role === "user"}
        selectedAssistantChoice={replies.get(String(message.id))} choiceActionsDisabled={history.length > 1}
        onSelectAssistantChoice={selection => { history = [...history, { ...reply, id: "temp-user-reply", content: selection.choice }]; }} />)}
    </MessagesProvider></RouterContext.Provider>));
  };
  const choice = () => [...dom.window.document.querySelectorAll("button")].find(button => button.textContent === "진행")!;
  const verify = (selected: boolean) => {
    assert.equal(choice().getAttribute("aria-pressed"), String(selected));
    assert.equal(Boolean(choice().querySelector("svg.lucide-check")), selected);
    if (selected) {
      assert.ok(choice().classList.contains("border-black"));
      assert.ok(choice().classList.contains("bg-bg-floating"));
      assert.ok(choice().classList.contains("text-neutral-primary"));
      assert.ok(choice().querySelector(".rounded-full.bg-action.text-white"));
      assert.ok(choice().disabled);
    }
  };
  try {
    useCareerWorkspaceUiStore.setState({ conversationVersion: "friendly" });
    await render();
    verify(false);
    await act(async () => choice().click());
    await render();
    verify(true);
    history = [question]; // Failed admission removes the optimistic user message.
    await render();
    verify(false);
    history = [question, reply, followup];
    await render();
    verify(true);
    await act(async () => root.unmount());
    root = createRoot(dom.window.document.getElementById("root")!);
    history = JSON.parse(JSON.stringify(history)); // Reloaded message payloads.
    await render();
    verify(true);
    await act(async () => useCareerWorkspaceUiStore.setState({ conversationVersion: "professional" }));
    verify(true);
    history = [question, { ...reply, content: "다른 질문이 있어요" }];
    await render();
    verify(false);
  } finally {
    await act(async () => root.unmount());
    useCareerWorkspaceUiStore.setState({ conversationVersion: "professional" });
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("Career message links keep role designs, destinations, navigation and icon fallback", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://matchharper.com/career" });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const destinations: unknown[] = [];
  const linkRouter = { ...router, push: async (href: unknown) => { destinations.push(href); return true; } };
  const external = "https://example.com/news?ref=chat#details";
  const internal = "https://matchharper.com/career/profile";
  try {
    await act(async () => {
      root.render(
        <RouterContext.Provider value={linkRouter}>
          <MessagesProvider locale="ko">
            {[true, false].map((isUser) => (
              <div key={String(isUser)} data-author={isUser ? "user" : "assistant"}>
                <CareerMessageBubble isUser={isUser} message={{
                  id: isUser ? "user-links" : "assistant-links",
                  role: isUser ? "user" : "assistant",
                  content: isUser
                    ? `**literal**\n${external}\n${internal}`
                    : `[**공식 발표**](${external})\n\n[프로필](${internal}) · [이메일](mailto:hello@example.com)`,
                  messageType: "chat",
                  createdAt: "2026-11-03T00:00:00Z",
                }} />
              </div>
            ))}
          </MessagesProvider>
        </RouterContext.Provider>
      );
    });
    const user = dom.window.document.querySelector('[data-author="user"]')!;
    const assistant = dom.window.document.querySelector('[data-author="assistant"]')!;
    const userLink = user.querySelector("a")!;
    const assistantLink = assistant.querySelector("a")!;
    assert.equal(userLink.getAttribute("href"), external);
    assert.equal(assistantLink.getAttribute("href"), external);
    assert.equal(userLink.textContent, external);
    assert.equal(assistantLink.textContent, "공식 발표");
    assert.notEqual(userLink.className, assistantLink.className);
    assert.equal(user.querySelector("button")?.classList.contains("text-accent-500"), true);
    assert.equal(assistant.querySelector("button")?.classList.contains("text-action"), true);
    assert.equal(user.querySelector("img"), null);
    assert.ok(user.textContent?.startsWith("**literal**\n"));
    assert.equal(assistant.querySelector('a[href^="mailto:"]'), null);
    assert.ok(assistant.textContent?.includes("이메일"));
    assert.equal(assistantLink.querySelector("img")?.getAttribute("src"), "https://www.google.com/s2/favicons?domain=example.com&sz=32");
    await act(async () => {
      user.querySelector("button")!.click();
      assistant.querySelector("button")!.click();
      assistantLink.querySelector("img")!.dispatchEvent(new dom.window.Event("error"));
    });
    assert.deepEqual(destinations, ["/career/profile", "/career/profile"]);
    assert.equal(assistantLink.querySelector("img"), null);
    assert.ok(assistantLink.querySelector("svg"));
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("saved form artifact reaches the assistant bubble with its editable initial content", () => {
  const message = toUiMessage(toTalentMessageResponse({
    id: 404, conversation_id: "conversation", user_id: "user", role: "assistant", content: "", message_type: "career_form", created_at: "2026-10-29T00:00:00Z",
    payload: { formId: 404, revision: 3, kind: "form", title: "지원 내용 확인", items: [{ id: "answer", label: "관련 경험", type: "textarea", content: { value: "저장된 초기 답변" } }], positive: { id: "continue", label: "이 내용으로 진행", message: "이 내용으로 진행해줘." } },
  }));
  const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><RouterContext.Provider value={router}><MessagesProvider locale="ko"><CareerMessageBubble isUser={false} message={message} /></MessagesProvider></RouterContext.Provider></QueryClientProvider>);
  const dom = new JSDOM(html);
  assert.equal(dom.window.document.querySelector("textarea")?.value, "저장된 초기 답변");
  assert.equal(dom.window.document.querySelector("[data-career-form-revision]")?.getAttribute("data-career-form-revision"), "3");
  assert.match(dom.window.document.body.textContent ?? "", /이 내용으로 진행/);
  dom.window.close();
});

test("user opportunity mentions keep text-action in immediate and restored messages", () => {
  const opportunityMentions = [
    { label: "Example · AI Research Engineer", roleId: "role-short" },
    { label: "Example · AI Research Engineer (Search & Agent) (경력) 채용", roleId: "role-long" },
    { label: "Other · Platform Engineer", roleId: "role-other" },
  ];
  const content = `${opportunityMentions[1].label}에 하퍼와 함께 지원하고 싶어. 지원 준비를 시작해줘.\n${opportunityMentions[2].label}와 ${opportunityMentions[1].label}도 비교해줘. https://example.com`;
  const immediate: CareerMessage = {
    id: "temp-user-mention",
    role: "user",
    content,
    opportunityMentions,
    messageType: "chat",
    createdAt: "2026-10-29T00:00:00.000Z",
  };
  const restored = toUiMessage(toTalentMessageResponse({
    id: 123,
    conversation_id: "conversation",
    user_id: "user",
    role: "user",
    content: appendCareerOpportunityMentionMetadata(content, opportunityMentions),
    message_type: "chat",
    created_at: immediate.createdAt,
  }));
  assert.deepEqual(restored.opportunityMentions, opportunityMentions);

  for (const message of [immediate, restored, { ...immediate, opportunityMentions: undefined }]) {
    const html = renderToStaticMarkup(
      <RouterContext.Provider value={router}>
        <MessagesProvider locale="ko">
          <CareerMessageBubble isUser message={message} />
        </MessagesProvider>
      </RouterContext.Provider>
    );
    const dom = new JSDOM(html);
    try {
      assert.deepEqual(
        [...dom.window.document.querySelectorAll("span.text-action")].map((node) => node.textContent),
        message.opportunityMentions
          ? [opportunityMentions[1].label, opportunityMentions[2].label, opportunityMentions[1].label]
          : []
      );
      assert.ok(dom.window.document.body.textContent?.includes("에 하퍼와 함께 지원하고 싶어. 지원 준비를 시작해줘."));
      assert.ok(dom.window.document.querySelector('a[href="https://example.com"]'));
      assert.doesNotMatch(dom.window.document.body.textContent ?? "", /HARPER_OPPORTUNITY_MENTIONS|role-short|role-long|role-other/);
    } finally {
      dom.window.close();
    }
  }
});

test("renders completed markdown spans while an assistant message is streaming", () => {
  const html = renderToStaticMarkup(
    <RouterContext.Provider value={router}>
      <MessagesProvider locale="ko">
        <CareerMessageBubble
          isUser={false}
          message={{
            id: "streaming-assistant",
            role: "assistant",
            content: "**굵게** ~~취소선~~ `코드`",
            messageType: "chat",
            createdAt: "2026-09-22T00:00:00.000Z",
            typing: true,
            typingMode: "stream",
          }}
        />
      </MessagesProvider>
    </RouterContext.Provider>
  );

  assert.match(html, /<strong[^>]*>굵게<\/strong>/);
  assert.match(html, /<del>취소선<\/del>/);
  assert.match(html, /<code[^>]*>코드<\/code>/);
  assert.doesNotMatch(html, /\*\*굵게\*\*|~~취소선~~/);
});

test("Career user and assistant bubbles cap at 700px and assistant Markdown uses the Career variant", () => {
  for (const isUser of [true, false]) {
    const html = renderToStaticMarkup(
      <RouterContext.Provider value={router}>
        <MessagesProvider locale="ko">
          <CareerMessageBubble
            isUser={isUser}
            message={{
              id: "width-preview",
              role: isUser ? "user" : "assistant",
              content:
                "# Fieldguide\n\n[회사 소개](https://example.com/company)",
              messageType: "chat",
              createdAt: "2026-09-23T00:00:00.000Z",
            }}
          />
        </MessagesProvider>
      </RouterContext.Provider>
    );
    assert.match(html, /max-w-\[min\(700px,/);
    assert.doesNotMatch(html, /max-w-\[min\((?:820|920)px,/);
    if (!isUser) {
      assert.match(html, /<h1[^>]*text-xl font-medium/);
      assert.match(html, /data-rich-text-reference="true"/);
      assert.match(html, /s2\/favicons/);
    }
  }
});


test("friendly stream reveals complete bubbles and keeps choice identity across settlement and version switches", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://matchharper.com/career" });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const selected: unknown[] = [];
  const render = async (content: string, typing = true, isUser = false) => {
    await act(async () => root.render(<RouterContext.Provider value={router}><MessagesProvider locale="ko">
      <CareerMessageBubble isUser={isUser} onSelectAssistantChoice={s => { selected.push(s); }} message={{
        id: "original-message", role: isUser ? "user" : "assistant", content, typing, typingMode: "stream", messageType: "chat", createdAt: "2026-11-03T00:00:00Z",
      }} />
    </MessagesProvider></RouterContext.Provider>));
  };
  try {
    useCareerWorkspaceUiStore.setState({ conversationVersion: "friendly" });
    await render("첫 소식이에요![[bub");
    assert.ok(!dom.window.document.body.textContent?.includes("첫 소식"));
    await render("첫 소식이에요![[bubble]]두 번째 소식");
    assert.ok(dom.window.document.body.textContent?.includes("첫 소식이에요!"));
    assert.ok(!dom.window.document.body.textContent?.includes("두 번째"));
    const first = dom.window.document.querySelector("article");
    await render("첫 소식이에요![[bubble]]두 번째 소식도 준비했어요!");
    assert.equal(dom.window.document.querySelector("article"), first);
    await render('첫 소식이에요![[bubble]]더 볼까요?\n[[CAREER_CHOICE_BUTTONS]]\n{"choices":["네, 볼게요", "다음에 볼게요"]}\n[[/CAREER_CHOICE_BUTTONS]]', false);
    assert.equal(dom.window.document.querySelectorAll("article").length, 2);
    assert.ok(!dom.window.document.body.textContent?.includes("[["));
    assert.ok(dom.window.document.querySelector("article")?.className.includes("career-bubble-enter"));
    const choice = [...dom.window.document.querySelectorAll("button")].find(b => b.textContent?.includes("네, 볼게요"));
    assert.ok(choice);
    await act(async () => choice.click());
    assert.equal((selected[0] as { assistantMessageId: string }).assistantMessageId, "original-message");
    await act(async () => useCareerWorkspaceUiStore.setState({ conversationVersion: "professional" }));
    assert.equal(dom.window.document.querySelectorAll("article").length, 1);
    assert.ok(!dom.window.document.body.textContent?.includes("[[bubble]]"));
    await render("사용자 원문 [[bubble]]", false, true);
    assert.ok(dom.window.document.body.textContent?.includes("[[bubble]]"));
    assert.ok(dom.window.document.querySelector("article")?.className.includes("md:my-0"));
  } finally {
    await act(async () => root.unmount());
    useCareerWorkspaceUiStore.setState({ conversationVersion: "professional" });
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
