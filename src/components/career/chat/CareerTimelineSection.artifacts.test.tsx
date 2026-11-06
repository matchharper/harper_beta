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
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";

test("turn renders Worked, ordered artifacts, final text and one footer; answer choices remain clickable", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/career", pretendToBeVisual: true });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
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
  try {
    const { TimelineMessageList } = await import("./CareerTimelineSection");
    const base = { role: "assistant" as const, content: "", createdAt: "2026-11-05T00:00:01Z" };
    const messages: CareerMessage[] = [
      { ...base, id: 1, messageType: "career_turn_activity", workReplyId: "invocation:a", workStartedAt: base.createdAt, thinkingLogs: ["지원서 확인 중"], workPending: true },
      { ...base, id: 2, messageType: "browser_session", artifactReplyId: "invocation:a", browserSession: { sessionId: "browser-a" } },
      { ...base, id: 3, messageType: "career_form_presentation", artifactReplyId: "invocation:a", careerForm: { kind: "suggestion", formId: 30, revision: 1, title: "필수 정보 확인", items: [{ id: "visa", type: "text", label: "비자 지원 여부", content: "" }] } },
      { ...base, id: 4, messageType: "chat", workReplyId: "invocation:a", workPending: false, workCompletedAt: "2026-11-05T00:00:10Z", content: '최종 안내입니다. [[CAREER_CHOICE_BUTTONS]]["필요 없어요","현재 필요해요","향후 필요해요"][[/CAREER_CHOICE_BUTTONS]]' },
    ];
    let selected = "";
    useCareerWorkspaceUiStore.setState({ conversationVersion: "professional" });
    await act(async () => root.render(
      <RouterContext.Provider value={{ query: {}, pathname: "/career", asPath: "/career", isReady: true } as any}>
        <MessagesProvider locale="ko" persistPreference={false}>
          <TimelineMessageList messages={createCareerTurnProjection()(messages)} assistantTyping={false}
            thinkingLogsByMessageId={{}} isStartingCall={false} assistantChoiceActionsDisabled={false}
            onboardingWrapupPending={false} onOpenOpportunity={() => {}}
            onSelectAssistantChoice={selection => { selected = selection.choice; }} />
        </MessagesProvider>
      </RouterContext.Provider>
    ));
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
  } finally {
    await act(async () => root.unmount());
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

