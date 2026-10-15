import assert from "node:assert/strict";
import test, { mock } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { supabase } from "@/lib/supabase";
import { MessagesProvider } from "@/i18n/useMessage";
import {
  CareerChatPanelProvider,
  type CareerChatPanelContextValue,
} from "../CareerChatPanelContext";
import {
  ApplicationPreparationProvider,
  useApplicationPreparation,
} from "./ApplicationPreparationContext";
import { createSimulationSession } from "@/lib/career/simulation/session";
import { createPreparation } from "@/lib/career/simulation/preparation";
import type { SessionRecord } from "@/lib/career/simulation/sessionStore";

test("preparation refreshes background work without polling idle sessions or chat tokens", async (context) => {
  const dom = new JSDOM("<div id='root'></div>", {
    url: "http://localhost",
  });
  const globals = ["Event", "CustomEvent", "window", "document", "navigator", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = globals.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
  );
  for (const key of globals) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === "IS_REACT_ACT_ENVIRONMENT"
        ? true
        : (dom.window as unknown as Record<string, unknown>)[key],
    });
  }
  context.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const auth = mock.method(supabase.auth, "getSession", async () => ({
    data: { session: { access_token: "test" } },
    error: null,
  }));
  const state = createSimulationSession({
    roleRef: "job:polling-test",
    roleName: "Engineer",
    documentId: null,
    documentName: null,
  });
  state.analysisStatus = "completed";
  state.preparation = createPreparation();
  let serverRecord: SessionRecord | null = { messageId: 10, state };
  let getCount = 0;
  let releaseRequest: (() => void) | undefined;
  let pauseRequest = false;
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    getCount++;
    if (pauseRequest) await new Promise<void>((resolve) => { releaseRequest = resolve; });
    return Response.json({ session: serverRecord, drafts: [] });
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  let controls: ReturnType<typeof useApplicationPreparation>;
  function Capture() {
    controls = useApplicationPreparation();
    return null;
  }
  let panel = {
    conversationId: "polling-conversation",
    messages: [],
    chatPending: false,
    onSendChatMessage: async () => {},
  } as unknown as CareerChatPanelContextValue;
  let providerKey = 0;
  const render = async () => {
    await act(async () => {
      root.render(
        <MessagesProvider locale="ko">
          <CareerChatPanelProvider value={panel}>
            <ApplicationPreparationProvider key={providerKey}>
              <Capture />
            </ApplicationPreparationProvider>
          </CareerChatPanelProvider>
        </MessagesProvider>
      );
    });
  };
  const tick = async (ms: number) => {
    await act(async () => { context.mock.timers.tick(ms); });
  };
  const refreshFromChat = async () => {
    panel = { ...panel, chatPending: true };
    await render();
    panel = { ...panel, chatPending: false };
    await render();
  };
  try {
    await render();
    assert.equal(getCount, 1, "load the existing session once");
    await tick(30_000);
    assert.equal(getCount, 1, "an active session awaiting input needs no repeated requests");

    for (const running of ["analysis", "draft", "continuation", "inspection", "browser"] as const) {
      serverRecord = structuredClone(serverRecord!);
      const next = serverRecord.state;
      next.revision++;
      next.analysisStatus = running === "analysis" ? "running" : "completed";
      next.applicationInspection = running === "inspection" ? { status: "running", runId: "inspection", startedAt: new Date().toISOString() } : undefined;
      next.preparation!.generation.status = running === "draft" ? "running" : "idle";
      next.activity = {
        version: 1, offerId: 1, outputs: {},
        batches: running === "continuation" ? [{
          id: "batch", key: "batch", purpose: "Prepare", itemIds: [],
          status: "submitted", continuation: "running", responses: {},
          createdAt: new Date().toISOString(),
        }] : [],
      };
      next.browser = running === "browser" ? {
        id: "browser", status: "queued", startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), documentId: "cv", documentHash: "hash",
        url: "https://example.com/apply", purpose: "Apply",
      } : undefined;
      await refreshFromChat();
      const before: number = getCount;
      await tick(3000);
      assert.equal(getCount, before + 1, `${running} refreshes while working`);
      if (running === "inspection") {
        panel = { ...panel, chatPending: true };
        await render();
        const duringChat: number = getCount;
        await tick(3000);
        assert.equal(getCount, duringChat + 1, "inspection keeps refreshing while the submitted chat waits for it");
        panel = { ...panel, chatPending: false };
        await render();
      }
      serverRecord = structuredClone(serverRecord);
      serverRecord.state.revision++;
      serverRecord.state.analysisStatus = "completed";
      if (serverRecord.state.applicationInspection) serverRecord.state.applicationInspection.status = "completed";
      serverRecord.state.preparation!.generation.status = "ready";
      serverRecord.state.activity!.batches = [];
      if (serverRecord.state.browser) serverRecord.state.browser.status = "waiting";
      await tick(3000);
      const after: number = getCount;
      await tick(30_000);
      assert.equal(getCount, after, `${running} stops when work is done or awaiting input`);
    }

    const beforeTokens = getCount;
    panel = { ...panel, chatPending: true };
    await render();
    for (let token = 0; token < 5; token++) {
      panel = { ...panel, messages: [{ id: 20, role: "assistant", messageType: "chat", content: `token ${token}`, createdAt: "now" }] };
      await render();
    }
    await tick(30_000);
    assert.equal(getCount, beforeTokens, "the chat stream owns progress while it is open");
    panel = { ...panel, chatPending: false };
    await render();
    assert.equal(getCount, beforeTokens + 1, "reload after the chat stream finishes");
    panel = { ...panel, messages: [...panel.messages] };
    await render();
    assert.equal(getCount, beforeTokens + 1, "equivalent message arrays do not trigger another request");

    serverRecord = structuredClone(serverRecord!);
    serverRecord.state.revision++;
    serverRecord.state.browser!.status = "running";
    await refreshFromChat();
    pauseRequest = true;
    const beforeSlow = getCount;
    await tick(3000);
    await tick(30_000);
    assert.equal(getCount, beforeSlow + 1, "slow polls do not overlap");
    pauseRequest = false;
    serverRecord.state.browser!.status = "succeeded";
    await act(async () => { releaseRequest!(); });
    await tick(3000);
    assert.equal(getCount, beforeSlow + 2, "fetch the final browser output before stopping");
    serverRecord.state.browser!.resultMessageId = 30;
    await tick(3000);
    const afterResult = getCount;
    await tick(30_000);
    assert.equal(getCount, afterResult, "stop after the final result is persisted");
    assert.equal(controls!.record!.state.browser!.resultMessageId, 30);

    panel = { ...panel, chatPending: true };
    providerKey++;
    const beforeRemount = getCount;
    await render();
    assert.equal(getCount, beforeRemount + 1, "a mobile/desktop remount loads persisted activity during an in-flight turn");
    assert.equal(controls!.record!.messageId, 10);
    assert.equal(controls!.record!.state.browser!.resultMessageId, 30);
    await tick(30_000);
    assert.equal(getCount, beforeRemount + 1, "hydration does not start polling settled activity during chat");

    serverRecord = null;
    await refreshFromChat();
    const withoutSession = getCount;
    await tick(30_000);
    assert.equal(getCount, withoutSession, "conversations without a session do not poll");
    assert.equal(controls!.record, null);
  } finally {
    await act(async () => root.unmount());
    context.mock.timers.reset();
    fetchMock.mock.restore();
    auth.mock.restore();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
