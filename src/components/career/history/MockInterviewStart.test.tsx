import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type {
  CareerCallStartRequest,
  CareerHistoryOpportunity,
} from "../types";

test("tracked stages open a voice-only modal; cancel, failed start and retry preserve the target", async () => {
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
    HTMLInputElement: dom.window.HTMLInputElement,
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
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value,
      writable: true,
    });
  const require = createRequire(import.meta.url);
  const { default: MockInterviewStart } = require("./MockInterviewStart");
  const { MessagesProvider } = require("@/i18n/useMessage");
  const root = createRoot(dom.window.document.getElementById("root")!);
  const button = (text: string) => {
    const found = [...dom.window.document.querySelectorAll("button")].find(
      (el) => el.textContent === text
    );
    assert.ok(found, text + " / " + dom.window.document.body.innerHTML);
    return found;
  };
  try {
    for (const stage of ["interested", "applied", "connected", "closed"]) {
      const calls: string[] = [];
      let success = false;
      const item = {
        id: stage,
        companyLogoUrl: null,
        companyName: "Example",
        title: "FDE",
        savedStage: stage,
      } as CareerHistoryOpportunity;
      await act(async () =>
        root.render(
          <MessagesProvider locale="ko">
            <MockInterviewStart
              key={stage}
              item={item}
              onStart={async (request: CareerCallStartRequest) => {
                assert.equal(typeof request, "object");
                if (typeof request === "object") {
                  calls.push(request.mockInterviewOpportunityId ?? "");
                  assert.deepEqual(request.mockInterviewDisplay, {
                    companyLogoUrl: null,
                    companyName: "Example",
                    roleTitle: "FDE",
                  });
                }
                return success;
              }}
            />
          </MessagesProvider>
        )
      );
      await act(async () => button("모의 인터뷰 해보기").click());
      assert.match(dom.window.document.body.textContent ?? "", /Example · FDE/);
      await act(async () => button("취소").click());
      assert.deepEqual(calls, []);
      await act(async () => button("모의 인터뷰 해보기").click());
      await act(async () => button("시작하기").click());
      assert.ok(dom.window.document.querySelector('[role="alert"]'));
      success = true;
      await act(async () => button("시작하기").click());
      assert.deepEqual(calls, [stage, stage]);
      assert.equal(dom.window.document.querySelector('[role="dialog"]'), null);
    }
  } finally {
    await act(async () => {
      root.unmount();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
