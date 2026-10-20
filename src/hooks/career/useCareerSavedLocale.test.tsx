import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MessagesProvider, useMessages, type Locale } from "@/i18n/useMessage";
import { useCareerSavedLocale } from "./useCareerSavedLocale";

const GLOBAL_KEYS = ["document", "window", "Event", "CustomEvent", "StorageEvent"] as const;

test("a logged-in talent's screen switches once to the saved language", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/career",
  });
  dom.window.document.cookie = "NEXT_LOCALE=ko; path=/";
  const previous = GLOBAL_KEYS.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  for (const key of GLOBAL_KEYS) {
    const value = key === "document" ? dom.window.document : key === "window" ? dom.window : dom.window[key];
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

  const screen: { locale: Locale | null; setLocale: (locale: Locale) => void } = {
    locale: null,
    setLocale: () => undefined,
  };
  const Harness = ({ savedLocale }: { savedLocale: string | null }) => {
    useCareerSavedLocale(savedLocale);
    const { locale, setLocale } = useMessages();
    screen.locale = locale;
    screen.setLocale = setLocale;
    return null;
  };
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  const render = (savedLocale: string | null) =>
    act(async () => {
      root.render(
        <MessagesProvider>
          <Harness savedLocale={savedLocale} />
        </MessagesProvider>
      );
    });

  try {
    await render(null);
    assert.equal(screen.locale, "ko", "before the session loads the browser choice is shown");

    await render("en");
    assert.equal(screen.locale, "en", "the saved language replaces the browser choice");

    await act(async () => screen.setLocale("ko"));
    await render("en");
    assert.equal(screen.locale, "ko", "a later profile-menu choice is not switched back");

    await render("ja");
    assert.equal(screen.locale, "ko", "an unsupported value changes nothing");
  } finally {
    await act(async () => root.unmount());
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    GLOBAL_KEYS.forEach((key, index) => {
      const descriptor = previous[index];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    });
    dom.window.close();
  }
});
