import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

test("ending requires confirmation, blocks duplicate requests, and keeps failures retryable", async () => {
  const { MessagesProvider } = await import("@/i18n/useMessage");
  const { ApplicationPreparationContext } =
    await import("./ApplicationPreparationContext");
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const globals = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLInputElement",
    "Element",
    "Node",
    "NodeFilter",
    "Event",
    "CustomEvent",
    "MutationObserver",
    "getComputedStyle",
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
  const { ApplicationEndConfirmation } =
    await import("./ApplicationEndConfirmation");
  const root = createRoot(dom.window.document.getElementById("root")!);
  const requests: unknown[] = [];
  let resolveEnd: (ok: boolean) => void;
  let closed = 0;
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <MessagesProvider locale="ko">
        <ApplicationPreparationContext.Provider
          value={{
            record: null,
            drafts: [],
            pending: false,
            error: "",
            command: (request) => {
              requests.push(request);
              return new Promise<boolean>((resolve) => {
                resolveEnd = resolve;
              });
            },
          }}
        >
          <button onClick={() => setOpen(true)}>Open</button>
          <ApplicationEndConfirmation
            open={open}
            onClose={() => {
              closed++;
              setOpen(false);
            }}
          />
        </ApplicationPreparationContext.Provider>
      </MessagesProvider>
    );
  }
  const button = (label: string) =>
    [...dom.window.document.querySelectorAll("button")].find(
      (b) => b.textContent === label
    )!;
  const click = (label: string) =>
    act(async () => {
      button(label).focus();
      button(label).click();
    });
  try {
    await act(async () => root.render(<Harness />));
    await click("Open");
    assert.match(
      dom.window.document.querySelector('[role="dialog"]')!.textContent!,
      /지원 과정을 종료하시겠습니까\?/
    );
    assert.equal(dom.window.document.activeElement, button("아니요"));
    assert.equal(requests.length, 0);
    await click("아니요");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.equal(closed, 1);
    assert.equal(requests.length, 0);
    assert.equal(dom.window.document.activeElement, button("Open"));
    await click("Open");
    await act(async () => {
      button("종료하기").click();
      button("종료하기").click();
    });
    assert.deepEqual(requests, [{ operation: "end" }]);
    assert.equal(button("아니요").disabled, true);
    assert.equal(button("종료하기").disabled, true);
    await act(async () => {
      dom.window.document.activeElement!.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        })
      );
    });
    assert.equal(closed, 1, "Escape cannot dismiss an in-flight request");
    await act(async () => resolveEnd(false));
    assert.match(
      dom.window.document.querySelector('[role="alert"]')!.textContent!,
      /종료하지 못했어요/
    );
    assert.equal(closed, 1);
    assert.equal(button("종료하기").disabled, false);
    await click("종료하기");
    assert.equal(requests.length, 2);
    await act(async () => resolveEnd(true));
    assert.equal(closed, 2);
    assert.equal(dom.window.document.querySelector('[role="dialog"]'), null);
  } finally {
    await act(async () => root.unmount());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
