import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MessagesProvider } from "@/i18n/useMessage";
import { supabase } from "@/lib/supabase";

test("browser control and termination require confirmation; dismissal and folding leave work running", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost",
    pretendToBeVisual: true,
  });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  // Radix must be imported after the DOM is available for its layout effects.
  const { BrowserSessionView } = await import("./BrowserSessionCard");
  const root = createRoot(dom.window.document.getElementById("root")!);
  const actions: string[] = [];
  let folds = 0;
  const render = (onExpand?: () => void, status = "running", liveUrl: string | null = "https://example.test/viewer", busy = false) =>
    root.render(
      <MessagesProvider locale="ko">
        <BrowserSessionView
          view={{
            session: { id: "browser-1", status, revision: 1 },
            liveUrl,
            browserAvailability: liveUrl ? "active" : "stopped",
            executions: [],
          }}
          busy={busy}
          onAction={(action) => {
            actions.push(action);
          }}
          onExpand={onExpand}
        />
      </MessagesProvider>
    );
  const clickText = async (label: string) => {
    const button = [...dom.window.document.querySelectorAll("button")].find(
      (item) => item.textContent === label
    );
    assert.ok(button, `Missing button: ${label}`);
    await act(async () => button.click());
  };
  const dialog = () => dom.window.document.querySelector('[role="dialog"]');
  try {
    await act(async () => render());
    const iframe = dom.window.document.querySelector("iframe");
    await clickText("직접 조작");
    assert.match(dialog()?.textContent ?? "", /Harper가 잠시 기다리는/);
    assert.deepEqual(
      actions,
      [],
      "opening confirmation must not interrupt work"
    );
    await clickText("취소");
    assert.equal(dialog(), null);
    assert.deepEqual(actions, []);
    assert.equal(dom.window.document.querySelector("iframe"), iframe);

    await clickText("직접 조작");
    await act(async () => {
      dom.window.document.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        })
      );
    });
    assert.equal(dialog(), null);
    assert.deepEqual(actions, [], "Escape cancels without taking control");

    await clickText("직접 조작");
    await clickText("직접 조작하기");
    assert.deepEqual(actions, ["handoff"]);
    assert.equal(dialog(), null);

    const close = dom.window.document.querySelector<HTMLButtonElement>(
      'button[aria-label="닫기"]'
    )!;
    await act(async () => close.click());
    assert.match(dialog()?.textContent ?? "", /브라우저가 종료되고/);
    assert.deepEqual(
      actions,
      ["handoff"],
      "X must not terminate before confirmation"
    );
    await act(async () =>
      dom.window.document
        .querySelector<HTMLButtonElement>('button[aria-label="모달 닫기"]')!
        .click()
    );
    assert.equal(dialog(), null);
    assert.deepEqual(actions, ["handoff"]);

    await act(async () => close.click());
    await clickText("중단하고 종료");
    assert.deepEqual(actions, ["handoff", "close"]);

    await act(async () =>
      render(() => {
        folds += 1;
      })
    );
    const foldX = dom.window.document.querySelector<HTMLButtonElement>(
      'button[aria-label="브라우저 화면 축소"]:not([aria-expanded])'
    )!;
    await act(async () => foldX.click());
    assert.equal(folds, 1);
    assert.equal(dialog(), null);
    assert.deepEqual(
      actions,
      ["handoff", "close"],
      "the dock X still only folds the viewer"
    );
    assert.equal(dom.window.document.querySelector("iframe"), iframe);
    const stop = [...dom.window.document.querySelectorAll("button")].find(button => button.textContent === "중단하기")!;
    assert.equal(stop.nextElementSibling?.textContent, "직접 조작", "Stop appears to the left of manual control");
    await clickText("중단하기");
    assert.match(dialog()?.textContent ?? "", /브라우저가 종료되고/);
    await clickText("취소");
    assert.deepEqual(actions, ["handoff", "close"], "Cancelling Stop leaves work running");
    await clickText("중단하기");
    await clickText("중단하고 종료");
    assert.deepEqual(actions, ["handoff", "close", "close"], "Stop uses the existing close action in the dock");
    await act(async () => render(undefined, "running", "https://example.test/viewer", true));
    const countBeforeBusyStop = actions.length;
    await clickText("중단하기");
    assert.equal(dialog(), null);
    assert.equal(actions.length, countBeforeBusyStop);
    await act(async () => render(undefined, "human"));
    assert.equal(dom.window.document.querySelector('a[target="_blank"]'), null);
    const humanStop = [...dom.window.document.querySelectorAll("button")].find(button => button.textContent === "중단하기")!;
    assert.equal(humanStop.nextElementSibling?.textContent, "완료");
    const beforeHumanStop = actions.length;
    await clickText("중단하기");
    assert.match(dialog()?.textContent ?? "", /브라우저가 종료되고/);
    assert.equal(actions.length, beforeHumanStop);
    await clickText("취소");
    assert.equal(actions.length, beforeHumanStop);
    await clickText("중단하기");
    await clickText("중단하고 종료");
    assert.equal(actions.at(-1), "close");
    assert.equal(dom.window.document.querySelector("iframe"), iframe);
    await clickText("완료");
    assert.equal(actions.at(-1), "resume");
    assert.equal(dialog(), null, "Done returns control without another confirmation");
    await act(async () => render(undefined, "human", null));
    await clickText("완료");
    assert.equal(actions.at(-1), "resume", "An expired browser must still allow returning control");
    const count = actions.length;
    await act(async () => render(undefined, "human", "https://example.test/viewer", true));
    await clickText("중단하기");
    assert.equal(dialog(), null);
    await clickText("완료");
    assert.equal(actions.length, count, "Busy stop and return cannot be submitted again");
    assert.equal(dom.window.document.querySelector("iframe")?.classList.contains("pointer-events-none"), true);
  } finally {
    await act(async () => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    await supabase.auth.stopAutoRefresh();
    dom.window.close();
    for (const [key, value] of previous) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
