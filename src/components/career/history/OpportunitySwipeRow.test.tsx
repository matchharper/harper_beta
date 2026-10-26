import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

test("mobile swipe commits only intentional releases and preserves other interactions", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const keys = [
    "navigator",
    "window",
    "document",
    "HTMLElement",
    "Element",
    "Node",
  ] as const;
  const saved = keys.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
  );
  for (const key of keys)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: dom.window[key],
    });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let mobile = true;
  dom.window.matchMedia = ((query: string) => ({
    matches: mobile,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
  }));
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { OpportunitySwipeRow } = await import("./OpportunitySwipeRow");
  const root = createRoot(document.getElementById("root")!);
  let positive = 0,
    negative = 0,
    clicks = 0;
  const render = async (disabled = false) =>
    act(async () => {
      root.render(
        <OpportunitySwipeRow
          disabled={disabled}
          positive={{
            label: "Interested",
            icon: "+",
            onSelect: () => {
              positive++;
            },
          }}
          negative={{
            label: "Not for me",
            icon: "−",
            onSelect: () => {
              negative++;
            },
          }}
        >
          <div
            id="card"
            onClick={() => {
              clicks++;
            }}
          >
            Opportunity<button>Details</button>
          </div>
        </OpportunitySwipeRow>
      );
    });
  try {
    await render();
    const row = document.getElementById("root")!
      .firstElementChild as HTMLElement;
    row.getBoundingClientRect = () => ({ width: 360 }) as DOMRect;
    row.setPointerCapture = () => {
      // Mobile browsers release the touched child's implicit capture when the
      // row takes over. This event bubbles, but must not cancel the swipe.
      const event = new dom.window.Event("lostpointercapture", {
        bubbles: true,
      });
      Object.assign(event, { pointerId: 1 });
      document.getElementById("card")!.dispatchEvent(event);
    };
    row.hasPointerCapture = () => false;
    const card = document.getElementById("card")!;
    const pointer = async (
      type: string,
      x: number,
      y = 0,
      target: Element = card,
      pointerType = "touch"
    ) =>
      act(async () => {
        const event = new dom.window.Event(type, { bubbles: true });
        Object.assign(event, {
          pointerId: 1,
          isPrimary: true,
          pointerType,
          clientX: x,
          clientY: y,
        });
        target.dispatchEvent(event);
      });
    const swipe = async (x: number, cancel = false) => {
      await pointer("pointerdown", 0);
      await pointer("pointermove", x);
      await pointer(cancel ? "pointercancel" : "pointerup", x);
    };
    await swipe(100);
    assert.equal(positive, 0);
    await act(async () => {
      card.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true, detail: 1 })
      );
    });
    assert.equal(clicks, 0, "drag must not open the card");
    await pointer("pointerdown", 0);
    await pointer("pointerup", 0);
    await act(async () => {
      card.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true, detail: 1 })
      );
    });
    assert.equal(clicks, 1, "next tap works normally");
    await swipe(180);
    await swipe(-180);
    assert.deepEqual([positive, negative], [1, 1]);
    await swipe(180, true);
    await pointer("pointerdown", 0);
    await pointer("pointermove", 180);
    await pointer("lostpointercapture", 180, 0, row);
    await pointer("pointerup", 180);
    await pointer("pointerdown", 0);
    await pointer("pointermove", 180);
    await pointer("pointermove", 50);
    await pointer("pointerup", 50);
    await pointer("pointerdown", 0);
    await pointer("pointermove", 15, 40);
    await pointer("pointermove", 200, 50);
    await pointer("pointerup", 200, 50);
    assert.deepEqual(
      [positive, negative],
      [1, 1],
      "cancel, retreat and vertical scrolling do not commit"
    );
    await pointer("pointerdown", 0, 0, card.querySelector("button")!);
    await pointer("pointermove", 180);
    await pointer("pointerup", 180);
    mobile = false;
    await swipe(180);
    mobile = true;
    await render(true);
    await swipe(-180);
    assert.deepEqual(
      [positive, negative],
      [1, 1],
      "nested controls, desktop and pending rows cannot swipe"
    );
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  }
});
