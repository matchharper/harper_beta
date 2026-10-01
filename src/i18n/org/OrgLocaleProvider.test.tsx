import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { OrgLocaleProvider, useOrgLocale, useOrgT } from "./OrgLocaleProvider";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";

test("org language selection persists and takes precedence over browser language", async () => {
  const dom = new JSDOM("<div id='root'></div>", {
    url: "https://example.com/org",
  });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document"
  );
  const previousNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator"
  );
  const previousActEnvironment = Object.getOwnPropertyDescriptor(
    globalThis,
    "IS_REACT_ACT_ENVIRONMENT"
  );
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: dom.window,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { language: "en-US", languages: ["en-US"] },
  });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  });
  dom.window.localStorage.setItem("harper:org-locale", "ko");

  function View() {
    const { locale, setLocale } = useOrgLocale();
    const t = useOrgT();
    return (
      <button onClick={() => setLocale("en")} type="button">
        {locale}: {t("profile.language", "언어")}
      </button>
    );
  }

  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => {
      root.render(
        <OrgLocaleProvider>
          <View />
        </OrgLocaleProvider>
      );
    });
    const button = dom.window.document.querySelector("button")!;
    assert.equal(button.textContent, "ko: 언어");
    assert.equal(dom.window.document.documentElement.lang, "ko");
    await act(async () => button.click());
    assert.equal(button.textContent, "en: Language");
    assert.equal(dom.window.localStorage.getItem("harper:org-locale"), "en");
    assert.equal(dom.window.document.documentElement.lang, "en");
  } finally {
    await act(async () => root.unmount());
    for (const [name, previous] of [
      ["window", previousWindow],
      ["document", previousDocument],
      ["navigator", previousNavigator],
      ["IS_REACT_ACT_ENVIRONMENT", previousActEnvironment],
    ] as const) {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    }
    dom.window.close();
  }
});

test("saved company language overrides local detection and profile changes update it", async () => {
  const dom = new JSDOM("<div id='root'></div>", {
    url: "https://example.com/org",
  });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  const previousActEnvironment = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  const previousAuthState = useAuthStore.getState();
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { language: "en-US", languages: ["en-US"] },
  });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  });
  const requests: Array<{ method: string; body: unknown }> = [];
  let serverLocale: string | null = "ko";
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (_input: unknown, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({
        method: init?.method ?? "GET",
        body,
      });
      if (init?.method === "PUT" && (!body.ifUnset || !serverLocale)) {
        serverLocale = body.locale;
      }
      return new Response(JSON.stringify({ locale: serverLocale }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    },
  });
  const sessionMock = mock.method(supabase.auth, "getSession", async () => ({
    data: { session: { access_token: "test-token" } },
    error: null,
  }));
  dom.window.localStorage.setItem("harper:org-locale", "en");
  useAuthStore.setState({ user: { id: "company-user-1" } as typeof previousAuthState.user });

  function View() {
    const { locale, setLocale } = useOrgLocale();
    return <button onClick={() => void setLocale("en")} type="button">{locale}</button>;
  }

  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<OrgLocaleProvider><View /></OrgLocaleProvider>));
    assert.equal(dom.window.document.querySelector("button")?.textContent, "ko");
    assert.equal(dom.window.localStorage.getItem("harper:org-locale"), "ko");
    await act(async () => dom.window.document.querySelector("button")!.click());
    assert.equal(dom.window.document.querySelector("button")?.textContent, "en");
    assert.deepEqual(requests.map((request) => request.method), ["GET", "PUT"]);
    assert.deepEqual(requests[1]?.body, { locale: "en" });
    assert.equal(dom.window.localStorage.getItem("harper:org-locale-user"), "company-user-1");

    serverLocale = null;
    await act(async () => {
      useAuthStore.setState({ user: { id: "company-user-2" } as typeof previousAuthState.user });
    });
    assert.deepEqual(requests.slice(2).map((request) => request.method), ["GET", "PUT"]);
    assert.deepEqual(requests[3]?.body, { locale: "en", ifUnset: true });
    assert.equal(dom.window.localStorage.getItem("harper:org-locale-user"), "company-user-2");
  } finally {
    await act(async () => root.unmount());
    sessionMock.mock.restore();
    useAuthStore.setState(previousAuthState, true);
    for (const [name, previous] of [
      ["window", previousWindow],
      ["document", previousDocument],
      ["navigator", previousNavigator],
      ["fetch", previousFetch],
      ["IS_REACT_ACT_ENVIRONMENT", previousActEnvironment],
    ] as const) {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    }
    dom.window.close();
  }
});
