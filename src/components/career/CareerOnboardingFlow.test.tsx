import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Exercise the real page and navigation hook; only external services and visual
// animation wrappers are replaced. No account, upload or API request is real.
test("profile submission runs behind the guide and is not submitted again on Next", async (t) => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/career/onboarding",
    pretendToBeVisual: true,
  });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  const require = createRequire(import.meta.url);
  const restored: Array<() => void> = [];
  function stub(path: string, exports: object) {
    const id = require.resolve(path);
    const original = require.cache[id];
    require.cache[id] = {
      id,
      filename: id,
      loaded: true,
      exports,
    } as NodeJS.Module;
    restored.push(() => {
      if (original) require.cache[id] = original;
      else delete require.cache[id];
    });
  }
  const user = {
    id: "guide-fixture",
    email: "guide@example.com",
    user_metadata: { name: "테스트" },
  };
  const router = {
    isReady: true,
    query: {},
    asPath: "/career/onboarding",
    replace() {},
    push() {},
  };
  const noop = () => {};
  let starts = 0;
  let resolveStart: (response: Response) => void = noop;
  const session = {
    conversation: { id: "guide-conversation", stage: "profile" },
    needsOnboarding: true,
  };
  const fetchWithAuth = async (url: string, init?: RequestInit) => {
    if (url === "/api/talent/onboarding/start" && init?.method === "POST") {
      starts++;
      return new Promise<Response>((resolve) => {
        resolveStart = resolve;
      });
    }
    if (url.startsWith("/api/talent/session")) return Response.json(session);
    return Response.json({});
  };
  stub("next/router", { useRouter: () => router });
  stub("next/head", { __esModule: true, default: () => null });
  stub("@/hooks/career/useCareerAuth", {
    useCareerAuth: () => ({ user, authLoading: false }),
  });
  stub("@/hooks/career/useCareerApi", {
    useCareerApi: () => ({ fetchWithAuth }),
  });
  stub("@/hooks/career/useCareerLogEvent", { useCareerLogEvent: () => noop });
  stub("@/components/toast/toast", { showToast: noop });
  stub("@/components/common/Face", { __esModule: true, default: () => null });
  stub("@/components/career/OnboardingLoadingState", {
    __esModule: true,
    default: () => <div>analysis-loading</div>,
  });
  const shared = require("@/components/common/onboarding/Onboarding");
  stub("@/components/common/onboarding/Onboarding", {
    ...shared,
    OnboardingTransition: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    OnboardingConversationPreview: () => null,
  });
  const { default: Page } = require("@/pages/career/onboarding");
  const { MessagesProvider } = require("@/i18n/useMessage");
  const { createRoot } = await import("react-dom/client");
  t.after(() => {
    restored.reverse().forEach((restore) => restore());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  });
  for (const scenario of ["pending", "completed", "failed"] as const) {
    await t.test(scenario, async () => {
      starts = 0;
      const root = createRoot(dom.window.document.getElementById("root")!);
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const text = () => dom.window.document.body.textContent ?? "";
      async function click(label: string) {
        const button = [...dom.window.document.querySelectorAll("button")].find(
          (b) => b.textContent?.trim() === label
        );
        assert.ok(button, `Missing ${label}: ${text()}`);
        await act(async () => {
          button.click();
        });
      }
      try {
        await act(async () => {
          root.render(
            <QueryClientProvider client={client}>
              <MessagesProvider locale="ko">
                <Page />
              </MessagesProvider>
            </QueryClientProvider>
          );
        });
        await click("Harper 시작하기");
        // Choose an engagement card using the actual option rendered by the page.
        const options = [
          ...dom.window.document.querySelectorAll("button"),
        ].filter((b) => b.textContent?.includes("풀타임"));
        assert.ok(options[0], text());
        await act(async () => {
          options[0].click();
        });
        await click("다음");
        await click("다음");
        assert.match(text(), /LinkedIn 또는 이력서/);
        const input = dom.window.document.querySelector(
          'input[placeholder="https://linkedin.com/in/..."]'
        ) as HTMLInputElement;
        assert.ok(input);
        await act(async () => {
          Object.getOwnPropertyDescriptor(
            dom.window.HTMLInputElement.prototype,
            "value"
          )!.set!.call(input, "https://linkedin.com/in/guide-fixture");
          input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
        });
        await click("다음");
        assert.equal(starts, 1, "profile Next starts submission immediately");
        assert.match(text(), /Harper에게 이런 걸 요청/);
        assert.doesNotMatch(text(), /analysis-loading|분석까지 약 2분/);
        if (scenario === "completed") {
          await act(async () => {
            resolveStart(
              Response.json({ profileIngestion: { status: "completed" } })
            );
          });
          assert.match(
            text(),
            /Harper에게 이런 걸 요청/,
            "completion must not interrupt the guide"
          );
        }
        if (scenario === "failed") {
          await act(async () => {
            resolveStart(
              Response.json({ error: "temporary failure" }, { status: 500 })
            );
          });
          assert.match(
            text(),
            /LinkedIn 또는 이력서/,
            "failed submission returns to the profile form"
          );
          await click("다음");
          assert.equal(starts, 2, "failed submission can be retried");
          await act(async () => {
            resolveStart(
              Response.json({ profileIngestion: { status: "completed" } })
            );
          });
        }
        await click("다음");
        assert.doesNotMatch(text(), /Harper에게 이런 걸 요청/);
        if (scenario === "pending") {
          assert.match(text(), /analysis-loading/);
          await act(async () => {
            dom.window.dispatchEvent(
              new dom.window.KeyboardEvent("keydown", {
                key: "Enter",
                bubbles: true,
              })
            );
          });
          assert.equal(starts, 1, "Enter on loading must not resubmit");
          await act(async () => {
            resolveStart(
              Response.json({ profileIngestion: { status: "completed" } })
            );
          });
        }
        assert.doesNotMatch(text(), /analysis-loading/);
        assert.equal(starts, scenario === "failed" ? 2 : 1);
        assert.match(text(), /채팅으로 하기/);
        assert.match(text(), /5분 통화하기/);
      } finally {
        await act(async () => {
          root.unmount();
        });
        client.clear();
      }
    });
  }
});
