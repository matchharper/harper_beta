import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import type { NextRouter } from "next/router";
import { registerOrgUnsavedChangesGuard } from "./unsavedChangesGuard";

test("multiple dirty panels share one prompt and retain protection when one panel is saved", () => {
  const dom = new JSDOM('<a href="/org">Home</a>', { url: "http://localhost" });
  const keys = ["window", "document", "Element"] as const;
  const descriptors = keys.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key)
  );
  keys.forEach((key) =>
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: dom.window[key],
    })
  );
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  let pop = (_: { as: string }) => true;
  const router = {
    asPath: "/org/role?orgId=w&roleId=r&tab=role",
    beforePopState: (callback: typeof pop) => {
      pop = callback;
    },
    events: {
      on: (name: string, callback: (...args: any[]) => void) => {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name)!.add(callback);
      },
      off: (name: string, callback: (...args: any[]) => void) =>
        listeners.get(name)?.delete(callback),
      emit: (name: string, ...args: any[]) =>
        listeners.get(name)?.forEach((callback) => callback(...args)),
    },
  } as unknown as NextRouter;
  let prompts = 0;
  let confirmed = false;
  const register = () =>
    registerOrgUnsavedChangesGuard({
      router,
      preserveWithinRole: true,
      confirmNavigation: () => {
        prompts++;
        return confirmed;
      },
    });
  const cleanups = [register(), register()];
  const click = () => {
    const event = new dom.window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    dom.window.document.querySelector("a")!.dispatchEvent(event);
    return event;
  };
  try {
    assert.equal(click().defaultPrevented, true);
    assert.equal(prompts, 1);
    assert.equal(pop({ as: "/org/role?orgId=w&roleId=r&tab=settings" }), true);
    assert.equal(prompts, 1);
    assert.equal(pop({ as: "/org/role?orgId=w&roleId=other" }), false);
    assert.equal(prompts, 2);
    cleanups.pop()!(); // Saving/unmounting one editor must not remove the other's guard.
    assert.equal(pop({ as: "/org" }), false);
    assert.equal(prompts, 3);

    confirmed = true;
    // Avoid JSDOM's native anchor navigation; mimic Next's bubble handler.
    dom.window.document
      .querySelector("a")!
      .addEventListener("click", (event) => event.preventDefault());
    click();
    assert.equal(prompts, 4);
    router.events.emit("routeChangeStart", "/org", { shallow: false });
    assert.equal(prompts, 4);

    click(); // A click handled without navigation cannot approve a DIFFERENT destination.
    confirmed = false;
    assert.throws(
      () =>
        router.events.emit("routeChangeStart", "/org/team", { shallow: false }),
      /aborted/
    );
    assert.equal(prompts, 6);
    cleanups.pop()!();
    assert.equal(pop({ as: "/org" }), true);
    assert.equal(listeners.get("routeChangeStart")?.size, 0);
  } finally {
    cleanups.forEach((cleanup) => cleanup());
    keys.forEach((key, index) => {
      if (descriptors[index])
        Object.defineProperty(globalThis, key, descriptors[index]!);
      else Reflect.deleteProperty(globalThis, key);
    });
    dom.window.close();
  }
});
