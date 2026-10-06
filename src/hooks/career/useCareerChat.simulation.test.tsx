import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { User } from "@supabase/supabase-js";
import { MessagesProvider } from "@/i18n/useMessage";
import type { ApplicationSimulation } from "@/lib/career/simulation/types";

test("simulation SSE updates one card before the chat turn completes", async () => {
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
  let api!: ReturnType<typeof useCareerChat>;
  const committed: unknown[] = [];
  const Harness = () => {
    api = useCareerChat({
      conversationId: "test-conversation",
      user: { id: "test-user" } as User,
      persistedMessages: [],
      sessionPending: false,
      onMessagesChanged: (messages) => {
        committed.push(...messages);
      },
      fetchWithAuth: async () =>
        new Response(
          new ReadableStream({
            start(c) {
              controller = c;
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } }
        ),
    });
    return null;
  };
  const root = createRoot(dom.window.document.body);
  const state: ApplicationSimulation = {
    version: 1,
    status: "running",
    roleName: "Design lead",
    documentName: "CV.pdf",
    updatedAt: new Date().toISOString(),
    steps: [
      { key: "role", status: "running" },
      { key: "comparison", status: "pending" },
      { key: "review", status: "pending" },
    ],
  };
  const message = {
    id: 22,
    role: "assistant",
    content: "Simulate",
    messageType: "application_simulation",
    simulation: state,
    createdAt: state.updatedAt,
  };
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
      void api.sendChatMessage({ text: "이 롤로 simulate 해줘" });
    });
    await act(async () => {
      send("simulation_message", { message });
    });
    assert.equal(api.chatPending, true);
    assert.equal(api.messages.filter((m) => m.simulation).length, 1);
    assert.equal(
      api.messages.find((m) => m.simulation)?.simulation?.steps[0].status,
      "running"
    );
    state.steps[0] = {
      key: "role",
      status: "completed",
      result: { summary: "Role rubric ready", report: "Evidence table" },
    };
    state.steps[1].status = "running";
    await act(async () => {
      send("simulation_message", { message });
    });
    assert.equal(api.chatPending, true);
    assert.equal(api.messages.filter((m) => m.simulation).length, 1);
    assert.equal(
      api.messages.find((m) => m.simulation)?.simulation?.steps[0].result
        ?.report,
      "Evidence table"
    );
    assert.equal(committed.length, 2);
    await act(async () => {
      controller.close();
    });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
