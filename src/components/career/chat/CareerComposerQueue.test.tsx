import React, { act } from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import {
  CareerChatPanelProvider,
  type CareerChatPanelContextValue,
} from "../CareerChatPanelContext";
import {
  CareerSidebarProvider,
  type CareerSidebarContextValue,
} from "../CareerSidebarContext";
import { MessagesProvider } from "@/i18n/useMessage";

test("Cmd/Ctrl+Enter queues a message until the running turn ends", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon-key";
  const { default: CareerComposerSection } =
    await import("./CareerComposerSection");
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  Object.assign(dom.window.HTMLElement.prototype, {
    attachEvent() {},
    detachEvent() {},
  });
  const globals = [
    "window",
    "document",
    "HTMLElement",
    "HTMLTextAreaElement",
    "navigator",
    "getComputedStyle",
    "Event",
    "CustomEvent",
    "KeyboardEvent",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const previous = globals.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
  );
  for (const key of globals)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value:
        key === "IS_REACT_ACT_ENVIRONMENT"
          ? true
          : key === "getComputedStyle"
            ? dom.window.getComputedStyle.bind(dom.window)
            : (dom.window as unknown as Record<string, unknown>)[key],
    });
  dom.window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  // Load react-dom after the DOM exists so it uses native input events.
  const { createRoot } = await import("react-dom/client");
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const sent: string[] = [];
  // A real send resolves only after its reply stream settles.
  const replies: (() => void)[] = [];
  const settleReplies = () =>
    act(async () => {
      for (const settle of replies.splice(0)) settle();
    });
  let cancelled = 0;
  const doc = dom.window.document;
  const render = (canStopChat: boolean) =>
    act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <RouterContext.Provider value={{ locale: "ko", query: {} } as NextRouter}>
            <CareerSidebarProvider value={{} as CareerSidebarContextValue}>
              <MessagesProvider locale="ko">
                <CareerChatPanelProvider
                  value={
                    {
                      messages: [],
                      user: { id: "fixture" },
                      conversationId: "fixture-conversation",
                      stage: "chat",
                      inputMode: "text",
                      isOnboardingDone: true,
                      pendingActionsOverride: [],
                      interviewProgress: { percent: 100 },
                      scrollRef: { current: null },
                      canStopChat,
                      onCancelChat: () => {
                        cancelled += 1;
                      },
                      onSendChatMessage: async (
                        input: Parameters<CareerChatPanelContextValue["onSendChatMessage"]>[0]
                      ) => {
                        sent.push(input.text);
                        await new Promise<void>((resolve) => replies.push(resolve));
                      },
                    } as unknown as CareerChatPanelContextValue
                  }
                >
                  <CareerComposerSection />
                </CareerChatPanelProvider>
              </MessagesProvider>
            </CareerSidebarProvider>
          </RouterContext.Provider>
        </QueryClientProvider>
      )
    );
  const type = async (value: string) => {
    const textarea = doc.querySelector("textarea")!;
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      "value"
    )!.set!;
    await act(async () => {
      setter.call(textarea, value);
      textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  };
  const press = (init: KeyboardEventInit) =>
    act(async () => {
      doc.querySelector("textarea")!.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init })
      );
    });
  const queuedTexts = () =>
    [...doc.querySelectorAll("ol li")]
      // A closing region keeps its last rows hidden while it animates out.
      .filter((item) => !item.closest('[aria-hidden="true"]'))
      .map((item) => item.textContent);
  try {
    // While a turn runs, plain Enter still sends right away.
    await render(true);
    await type("지금 바로");
    await press({});
    assert.deepEqual(sent, ["지금 바로"]);

    await type("첫 번째");
    await press({ metaKey: true });
    await type("두 번째");
    await press({ ctrlKey: true });
    await type("지울 것");
    await press({ metaKey: true });
    assert.deepEqual(sent, ["지금 바로"]);
    assert.equal(doc.querySelector("textarea")!.value, "");
    assert.ok(doc.querySelector('ol[aria-label="답변이 끝나면 보낼 메시지"]'));
    assert.deepEqual(queuedTexts(), ["첫 번째", "두 번째", "지울 것"]);

    const removeButtons = doc.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="보낼 메시지에서 빼기"]'
    );
    await act(async () => removeButtons[2].click());
    assert.deepEqual(queuedTexts(), ["첫 번째", "두 번째"]);

    // The turn ends: only the first queued message goes; it starts the next turn.
    await render(false);
    assert.deepEqual(sent, ["지금 바로", "첫 번째"]);
    await render(true);
    await settleReplies();
    assert.deepEqual(sent, ["지금 바로", "첫 번째"]);
    assert.deepEqual(queuedTexts(), ["두 번째"]);
    await render(false);
    assert.deepEqual(sent, ["지금 바로", "첫 번째", "두 번째"]);
    assert.deepEqual(queuedTexts(), []);
    await settleReplies();

    // With no running turn, Cmd+Enter just sends.
    await type("바로 전송");
    await press({ metaKey: true });
    assert.deepEqual(sent.at(-1), "바로 전송");

    // Stopping the turn drops the queue as well.
    await render(true);
    // While typing during a turn, only the send button shows.
    assert.ok(doc.querySelector('button[aria-label="중단"]'));
    await type("중단되면 사라짐");
    assert.equal(doc.querySelector('button[aria-label="중단"]'), null);
    assert.ok(doc.querySelector('button[aria-label="메시지 보내기"]'));
    await press({ metaKey: true });
    assert.deepEqual(queuedTexts(), ["중단되면 사라짐"]);
    await act(async () =>
      doc.querySelector<HTMLButtonElement>('button[aria-label="중단"]')!.click()
    );
    assert.equal(cancelled, 1);
    assert.deepEqual(queuedTexts(), []);
    await render(false);
    assert.equal(sent.at(-1), "바로 전송");
  } finally {
    await act(async () => root.unmount());
    queryClient.clear();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
