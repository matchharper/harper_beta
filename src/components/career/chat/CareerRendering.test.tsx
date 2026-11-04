import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import React, { act, memo } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { MessagesProvider } from "@/i18n/useMessage";
import {
  CareerChatPanelProvider,
  useCareerChatActivityContext,
  type CareerChatPanelCoreContextValue,
} from "../CareerChatPanelContext";
import type { CareerMessage } from "../types";
import {
  InternalCallAnswersProvider,
  useInternalCallAnswers,
} from "./InternalCallAnswers";
import { useEventCallback } from "@/hooks/useEventCallback";
import {
  CareerSidebarProvider,
  type CareerSidebarContextValue,
} from "../CareerSidebarContext";
import { Input, type InputProps } from "@/components/ui/input";

test("streaming leaves completed messages and activity subscribers untouched while events use current state", async () => {
  const require = createRequire(import.meta.url);
  const previousCssLoader = require.extensions[".css"];
  require.extensions[".css"] = (module) => {
    module.exports = {};
  };
  const { TimelineMessageList } = await import("./CareerTimelineSection");
  const { default: CareerComposerSection } =
    await import("./CareerComposerSection");
  const dom = new JSDOM("<div id='root'></div>", {
    url: "http://localhost",
    pretendToBeVisual: true,
  });
  dom.window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  const globals = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLTextAreaElement",
    "Element",
    "Node",
    "MutationObserver",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const previous = globals.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const key of globals)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value:
        key === "IS_REACT_ACT_ENVIRONMENT"
          ? true
          : (dom.window as unknown as Record<string, unknown>)[key],
    });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let completedContentReads = 0;
  let activityRenders = 0;
  let answerRenders = 0;
  let composerRenders = 0;
  const input = Input as unknown as {
    render: (
      props: InputProps,
      ref: React.ForwardedRef<HTMLInputElement>,
    ) => React.ReactNode;
  };
  const originalInputRender = input.render;
  input.render = (props, ref) => {
    if (props.type === "file") composerRenders++;
    return originalInputRender(props, ref);
  };
  let event: (() => string) | undefined;
  const Activity = memo(function Activity() {
    const { assistantTyping } = useCareerChatActivityContext();
    activityRenders++;
    return <span data-typing>{String(assistantTyping)}</span>;
  });
  const Answers = memo(function Answers() {
    useInternalCallAnswers();
    answerRenders++;
    return null;
  });
  function Event({ text }: { text: string }) {
    const callback = useEventCallback(() => text);
    if (event) assert.equal(callback, event);
    event = callback;
    return null;
  }
  const completed: CareerMessage = {
    id: "completed",
    role: "assistant",
    messageType: "chat",
    createdAt: "2026-10-30T00:00:00Z",
    get content() {
      completedContentReads++;
      return "Completed **answer**";
    },
  };
  const user: CareerMessage = {
    id: "user",
    role: "user",
    messageType: "chat",
    createdAt: "2026-10-30T00:01:00Z",
    content: "Continue",
  };
  const active: CareerMessage = {
    id: "active",
    role: "assistant",
    messageType: "chat",
    createdAt: "2026-10-30T00:02:00Z",
    content: "Streaming",
    typing: true,
  };
  const onOpenOpportunity = () => {};
  const onStartCallMode = async () => true;
  const onSendChatMessage = async () => {};
  const logs = {};
  const router = { query: {}, push: async () => true } as unknown as NextRouter;
  const sidebar = {
    user: null,
    stage: "chat",
    isOnboardingDone: false,
  } as CareerSidebarContextValue;
  const interviewProgress = { canForceComplete: false, percent: 0 };
  const scrollRef = { current: null };
  const render = (
    content: string,
    assistantTyping = true,
    initialChatDraft?: string,
  ) => {
    const messages = [
      completed,
      user,
      { ...active, content, typing: assistantTyping },
    ];
    const value = {
      conversationId: null,
      user: null,
      messages,
      assistantTyping,
      inputMode: "text",
      initialChatDraft,
      onSendChatMessage,
      interviewProgress,
      scrollRef,
    } as unknown as CareerChatPanelCoreContextValue;
    root.render(
      <RouterContext.Provider value={router}>
        <QueryClientProvider client={client}>
          <MessagesProvider locale="ko" persistPreference={false}>
            <CareerChatPanelProvider
              value={value}
              callValue={{
                voiceMuted: false,
                voiceTranscript: "",
                onToggleVoiceMute() {},
              }}
            >
              <CareerSidebarProvider value={sidebar}>
                <InternalCallAnswersProvider>
                  <Activity />
                  <Answers />
                  <Event text={content} />
                  <CareerComposerSection />
                  <TimelineMessageList
                    messages={messages}
                    assistantTyping={assistantTyping}
                    thinkingLogsByMessageId={logs}
                    isStartingCall={false}
                    assistantChoiceActionsDisabled={false}
                    onboardingWrapupPending={false}
                    onOpenOpportunity={onOpenOpportunity}
                    onStartCallMode={onStartCallMode}
                  />
                </InternalCallAnswersProvider>
              </CareerSidebarProvider>
            </CareerChatPanelProvider>
          </MessagesProvider>
        </QueryClientProvider>
      </RouterContext.Provider>,
    );
  };
  try {
    await act(async () => render("Streaming"));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 25)));
    assert.ok(completedContentReads > 0);
    const readsAfterMount = completedContentReads;
    const activitiesAfterMount = activityRenders;
    const answersAfterMount = answerRenders;
    const composerAfterMount = composerRenders;
    assert.ok(composerAfterMount > 0);
    for (let index = 1; index <= 5; index++) {
      await act(async () => render(`Streaming ${index}`));
      assert.equal(event?.(), `Streaming ${index}`);
    }
    assert.equal(
      completedContentReads,
      readsAfterMount,
      "completed Markdown must not render again",
    );
    assert.equal(
      activityRenders,
      activitiesAfterMount,
      "message deltas must not notify activity subscribers",
    );
    assert.equal(
      answerRenders,
      answersAfterMount,
      "message deltas must not invalidate the question context",
    );
    assert.equal(
      composerRenders,
      composerAfterMount,
      "message deltas must not rerender the composer input",
    );
    assert.match(dom.window.document.body.textContent ?? "", /Streaming 5/);
    await act(async () => render("Finished", false));
    assert.equal(
      activityRenders,
      activitiesAfterMount + 1,
      "actual activity changes must propagate",
    );
    assert.equal(completedContentReads, readsAfterMount);
    assert.ok(
      composerRenders > composerAfterMount,
      "the composer must still react to actual activity changes",
    );
    await act(async () => render("Finished", false, "Prepared draft"));
    assert.equal(
      dom.window.document.querySelector("textarea")?.value,
      "Prepared draft",
    );
    const { useCareerChat } = await import("@/hooks/career/useCareerChat");
    const saved: CareerMessage = {
      id: 42,
      role: "assistant",
      messageType: "chat",
      content: "Saved answer",
      createdAt: "2026-10-30T00:00:00Z",
      thinkingLogs: ["Completed search"],
    };
    const persistedMessages = [saved];
    let chat!: ReturnType<typeof useCareerChat>;
    function ChatState() {
      chat = useCareerChat({
        user: null,
        conversationId: null,
        sessionPending: false,
        persistedMessages,
        fetchWithAuth: async () => new Response(),
      });
      return null;
    }
    await act(async () =>
      root.render(
        <MessagesProvider locale="ko" persistPreference={false}>
          <ChatState />
        </MessagesProvider>,
      ),
    );
    await act(async () => chat.appendMessage(saved));
    const merged = chat.messages[0];
    await act(async () => chat.appendMessage({ ...active, id: 43 }));
    assert.equal(
      chat.messages[0],
      merged,
      "merging another message must preserve completed row identity",
    );
    await act(async () =>
      chat.appendMessage({ ...saved, content: "Updated answer" }),
    );
    assert.notEqual(chat.messages[0], merged);
    assert.equal(chat.messages[0].content, "Updated answer");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    input.render = originalInputRender;
    dom.window.close();
    if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
    else delete require.extensions[".css"];
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
