import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrgAgentDraftSnapshot } from "@/lib/org/agent/chatQueue";
// Load the Supabase client before the fake window exists, so it does not start
// a browser token-refresh timer that keeps the test process alive.
import "@/lib/supabase";

test("while Harper answers: the input stays open, stop sits next to send, and handed-back drafts return", async (t) => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/org/role" });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    KeyboardEvent: dom.window.KeyboardEvent,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  dom.window.requestAnimationFrame = (callback: FrameRequestCallback) =>
    dom.window.setTimeout(() => callback(0), 0) as unknown as number;
  dom.window.localStorage.setItem("harper:org-locale", "ko");
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
  const require = createRequire(import.meta.url);
  const previousCssLoader = require.extensions[".css"];
  require.extensions[".css"] = (module) => { module.exports = {}; };
  t.after(() => {
    if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
    else delete require.extensions[".css"];
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  });

  const { createRoot } = await import("react-dom/client");
  const { OrgLocaleProvider } = await import("@/i18n/org/OrgLocaleProvider");
  const { OrgAgentComposer } = await import("./OrgAgentComposer");
  const { DEFAULT_ORG_AGENT_MODEL } = await import("@/lib/org/agent/modelConfig");
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const sent: Array<{ message: string; draft: OrgAgentDraftSnapshot }> = [];
  let stops = 0;
  let pendingRestores: OrgAgentDraftSnapshot[] = [];
  const props = {
    isStreaming: true,
    queueWhileStreaming: true,
    restoreDrafts: [] as OrgAgentDraftSnapshot[],
  };
  const render = () =>
    act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <OrgLocaleProvider>
            <OrgAgentComposer
              isStreaming={props.isStreaming}
              model={DEFAULT_ORG_AGENT_MODEL}
              onModelChange={() => {}}
              onSend={({ draft, message }) => {
                sent.push({ draft, message });
              }}
              onStop={() => stops++}
              onTakeRestoreDrafts={() => {
                const drafts = pendingRestores;
                pendingRestores = [];
                return drafts;
              }}
              queueWhileStreaming={props.queueWhileStreaming}
              restoreDrafts={props.restoreDrafts}
              workspaceId=""
            />
          </OrgLocaleProvider>
        </QueryClientProvider>
      );
    });
  const textarea = () => dom.window.document.querySelector("textarea")!;
  const button = (label: string) =>
    dom.window.document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const type = (value: string) =>
    act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!;
      setValue.call(textarea(), value);
      textarea().dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });

  try {
    await render();
    assert.equal(textarea().disabled, false, "the input stays open while Harper answers");
    assert.ok(button("답변 멈추기"), "stop shows while Harper answers");
    assert.equal(button("메시지 보내기"), null, "with nothing written, only stop shows");

    await act(async () => { button("답변 멈추기")!.click(); });
    assert.equal(stops, 1);

    await type("이것도 봐 줘");
    assert.ok(button("메시지 보내기"), "something written: send shows next to stop");
    await act(async () => {
      textarea().dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.deepEqual(sent.map((item) => item.message), ["이것도 봐 줘"]);
    assert.equal(sent[0].draft.text, "이것도 봐 줘", "the input as it was goes along, to come back if needed");
    assert.equal(textarea().value, "", "the input is free for the next message");

    // A send that never reached the conversation comes back in front of what is being written.
    await type("새로 쓰는 중");
    pendingRestores = [{ attachments: [], text: "돌아온 메시지", tokens: [] }];
    props.restoreDrafts = pendingRestores;
    await render();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(textarea().value, "돌아온 메시지\n\n새로 쓰는 중");
    assert.deepEqual(pendingRestores, [], "the drafts were taken once");

    // Elsewhere (role creation), the input still locks while Harper answers.
    props.queueWhileStreaming = false;
    props.restoreDrafts = [];
    await render();
    assert.equal(textarea().disabled, true);
    assert.equal(button("답변 멈추기"), null);
  } finally {
    await act(async () => { root.unmount(); });
    client.clear();
  }
});
