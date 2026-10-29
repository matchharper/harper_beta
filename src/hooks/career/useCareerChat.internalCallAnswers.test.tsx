import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { User } from "@supabase/supabase-js";
import { MessagesProvider } from "@/i18n/useMessage";
import type { InternalCallChatSubmission } from "@/lib/career/internalCallAnswers";

test("written answers run a normal streamed chat turn, refresh profile/memory and retry without duplicating the user message", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { useCareerChat } = await import("./useCareerChat");
  const dom = new JSDOM("<html><body></body></html>", {
    url: "http://localhost/career",
  });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
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
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const send = (event: string, data: unknown) =>
    controller.enqueue(
      new TextEncoder().encode(
        `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      )
    );
  const requests: Record<string, unknown>[] = [];
  const contexts: unknown[] = [];
  const profiles: unknown[] = [];
  let api!: ReturnType<typeof useCareerChat>;
  let replay = false;
  const userMessage = {
    id: 11,
    role: "user",
    content:
      "Fixture · Engineer\n\n1. What did you build?\nA service.\n\n2. Why?\nSkipped",
    messageType: "chat",
    createdAt: "2026-10-28T00:00:00Z",
  };
  const assistantMessage = {
    id: 12,
    role: "assistant",
    content: "경험을 반영했어요.",
    messageType: "chat",
    createdAt: "2026-10-28T00:00:01Z",
  };
  const Harness = () => {
    api = useCareerChat({
      conversationId: "fixture-conversation",
      user: { id: "fixture-user" } as User,
      persistedMessages: [],
      sessionPending: false,
      onTalentContextsRefreshed: (value) => {
        contexts.push(value);
      },
      onTalentProfileRefreshed: (value) => {
        profiles.push(value);
      },
      fetchWithAuth: async (url, options) => {
        assert.equal(url, "/api/talent/chat");
        requests.push(JSON.parse(String(options?.body)));
        if (replay) return Response.json({ userMessage, assistantMessage });
        return new Response(
          new ReadableStream({
            start(c) {
              controller = c;
            },
          }),
          {
            headers: { "Content-Type": "text/event-stream" },
          }
        );
      },
    });
    return null;
  };
  const input: InternalCallChatSubmission = {
    callId: "fixture-call",
    questions: ["What did you build?", "Why?"],
    responses: [
      { questionIndex: 0, decision: "answer", text: "A service." },
      { questionIndex: 1, decision: "skip" },
    ],
  };
  let succeeded = 0,
    failed = 0;
  let pending!: Promise<void>;
  const submit = () => {
    pending = api.sendChatMessage({
      text: "",
      internalCallAnswerSubmission: input,
      onSuccess: () => {
        succeeded++;
      },
      onError: () => {
        failed++;
      },
    });
  };
  const root = createRoot(dom.window.document.body);
  try {
    await act(async () => {
      root.render(
        <MessagesProvider locale="ko">
          <Harness />
        </MessagesProvider>
      );
    });
    await act(async () => {
      api.setStage("chat");
    });
    await act(async () => {
      submit();
    });
    assert.equal(
      api.messages.some((m) => m.role === "user"),
      false,
      "no blank optimistic message"
    );
    assert.deepEqual(requests[0].internalCallAnswerSubmission, input);
    assert.equal(requests[0].allowedToolNames, undefined);
    await act(async () => {
      send("user_message", { message: userMessage });
    });
    assert.equal(
      succeeded,
      0,
      "saving a message is not completion of the reply"
    );
    await act(async () => {
      send("error", { error: "Provider unavailable" });
      controller.close();
      await pending;
    });
    assert.equal(succeeded, 0);
    assert.equal(failed, 1);
    assert.equal(api.messages.filter((m) => m.role === "user").length, 1);
    await act(async () => {
      submit();
    });
    await act(async () => {
      send("user_message", { message: userMessage });
      send("text_delta", { delta: assistantMessage.content });
      send("assistant_message", { message: assistantMessage });
      send("talent_profile", {
        talentMemories: [{ id: 1, content: "Built a service." }],
        talentProfile: { headline: "Engineer" },
      });
      send("done", { ok: true });
      controller.close();
      await pending;
    });
    assert.equal(succeeded, 1);
    assert.equal(api.messages.filter((m) => m.role === "user").length, 1);
    assert.equal(api.messages.filter((m) => String(m.id) === "12").length, 1);
    assert.equal(contexts.length, 1);
    assert.deepEqual(profiles, [{ headline: "Engineer" }]);
    replay = true;
    await act(async () => {
      submit();
      await pending;
    });
    assert.equal(succeeded, 2);
    assert.equal(api.messages.filter((m) => m.role === "user").length, 1);
    assert.equal(api.messages.filter((m) => String(m.id) === "12").length, 1);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
