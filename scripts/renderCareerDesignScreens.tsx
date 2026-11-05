/** Local artifact rendering with synthetic providers; never connects to an API. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NextRouter } from "next/router";

async function main() {
  const require = createRequire(import.meta.url);
  require.extensions[".css"] = (module) => {
    module.exports = {};
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-only";
  process.env.OPENAI_API_KEY ??= "test-only";
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://localhost:3000/career/preview", pretendToBeVisual: true }
  );
  for (const name of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "Node",
    "NodeFilter",
    "Element",
    "DocumentFragment",
    "Event",
    "CustomEvent",
    "MutationObserver",
    "MouseEvent",
    "KeyboardEvent",
    "DOMRect",
    "getComputedStyle",
    "localStorage",
  ]) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: (dom.window as any)[name],
    });
  }
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
    IntersectionObserver: class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  });
  dom.window.HTMLElement.prototype.scrollTo = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.HTMLElement.prototype.hasPointerCapture = () => false;
  dom.window.HTMLElement.prototype.setPointerCapture = () => {};
  dom.window.HTMLElement.prototype.releasePointerCapture = () => {};
  let viewportWidth = 1200;
  dom.window.matchMedia = (query) => ({
    matches: query.includes("max-width")
      ? viewportWidth <= parseInt(query.match(/\d+/)?.[0] ?? "0")
      : query.includes("min-width")
        ? viewportWidth >= parseInt(query.match(/\d+/)?.[0] ?? "0")
        : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
    onchange: null,
  });
  // No reads or writes leave this process. The workspace already supplies owned fixtures.
  globalThis.fetch = async () =>
    Response.json({
      items: [],
      forms: [],
      pending: 0,
      schedules: [],
      follows: [],
      nextOffset: null,
      opportunities: [],
      actions: [],
      sessions: [],
      outputs: [],
    });
  const { createRoot } = await import("react-dom/client");
  const { MessagesProvider } = await import("@/i18n/useMessage");
  const { default: Preview } =
    await import("@/components/career/preview/CareerWorkspacePreview");
  const { default: InlinePreview } =
    await import("@/pages/career/preview/chat-ui");
  const snapshots: string[] = [];
  const cases = [
    { tab: "chat", width: 1200 },
    { tab: "history", width: 1200, historyTab: "new", id: "preview-role-1" },
    { tab: "home", width: 390 },
    { tab: "history", width: 390, historyTab: "new", id: "preview-role-1" },
    { tab: "chat-ui", width: 1200 },
    { tab: "chat", width: 1200, panel: "settings" },
    { tab: "profile", width: 1200, menu: true },
    {
      tab: "history",
      width: 1200,
      historyTab: "new",
      id: "preview-role-1",
      reject: true,
    },
  ];
  for (const scenario of cases) {
    viewportWidth = scenario.width;
    dom.window.document.body.innerHTML = '<div id="root"></div>';
    const root = createRoot(dom.window.document.getElementById("root")!);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    let query: NextRouter["query"] = { ...scenario } as any;
    const router = {
      isReady: true,
      query,
      pathname: "/career/preview",
      asPath: "/career/preview",
      locale: "ko",
      events: { on() {}, off() {}, emit() {} },
      push: async () => true,
      replace: async () => true,
      back() {},
      prefetch: async () => {},
    } as unknown as NextRouter;
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <RouterContext.Provider value={router}>
            <MessagesProvider locale="ko" persistPreference={false}>
              <div data-career-theme="sky">
                {scenario.tab === "chat-ui" ? (
                  <InlinePreview />
                ) : (
                  <Preview
                    initialTab={scenario.tab as any}
                    autoPlayConversation={false}
                  />
                )}
              </div>
            </MessagesProvider>
          </RouterContext.Provider>
        </QueryClientProvider>
      )
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    if (scenario.menu) {
      const button = dom.window.document.querySelector<HTMLButtonElement>(
        'button[aria-label="프로필 메뉴"]'
      );
      if (button)
        await act(async () => {
          button.dispatchEvent(
            new dom.window.MouseEvent("pointerdown", {
              bubbles: true,
              button: 0,
            })
          );
          button.click();
        });
    }
    if (scenario.reject) {
      const button = [...dom.window.document.querySelectorAll("button")].find(
        (button) =>
          button.closest('[data-expanded="true"]') &&
          button.getAttribute("aria-label")?.endsWith(": 이번엔 넘길게요")
      );
      if (!button)
        throw new Error("Missing expanded opportunity feedback action");
      await act(async () => button.click());
      if (!dom.window.document.querySelector('[role="dialog"]'))
        throw new Error("Decline preview did not open its confirmation dialog");
    }
    const clone = dom.window.document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script,link,style").forEach((el) => el.remove());
    // Floating UI measures in a browser. Put the already-rendered profile menu at
    // its real top-right anchor for the static artifact, without modifying app code.
    clone
      .querySelectorAll<HTMLElement>("[data-radix-popper-content-wrapper]")
      .forEach((el) => {
        el.style.cssText =
          "position:fixed;right:28px;top:64px;z-index:100;min-width:248px";
        el.querySelectorAll<HTMLElement>('[role="menu"]').forEach((menu) =>
          menu.style.removeProperty("animation")
        );
      });
    snapshots.push(clone.outerHTML);
    await act(async () => root.unmount());
    client.clear();
    console.log(
      `Rendered ${scenario.tab} ${scenario.width}, ${snapshots.at(-1)!.length} characters`
    );
  }
  const output = process.argv[2] ?? "output/career-design-screens.json";
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(snapshots));
  dom.window.close();
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
