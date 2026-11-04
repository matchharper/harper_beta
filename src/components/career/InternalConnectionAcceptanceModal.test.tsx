import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { MessagesProvider } from "@/i18n/useMessage";
import { OpportunityType } from "@/lib/opportunityType";
import type { CareerHistoryOpportunity } from "./types";

test("introduction dialog shows the actual default or prepared sharing selection and submits the candidate note", async () => {
  const dom = new JSDOM("<div id='root'></div>", {
    url: "http://localhost",
    pretendToBeVisual: true,
  });
  const globals = {
    window: dom.window,
    self: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    MutationObserver: dom.window.MutationObserver,
    CustomEvent: dom.window.CustomEvent,
    Event: dom.window.Event,
    getComputedStyle: dom.window.getComputedStyle,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = Object.keys(globals).map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const modules = Module as unknown as {
    _load: (request: string, ...args: any[]) => any;
  };
  const load = modules._load;
  modules._load = function (request, ...args) {
    if (request === "@/components/common/TalentCareerModal")
      return ({ children, footer }: any) => (
        <div>
          {children}
          {footer}
        </div>
      );
    return load.call(this, request, ...args);
  };
  let Modal: typeof import("./InternalConnectionAcceptanceModal").default;
  try {
    Modal = (await import("./InternalConnectionAcceptanceModal")).default;
  } finally {
    modules._load = load;
  }

  const root = createRoot(dom.window.document.getElementById("root")!);
  const notes: (string | null)[] = [];
  const base = {
    id: "rec",
    roleId: "role",
    title: "Platform Engineer",
    companyName: "Example",
    isInternal: true,
    opportunityType: OpportunityType.InternalRecommendation,
    feedbackReason: "Please mention my infrastructure experience.",
  } as unknown as CareerHistoryOpportunity;
  try {
    for (const prepared of [false, true]) {
      await act(async () =>
        root.render(
          <MessagesProvider locale="ko" persistPreference={false}>
            <Modal
              isOnboardingComplete
              item={{
                ...base,
                acceptanceMaterial: {
                  materialId: prepared ? "prepared-material" : null,
                  assignmentRevision: 2,
                  selectionRef: "reviewed-version",
                  profileTitle: prepared ? "플랫폼 소개용" : "기본 프로필",
                  documentNames: ["Platform Resume.pdf"],
                },
              }}
              onAccept={async (note) => {
                notes.push(note);
                return false;
              }}
              onClose={() => {}}
              onStartCall={() => {}}
              onStartChat={() => {}}
            />
          </MessagesProvider>
        )
      );
      const body = dom.window.document.body.textContent ?? "";
      assert.ok(body.includes("회사의 에이전트"));
      assert.ok(body.includes(prepared ? "플랫폼 소개용" : "기본 프로필"));
      assert.ok(body.includes("Platform Resume.pdf"));
    }
    await act(async () => {
      dom.window.document
        .querySelector("form")!
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true })
        );
    });
    assert.deepEqual(notes, ["Please mention my infrastructure experience."]);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
