import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

test("dismisses an armed message delete action after an outside click", async () => {
  const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { CareerMessageDevActions } = await import("./CareerMessageDevActions");

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
  });
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document"
  );
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: dom.window,
  });

  const actEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  let deleteCallCount = 0;

  try {
    await act(async () => {
      root.render(
        <>
          <div data-career-message-container="true">
            <span data-message-bubble="true">메시지</span>
            <CareerMessageDevActions
              isUser
              message={{
                content: "테스트 메시지",
                createdAt: "2026-09-05T00:00:00.000Z",
                id: 42,
                messageType: "chat",
                role: "user",
              }}
              onDeleteMessage={() => {
                deleteCallCount += 1;
                return true;
              }}
            />
          </div>
          <button data-outside="true" type="button">
            바깥
          </button>
        </>
      );
    });

    const getDeleteButton = () =>
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="메시지 삭제"]'
      );
    const getConfirmButton = () =>
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="메시지 삭제를 확정하려면 다시 누르세요."]'
      );
    const actions = container.querySelector<HTMLDivElement>(
      '[data-career-i18n-skip="true"]'
    );
    const messageContainer = container.querySelector<HTMLElement>(
      '[data-career-message-container="true"]'
    );
    const messageBubble = container.querySelector<HTMLElement>(
      '[data-message-bubble="true"]'
    );
    const outside = container.querySelector<HTMLElement>(
      '[data-outside="true"]'
    );
    assert.ok(actions);
    assert.ok(messageContainer);
    assert.ok(messageBubble);
    assert.ok(outside);

    const deleteButton = getDeleteButton();
    assert.ok(deleteButton);
    await act(async () => deleteButton.click());

    const confirmButton = getConfirmButton();
    assert.ok(confirmButton);
    assert.equal(confirmButton.textContent, "확인");
    assert.match(actions.className, /pointer-events-auto opacity-100/);

    await act(async () => confirmButton.focus());
    await act(async () => {
      messageBubble.dispatchEvent(
        new dom.window.MouseEvent("pointerdown", { bubbles: true })
      );
    });

    assert.ok(getDeleteButton());
    assert.equal(getConfirmButton(), null);
    assert.match(actions.className, /pointer-events-none opacity-0/);
    assert.doesNotMatch(actions.className, /group-hover:opacity-100/);
    assert.notEqual(dom.window.document.activeElement, confirmButton);
    assert.equal(deleteCallCount, 0);

    await act(async () => {
      messageContainer.dispatchEvent(
        new dom.window.MouseEvent("pointerleave", { bubbles: false })
      );
    });
    assert.match(actions.className, /group-hover:opacity-100/);

    await act(async () => getDeleteButton()?.click());
    assert.ok(getConfirmButton());
    await act(async () => {
      outside.dispatchEvent(
        new dom.window.MouseEvent("pointerdown", { bubbles: true })
      );
    });
    assert.ok(getDeleteButton());
    assert.equal(getConfirmButton(), null);
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
    if (previousSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
    }
    if (previousSupabaseAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousSupabaseAnonKey;
    }
    dom.window.close();
  }
});
