import { useCareerWorkspaceUiStore } from "@/store/useCareerWorkspaceUiStore";
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createCareerTurnProjection } from "@/hooks/career/careerTurnProjection";
import type { CareerMessage } from "@/components/career/types";
import { createRequire } from "node:module";
import { MessagesProvider } from "@/i18n/useMessage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { CareerChatPanelProvider, type CareerChatPanelContextValue } from "../CareerChatPanelContext";

test("turn renders Worked, ordered artifacts, final text and one footer; answer choices remain clickable", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/career", pretendToBeVisual: true });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  let copiedText = "";
  let deletedId: string | number | undefined;
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    navigator: Object.assign(dom.window.navigator, {
      clipboard: { writeText: async (text: string) => { copiedText = text; } },
    }),
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
    CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true,
    BroadcastChannel: undefined,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  dom.window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const root = createRoot(dom.window.document.getElementById("root")!);
  const require = createRequire(import.meta.url);
  const previousCssLoader = require.extensions[".css"];
  require.extensions[".css"] = module => { module.exports = {}; };
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  try {
    const { BrowserSessionProvider } = await import("../BrowserSessionDock");
    const { TimelineMessageList } = await import("./CareerTimelineSection");
    const base = { role: "assistant" as const, content: "", createdAt: "2026-11-05T00:00:01Z" };
    const messages: CareerMessage[] = [
      { ...base, id: 1, messageType: "career_turn_activity", workReplyId: "invocation:a", workStartedAt: base.createdAt, thinkingLogs: ["지원서 확인 중"], workPending: true },
      { ...base, id: 2, messageType: "browser_session", artifactReplyId: "invocation:a", browserSession: { sessionId: "browser-a" } },
      { ...base, id: 3, messageType: "career_form_presentation", artifactReplyId: "invocation:a", careerForm: { kind: "suggestion", formId: 30, revision: 1, title: "필수 정보 확인", items: [{ id: "visa", type: "text", label: "비자 지원 여부", content: "" }] } },
      { ...base, id: 4, messageType: "chat", workReplyId: "invocation:a", workPending: false, workCompletedAt: "2026-11-05T00:00:10Z", content: '최종 안내입니다. [[CAREER_CHOICE_BUTTONS]]["필요 없어요","현재 필요해요","향후 필요해요"][[/CAREER_CHOICE_BUTTONS]]' },
    ];
    // A cancellation reply belongs below the input that caused it.
    messages[0].workEvents = [{ id: "tool:0", kind: "tool", text: "지원서 확인 중", createdAt: base.createdAt }];
    let selected = "";
    const sessionId = "400fa005-eb70-4802-a2a8-6f22aaf809ec";
    messages[1].browserSession = { sessionId };
    client.setQueryData(["career-browser-dock", "fixture"], {
      sessions: [],
    });
    client.setQueryData(["career-form-references", "fixture", 30], { form: { ...messages[2].careerForm, state: "open" }, responses: [] });
    useCareerWorkspaceUiStore.setState({ conversationVersion: "professional" });
    const render = () => root.render(
      <RouterContext.Provider value={{ query: {}, pathname: "/career", asPath: "/career", isReady: true } as any}>
        <MessagesProvider locale="ko" persistPreference={false}>
          <QueryClientProvider client={client}>
          <CareerChatPanelProvider value={{ conversationId: "fixture", user: { id: "fixture" } } as CareerChatPanelContextValue}>
          <BrowserSessionProvider conversationId="fixture" enabled={false} messages={messages}>
          <TimelineMessageList messages={createCareerTurnProjection()(messages)} assistantTyping={false}
            thinkingLogsByMessageId={{}} isStartingCall={false} assistantChoiceActionsDisabled={false}
            onboardingWrapupPending={false} onOpenOpportunity={() => {}}
            onDeleteMessage={id => { deletedId = id; return true; }}
            onSelectAssistantChoice={selection => { selected = selection.choice; }} />
          </BrowserSessionProvider>
          </CareerChatPanelProvider>
          </QueryClientProvider>
        </MessagesProvider>
      </RouterContext.Provider>
    );
    await act(async () => render());
    const content = dom.window.document.body.textContent!;
    const positions = ["Worked", "Harper의 브라우저", "필수 정보 확인", "최종 안내입니다."].map(text => content.indexOf(text));
    assert.ok(positions.every(position => position >= 0), content);
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
    assert.equal(dom.window.document.querySelectorAll('[data-career-message-container="true"]').length, 1);
    assert.equal(dom.window.document.querySelectorAll('[data-career-message-actions="true"]').length, 1);
    const choice = [...dom.window.document.querySelectorAll("button")].find(button => button.textContent === "필요 없어요")!;
    assert.ok(choice);
    assert.equal(choice.disabled, false);
    await act(async () => choice.click());
    assert.equal(selected, "필요 없어요");
    const savedAnswer = { ...messages[3] };
    messages[3] = { ...messages[3], createdAt: "2026-11-05T00:00:10Z", workStartedAt: base.createdAt, content: "지원을 중단했어요." };
    messages.push({ id: 5, role: "user", content: "그만하라고", createdAt: "2026-11-05T00:00:05Z", messageType: "chat" });
    await act(async () => render());
    const interrupted = dom.window.document.body.textContent!;
    assert.ok(interrupted.indexOf("지원서 확인 중") < interrupted.indexOf("그만하라고"), interrupted);
    assert.ok(interrupted.indexOf("그만하라고") < interrupted.indexOf("지원을 중단했어요."), interrupted);
    assert.equal(dom.window.document.querySelectorAll('[data-career-message-actions="true"]').length, 2);
    messages.pop();
    messages[3] = savedAnswer;
    messages[3].content = `아래에서 JYP 채용 사이트에 로그인해 주세요. 로그인 후 **완료**를 누르시면 지원 준비를 이어갈게요.\n\n[[browser:${sessionId}]]`;
    client.setQueryData(["career-browser-dock", "fixture"], {
      sessions: [{ id: sessionId, status: "human", revision: 1 }],
    });
    await act(async () => render());
    const artifact = dom.window.document.querySelector<HTMLElement>('[data-browser-source="artifact"]')!;
    assert.equal(artifact.hidden, true, 'the generated browser record occupies no flex space');
    const anchor = dom.window.document.querySelector('[data-browser-inline-anchor]')!;
    assert.ok(anchor);
    assert.equal(anchor.getAttribute('data-browser-source'), 'reference');
    assert.equal(dom.window.document.querySelectorAll('[data-browser-inline-anchor]').length, 1);
    const footer = dom.window.document.querySelector('[data-career-message-actions="true"]')!;
    assert.ok(anchor.compareDocumentPosition(footer) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(dom.window.document.querySelectorAll('[data-career-message-actions="true"]').length, 1);

    // Stop before a final answer: the saved public activity is the reply.
    const activity = { ...messages[0], workPending: false, workCompletedAt: "2026-11-05T00:00:10Z",
      workEvents: [{ id: "message:0", kind: "message" as const, text: "서류를 확인할게요.", createdAt: base.createdAt },
        { id: "tool:1", kind: "tool" as const, text: "지원서 확인 중", createdAt: "2026-11-05T00:00:05Z" }] };
    messages.splice(0, messages.length,
      { ...base, id: 8, role: "user", content: "소개해 주세요", createdAt: "2026-11-05T00:00:00Z", turnStopped: true },
      activity);
    await act(async () => render());
    const stoppedRow = dom.window.document.querySelector('[data-career-message-role="assistant"]')!;
    const stopped = stoppedRow.querySelector('[role="status"]')!;
    assert.equal(stopped.textContent, "중단됨");
    const actions = stopped.nextElementSibling!;
    assert.equal(actions.getAttribute("data-career-message-actions"), "true");
    assert.equal(actions.querySelector("time")?.dateTime, activity.createdAt);
    await act(async () => actions.querySelector<HTMLButtonElement>('button[aria-label="메시지 복사"]')!.click());
    assert.equal(copiedText, "서류를 확인할게요.\n\n지원서 확인 중");
    const deleteButton = actions.querySelector<HTMLButtonElement>('button[aria-label="메시지 삭제"]')!;
    await act(async () => deleteButton.click());
    await act(async () => deleteButton.click());
    assert.equal(deletedId, activity.id);

    // An already closed browser may be the only visible output, with no Stop marker.
    messages.splice(0, messages.length, { ...activity, id: 21 }, {
      ...base, id: 22, messageType: "browser_session", artifactReplyId: activity.workReplyId,
      browserSession: { sessionId },
    });
    client.setQueryData(["career-browser-dock", "fixture"], {
      sessions: [], summaries: [{ id: sessionId, status: "closed", revision: 2 }],
    });
    await act(async () => render());
    const cardRow = dom.window.document.querySelector('[data-career-message-role="assistant"]')!;
    assert.match(cardRow.textContent!, /종료된 브라우저/);
    assert.doesNotMatch(cardRow.textContent!, /중단됨/);
    const trash = cardRow.querySelector<HTMLButtonElement>('button[aria-label="메시지 삭제"]')!;
    await act(async () => trash.click());
    await act(async () => trash.click());
    assert.equal(deletedId, 21);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    await require("@/lib/supabase").supabase.auth.stopAutoRefresh();
    await (await import("@/lib/supabase")).supabase.auth.stopAutoRefresh();
    if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
    else delete require.extensions[".css"];
    useCareerWorkspaceUiStore.setState({ conversationVersion: "professional" });
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
});

