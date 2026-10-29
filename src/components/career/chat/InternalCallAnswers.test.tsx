import React, { act } from "react";
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { MessagesProvider } from "@/i18n/useMessage";
import { supabase } from "@/lib/supabase";
import {
  CareerChatPanelProvider,
  type CareerChatPanelContextValue,
} from "../CareerChatPanelContext";
import {
  InternalCallAnswersProvider,
  InternalCallAnswersSlot,
  InternalCallWriteButton,
} from "./InternalCallAnswers";

test("Role writing shares the question UI, preserves drafts, supports skip/edit and retries submission", async () => {
  const dom = new JSDOM("<div id='root'></div>", {
    url: "http://localhost",
    pretendToBeVisual: true,
  });
  const names = [
    "window",
    "document",
    "HTMLElement",
    "HTMLTextAreaElement",
    "Event",
    "CustomEvent",
    "navigator",
    "sessionStorage",
    "getComputedStyle",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const previous = names.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
  );
  for (const key of names)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value:
        key === "IS_REACT_ACT_ENVIRONMENT"
          ? true
          : key === "getComputedStyle"
            ? dom.window.getComputedStyle.bind(dom.window)
            : (dom.window as unknown as Record<string, unknown>)[key],
    });
  const auth = mock.method(supabase.auth, "getSession", async () => ({
    data: { session: { access_token: "fixture" } },
    error: null,
  }));
  const requests: Record<string, unknown>[] = [];
  let fail = true;
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, options?: RequestInit) => {
      assert.notEqual(
        options?.method,
        "POST",
        "questionnaire submits through the normal chat sender"
      );
      return new Response(
        JSON.stringify({
          call: {
            id: "call",
            companyName: "Fixture",
            roleTitle: "Engineer",
            status: "pending",
            questions: ["What did you build?", "What would you change?"],
            submitted: false,
          },
        })
      );
    }
  );
  const root = createRoot(dom.window.document.getElementById("root")!);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const panel = {
    conversationId: "conversation",
    onSendChatMessage: async (args) => {
      requests.push(args.internalCallAnswerSubmission!);
      assert.equal(args.text, "");
      assert.equal(
        args.allowedToolNames,
        undefined,
        "normal Career tools remain available"
      );
      if (fail) args.onError?.();
      else args.onSuccess?.();
    },
    user: { id: "user" },
  } as CareerChatPanelContextValue;
  const button = (label: string) =>
    Array.from(dom.window.document.querySelectorAll("button")).find(
      (b) =>
        b.textContent?.trim() === label ||
        b.getAttribute("aria-label") === label
    )!;
  const render = () =>
    act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <RouterContext.Provider
            value={{ locale: "en", query: {} } as NextRouter}
          >
            <MessagesProvider locale="en">
              <CareerChatPanelProvider value={panel}>
                <InternalCallAnswersProvider>
                  <InternalCallWriteButton callId="call" />
                  <InternalCallAnswersSlot>
                    <span>Ordinary input</span>
                  </InternalCallAnswersSlot>
                </InternalCallAnswersProvider>
              </CareerChatPanelProvider>
            </MessagesProvider>
          </RouterContext.Provider>
        </QueryClientProvider>
      )
    );
  // Calling the React handler directly avoids JSDOM's incomplete textarea event plugin.
  const type = async (value: string) =>
    act(async () => {
      const textarea = dom.window.document.querySelector("textarea")!;
      const key = Object.keys(textarea).find((k) =>
        k.startsWith("__reactProps$")
      )!;
      (
        textarea as unknown as Record<
          string,
          { onChange: (event: unknown) => void }
        >
      )[key].onChange({ target: { value } });
    });
  try {
    await render();
    await act(async () => button("Write answers").click());
    assert.ok(
      dom.window.document.querySelector("[data-preparation-questions]")
    );
    assert.match(dom.window.document.body.textContent!, /1 \/ 2/);
    await type("Built a reliable service.\nKept the original words.");
    await act(async () => button("Close").click());
    await act(async () => button("Write answers").click());
    assert.match(
      dom.window.document.querySelector("textarea")!.value,
      /original words/
    );
    await act(async () =>
      dom.window.document
        .querySelector("form")!
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true })
        )
    );
    assert.match(dom.window.document.body.textContent!, /2 \/ 2/);
    await act(async () => button("Skip").click());
    assert.match(
      dom.window.document.body.textContent!,
      /Built a reliable service/
    );
    assert.equal(requests.length, 0);
    await act(async () => button("Edit answers").click());
    assert.match(
      dom.window.document.querySelector("textarea")!.value,
      /original words/
    );
    await act(async () =>
      dom.window.document
        .querySelector("form")!
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true })
        )
    );
    await act(async () => button("Submit").click());
    assert.ok(dom.window.document.querySelector("[role=alert]"));
    assert.match(dom.window.document.body.textContent!, /original words/);
    fail = false;
    await act(async () => button("Submit").click());
    assert.deepEqual(requests[0], requests[1]);
    assert.equal(
      (requests[0].responses as Array<{ decision: string }>)[1].decision,
      "skip"
    );
    assert.equal(button("Answered").disabled, true);
    assert.match(dom.window.document.body.textContent!, /Ordinary input/);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    auth.mock.restore();
    fetchMock.mock.restore();
    dom.window.close();
    for (const [key, value] of previous)
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
  }
});
