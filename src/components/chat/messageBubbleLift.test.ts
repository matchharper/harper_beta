import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { liftMessageBubble } from "./messageBubbleLift";

for (const interrupted of [false, true]) {
  test(`restores the original bubble and layout after ${interrupted ? "an interrupted flight/unmount" : "closing"}`, async () => {
    const dom = new JSDOM('<main><article style="color: white; background: black"><button>Original content</button></article><p>Following message</p></main><div id="target"></div>');
    const previous = new Map<string, PropertyDescriptor | undefined>();
    const install = (name: string, value: unknown) => {
      previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { configurable: true, value });
    };
    dom.window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    install("window", dom.window);
    install("document", dom.window.document);
    install("getComputedStyle", dom.window.getComputedStyle.bind(dom.window));
    install("ResizeObserver", class { observe() {} disconnect() {} });
    try {
      const bubble = dom.window.document.querySelector("article")!;
      const child = bubble.firstElementChild;
      const parent = bubble.parentNode;
      const target = dom.window.document.querySelector<HTMLElement>("#target")!;
      const before = dom.window.document.body.innerHTML;
      let showing = false;
      const matches = bubble.matches.bind(bubble);
      bubble.matches = selector => selector === ":popover-open" ? showing : matches(selector);
      bubble.showPopover = () => { showing = true; };
      bubble.hidePopover = () => { showing = false; };
      bubble.getBoundingClientRect = () => ({ x: 180, y: 100, left: 180, top: 100, width: 160, height: 80, right: 340, bottom: 180, toJSON() {} });
      target.getBoundingClientRect = () => ({ x: 100, y: 300, left: 100, top: 300, width: 164, height: 82, right: 264, bottom: 382, toJSON() {} });
      const lift = liftMessageBubble(bubble, target);
      assert.equal(bubble.parentNode, parent);
      assert.equal(bubble.firstElementChild, child);
      assert.equal(dom.window.document.querySelectorAll("article").length, 1);
      assert.equal(dom.window.document.querySelectorAll("[data-chat-message-placeholder]").length, 1);
      assert.equal(showing, true);
      let escapedScroll = false;
      dom.window.document.addEventListener("touchmove", () => { escapedScroll = true; });
      bubble.dispatchEvent(new dom.window.Event("touchmove", { bubbles: true }));
      assert.equal(escapedScroll, false);
      if (interrupted) lift.restore();
      else await lift.returnToSource();
      lift.restore(); // Cleanup is safe when the close animation already restored it.
      assert.equal(showing, false);
      assert.equal(dom.window.document.body.innerHTML, before);
      assert.equal(bubble.firstElementChild, child);
      bubble.dispatchEvent(new dom.window.Event("touchmove", { bubbles: true }));
      assert.equal(escapedScroll, true);
    } finally {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
      dom.window.close();
    }
  });
}
