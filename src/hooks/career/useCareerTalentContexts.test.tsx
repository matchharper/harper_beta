import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@supabase/supabase-js";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { MessagesProvider } from "@/i18n/useMessage";
import type { FetchWithAuth } from "./useCareerApi";
import { useCareerTalentContexts } from "./useCareerTalentContexts";

test("does not clear loaded memories when a refresh omits the memory list", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/career/profile",
  });
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document"
  );
  const previousCustomEvent = Object.getOwnPropertyDescriptor(
    globalThis,
    "CustomEvent"
  );
  const previousEvent = Object.getOwnPropertyDescriptor(globalThis, "Event");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: dom.window,
  });
  Object.defineProperty(globalThis, "Event", {
    configurable: true,
    value: dom.window.Event,
  });
  Object.defineProperty(globalThis, "CustomEvent", {
    configurable: true,
    value: dom.window.CustomEvent,
  });

  const actEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

  const hookRef: {
    current: ReturnType<typeof useCareerTalentContexts> | null;
  } = { current: null };
  const Harness = () => {
    hookRef.current = useCareerTalentContexts({
      fetchWithAuth: (async () => Response.json({})) as FetchWithAuth,
      user: { id: "user-1" } as User,
    });
    return null;
  };
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () => {
      root.render(
        <MessagesProvider locale="en">
          <Harness />
        </MessagesProvider>
      );
    });
    assert.ok(hookRef.current);

    await act(async () => {
      hookRef.current?.applyPersistedTalentContexts({
        talentContextsUpdatedAt: "2026-09-08T00:00:00.000Z",
        talentMemories: [
          {
            collection: "memory",
            content: "Durable context",
            createdAt: "2026-09-08T00:00:00.000Z",
            id: 1,
            key: null,
            label: null,
            ref: 1,
            revision: 1,
            updatedAt: "2026-09-08T00:00:00.000Z",
          },
        ],
      });
    });
    assert.equal(hookRef.current?.talentMemories.length, 1);
    assert.equal(hookRef.current?.talentMemoriesLoaded, true);

    await act(async () => {
      hookRef.current?.applyPersistedTalentContexts({
        talentBrief: [],
        talentContextsUpdatedAt: "2026-09-08T00:01:00.000Z",
        talentMemories: undefined,
      });
    });
    assert.equal(hookRef.current?.talentMemories.length, 1);
    assert.equal(hookRef.current?.talentMemoriesLoaded, false);
  } finally {
    await act(async () => root.unmount());
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    if (previousDocument) {
      Object.defineProperty(globalThis, "document", previousDocument);
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
    if (previousEvent) {
      Object.defineProperty(globalThis, "Event", previousEvent);
    } else {
      Reflect.deleteProperty(globalThis, "Event");
    }
    if (previousCustomEvent) {
      Object.defineProperty(globalThis, "CustomEvent", previousCustomEvent);
    } else {
      Reflect.deleteProperty(globalThis, "CustomEvent");
    }
    dom.window.close();
  }
});
