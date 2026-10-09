import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useApplicationTimelineLayout } from "./useApplicationTimelineLayout";

test("layout follows resized composer clearance without changing padding or earlier reading position", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const install = (k: string, v: unknown) => {
    originals.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
    Object.defineProperty(globalThis, k, {
      value: v,
      configurable: true,
      writable: true,
    });
  };
  install("window", dom.window);
  install("document", dom.window.document);
  install("IS_REACT_ACT_ENVIRONMENT", true);
  install("getComputedStyle", dom.window.getComputedStyle.bind(dom.window));
  install("MutationObserver", dom.window.MutationObserver);
  install("requestAnimationFrame", (fn: FrameRequestCallback) =>
    setTimeout(() => fn(0), 0)
  );
  install("cancelAnimationFrame", clearTimeout);
  let resized: (() => void) | undefined;
  install(
    "ResizeObserver",
    class {
      constructor(cb: () => void) {
        resized = cb;
      }
      observe() {}
      disconnect() {}
    }
  );
  let target: (() => number | null) | undefined;
  function Probe({
    active,
    following,
  }: {
    active: boolean;
    following: boolean;
  }) {
    const ref = useRef<HTMLDivElement>(null);
    target = useApplicationTimelineLayout(active, ref, following);
    return React.createElement(
      "div",
      null,
      React.createElement(
        "div",
        {
          ref,
          style: {
            "--career-timeline-bottom-padding": "200px",
            paddingBottom: "200px",
          } as React.CSSProperties,
        },
        React.createElement(
          "div",
          null,
          React.createElement(
            "div",
            { "data-career-message-role": "user" },
            "Question"
          )
        )
      )
    );
  }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () =>
      root.render(
        React.createElement(Probe, { active: false, following: true })
      )
    );
    const el = document.querySelector("#root > div > div") as HTMLDivElement;
    let height = 800;
    Object.defineProperty(el, "clientHeight", { get: () => height });
    Object.defineProperty(el, "scrollHeight", { value: 1200 });
    el.scrollTo = ((options: ScrollToOptions) => {
      el.scrollTop = options.top ?? 0;
    }) as typeof el.scrollTo;
    await act(async () =>
      root.render(React.createElement(Probe, { active: true, following: true }))
    );
    assert.equal(target!(), 400);
    await act(async () => {
      height = 500;
      resized?.();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(
      el.scrollTop,
      700,
      "latest content remains visible when the composer grows"
    );
    assert.equal(el.style.paddingBottom, "200px");
    assert.equal(
      el.style.getPropertyValue("--career-application-bottom-padding"),
      ""
    );
    el.scrollTop = 420; // Reading earlier messages.
    await act(async () =>
      root.render(
        React.createElement(Probe, { active: true, following: false })
      )
    );
    await act(async () => {
      el.style.setProperty("--career-timeline-bottom-padding", "352px");
      height = 400;
      resized?.();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(el.scrollTop, 420);
    await act(async () =>
      root.render(
        React.createElement(Probe, { active: false, following: false })
      )
    );
    assert.equal(
      el.style.getPropertyValue("--career-application-bottom-padding"),
      ""
    );
    assert.equal(
      el.style.paddingBottom,
      "200px",
      "normal chat keeps its composer clearance after mode exit"
    );
    assert.equal(
      el.style.getPropertyValue("--career-timeline-bottom-padding"),
      "352px"
    );
    assert.equal(target!(), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
