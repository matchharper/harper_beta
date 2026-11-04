import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { MessagesProvider } from "@/i18n/useMessage";
import CareerMessageBubble from "@/components/career/chat/CareerMessageBubble";
import type { CareerMessagePayload } from "@/components/career/types";
import {
  useCareerSessionReengagementState,
  type CareerSessionReengagementState,
} from "./useCareerSessionReengagement";

test("return text renders before completion, commits once, and clears on silent/error/superseded turns", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/career",
  });
  const previous = new Map(
    [
      "window",
      "document",
      "Event",
      "CustomEvent",
      "IS_REACT_ACT_ENVIRONMENT",
    ].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  );
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    Event: { configurable: true, value: dom.window.Event },
    CustomEvent: { configurable: true, value: dom.window.CustomEvent },
    IS_REACT_ACT_ENVIRONMENT: {
      configurable: true,
      value: true,
      writable: true,
    },
  });
  let state!: CareerSessionReengagementState;
  let append!: (messages: CareerMessagePayload[]) => void;
  function Harness() {
    state = useCareerSessionReengagementState();
    const [saved, setSaved] = useState<CareerMessagePayload[]>([]);
    append = (incoming) =>
      setSaved((current) => [
        ...new Map(
          [...current, ...incoming].map((message) => [message.id, message])
        ).values(),
      ]);
    return (
      <>
        {[...saved, ...(state.streamMessage ? [state.streamMessage] : [])].map(
          (message) => (
            <div key={message.id} data-message={message.id}>
              <CareerMessageBubble isUser={false} message={message} />
            </div>
          )
        )}
      </>
    );
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const encoder = new TextEncoder();
  const begin = () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
      }),
      { headers: { "content-type": "text/event-stream" } }
    );
    const completion = state.readResponse(response, append);
    // Attach immediately so expected failures never become unhandled rejections.
    const outcome = completion.then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error })
    );
    return {
      outcome,
      send: async (event: string, data: unknown) => {
        await act(async () => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        });
      },
      close: async () => {
        await act(async () => {
          controller.close();
          await outcome;
        });
      },
    };
  };
  const message = (id: number, content: string): CareerMessagePayload => ({
    id,
    content,
    role: "assistant",
    messageType: "chat",
    createdAt: new Date().toISOString(),
  });
  try {
    await act(async () =>
      root.render(
        <RouterContext.Provider
          value={
            { isReady: true, query: {}, pathname: "/career" } as NextRouter
          }
        >
          <MessagesProvider locale="ko">
            <Harness />
          </MessagesProvider>
        </RouterContext.Provider>
      )
    );
    const stream = begin();
    await stream.send("text_delta", { delta: "다시 오셨네요." });
    assert.equal(state.streamMessage?.typingMode, "stream");
    assert.match(dom.window.document.body.textContent!, /다시 오셨네요/);
    await stream.send("text_delta", { delta: " 포지션을 확인할게요." });
    const progress = message(1, "다시 오셨네요. 포지션을 확인할게요.");
    await stream.send("assistant_message", { message: progress });
    assert.equal(state.streamMessage, null);
    await stream.send("text_delta", { delta: "추천할 포지션이 있어요." });
    assert.equal(
      dom.window.document.querySelectorAll("[data-message]").length,
      2
    );
    await stream.send("text_delta", {
      delta:
        '\n[[CAREER_REENGAGEMENT_ACTIONS]]{"actions":[]}[[/CAREER_REENGAGEMENT_ACTIONS]]',
    });
    assert.doesNotMatch(
      dom.window.document.body.textContent!,
      /CAREER_REENGAGEMENT|actions/
    );
    const final = message(2, "추천할 포지션이 있어요.");
    await stream.send("reengagement_result", {
      assistantMessages: [progress, final],
    });
    await stream.send("done", { ok: true });
    await stream.close();
    assert.equal((await stream.outcome).error, null);
    assert.equal(state.streamMessage, null);
    assert.equal(
      dom.window.document.querySelectorAll("[data-message]").length,
      2
    );

    const silent = begin();
    await silent.send("text_delta", { delta: "__NO_SESSION_" });
    await silent.send("text_delta", { delta: "GREETING__" });
    assert.equal(state.streamMessage, null);
    await silent.send("reengagement_result", {
      assistantMessages: [],
      noMessage: true,
    });
    await silent.send("done", { ok: true });
    await silent.close();

    for (const event of ["error", "disconnect", "superseded"] as const) {
      const pending = begin();
      await pending.send("text_delta", { delta: "작성 중인 메시지" });
      if (event === "error")
        await pending.send("error", { error: "fixture failure" });
      if (event === "superseded") {
        await act(async () => state.clearAction());
        await pending.send("text_delta", { delta: " 무시할 늦은 토큰" });
        await pending.send("reengagement_result", {
          assistantMessages: [message(3, "늦은 메시지")],
        });
        await pending.send("done", { ok: true });
      }
      await pending.close();
      assert.equal(state.streamMessage, null);
      assert.equal(
        dom.window.document.querySelectorAll("[data-message]").length,
        2
      );
      assert.equal(
        Boolean((await pending.outcome).error),
        event !== "superseded"
      );
    }
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
