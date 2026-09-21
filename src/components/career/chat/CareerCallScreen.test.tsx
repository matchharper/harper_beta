import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

test("mock interview call shows the company identity below Harper", async () => {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id='root'></div></body></html>",
    { url: "http://localhost", pretendToBeVisual: true }
  );
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    Event: dom.window.Event,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    DocumentFragment: dom.window.DocumentFragment,
    MutationObserver: dom.window.MutationObserver,
    CustomEvent: dom.window.CustomEvent,
    NodeFilter: dom.window.NodeFilter,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  );
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value,
      writable: true,
    });
  }

  const require = createRequire(import.meta.url);
  const previousCssLoader = require.extensions[".css"];
  require.extensions[".css"] = (module) => {
    module.exports = {};
  };
  const { default: CareerCallScreen } = require("./CareerCallScreen");
  const { CareerChatPanelProvider } = require("../CareerChatPanelContext");
  const { MessagesProvider } = require("@/i18n/useMessage");
  const root = createRoot(dom.window.document.getElementById("root")!);

  try {
    await act(async () => {
      root.render(
        <MessagesProvider locale="ko">
          <CareerChatPanelProvider
            value={
              {
                forceCompletePending: false,
                interviewProgress: {
                  canForceComplete: false,
                  filledCount: 2,
                  percent: 20,
                  remainingCount: 8,
                  totalCount: 10,
                },
                isOnboardingDone: false,
                onboardingWrapupPending: false,
              } as never
            }
            callValue={{
              callConnectionStatus: "connected",
              callTranscriptEntries: [],
              isAssistantSpeaking: false,
              isVoiceToolExecuting: false,
              liveUserTranscriptPlacement: "beforeCurrentAssistant",
              mockInterviewDisplay: {
                companyLogoUrl: "https://example.com/logo.png",
                companyName: "Example Company",
                roleTitle: "Staff Engineer",
              },
              onEndCallMode: () => {},
              onToggleVoiceMute: () => {},
              voiceActiveToolNames: [],
              voiceMuted: false,
              voiceTranscript: "",
            }}
          >
            <CareerCallScreen />
          </CareerChatPanelProvider>
        </MessagesProvider>
      );
    });

    const text = dom.window.document.body.textContent ?? "";
    assert.match(text, /Harper/);
    assert.match(text, /Example Company/);
    assert.match(text, /Staff Engineer/);
    assert.ok(dom.window.document.querySelector('img[alt="Example Company"]'));
    assert.equal(
      dom.window.document.querySelector('[role="progressbar"]'),
      null
    );
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
    else Reflect.deleteProperty(require.extensions, ".css");
    dom.window.close();
  }
});
