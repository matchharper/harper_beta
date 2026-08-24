import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ChatComposerFrame } from "@/components/chat/ChatComposer";
import { ChatComposerTokenOverlay } from "@/components/chat/ChatComposerTokenOverlay";

test("mobile composer expands after release and caps textarea growth at four rows", async () => {
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
  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: true }),
  });
  Object.defineProperties(dom.window.HTMLElement.prototype, {
    attachEvent: {
      configurable: true,
      value: () => undefined,
    },
    detachEvent: {
      configurable: true,
      value: () => undefined,
    },
  });
  const actEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () => {
      root.render(
        <ChatComposerFrame
          action={<button type="button">send</button>}
          mobileLeadingAction={<button type="button">add</button>}
          onChange={() => undefined}
          value=""
        />
      );
    });

    const composer = container.firstElementChild as HTMLDivElement;
    const textarea = container.querySelector("textarea");
    assert.ok(textarea);
    const restingSurfaceClassName = composer.className;
    assert.equal(composer.dataset.expanded, "false");
    assert.equal(textarea.rows, 1);
    assert.match(textarea.className, /max-md:truncate/);

    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 200,
    });

    await act(async () => textarea.focus());
    assert.equal(composer.dataset.expanded, "true");
    assert.equal(composer.className, restingSurfaceClassName);
    assert.match(textarea.className, /max-md:min-h-12/);
    assert.match(textarea.className, /max-md:py-3/);
    assert.doesNotMatch(textarea.className, /max-md:min-h-11|max-md:pb-2/);
    assert.equal(textarea.style.height, "80px");
    assert.equal(textarea.style.overflowY, "auto");

    await act(async () => textarea.blur());
    assert.equal(composer.dataset.expanded, "false");
    assert.equal(textarea.style.height, "");

    await act(async () => {
      composer.dispatchEvent(
        new dom.window.MouseEvent("pointerdown", { bubbles: true })
      );
      textarea.focus();
    });
    assert.equal(composer.dataset.expanded, "true");
    assert.match(composer.className, /max-md:scale-\[1\.01\]/);
    assert.match(composer.className, /max-md:duration-\[180ms\]/);

    await act(async () => {
      composer.dispatchEvent(
        new dom.window.MouseEvent("pointerup", { bubbles: true })
      );
    });
    assert.equal(composer.dataset.expanded, "true");
    assert.match(composer.className, /duration-\[240ms\]/);
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
    dom.window.close();
  }
});

test("a token tap expands a collapsed mobile composer before opening the opportunity", async () => {
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
  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: true }),
  });
  Object.defineProperties(dom.window.HTMLElement.prototype, {
    attachEvent: {
      configurable: true,
      value: () => undefined,
    },
    detachEvent: {
      configurable: true,
      value: () => undefined,
    },
  });
  const actEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  let tokenClickCount = 0;

  try {
    await act(async () => {
      root.render(
        <ChatComposerFrame
          action={<button type="button">send</button>}
          mobileLeadingAction={<button type="button">add</button>}
          onChange={() => undefined}
          overlay={
            <ChatComposerTokenOverlay
              onTokenClick={() => {
                tokenClickCount += 1;
              }}
              segments={[
                {
                  kind: "token",
                  text: "Harper · Applied AI Engineer",
                  token: {
                    data: { roleId: "role_1" },
                    end: 28,
                    id: "recommendation_1",
                    start: 0,
                    text: "Harper · Applied AI Engineer",
                  },
                },
              ]}
              stackTokens
            />
          }
          value="Harper · Applied AI Engineer"
        />
      );
    });

    const composer = container.firstElementChild as HTMLDivElement;
    const textarea = container.querySelector("textarea");
    const tokenButton = container.querySelector(
      "[data-chat-composer-token]"
    ) as HTMLButtonElement | null;
    assert.ok(textarea);
    assert.ok(tokenButton);
    assert.equal(composer.dataset.expanded, "false");

    await act(async () => {
      tokenButton.dispatchEvent(
        new dom.window.MouseEvent("click", {
          bubbles: true,
          cancelable: true,
        })
      );
    });

    assert.equal(composer.dataset.expanded, "true");
    assert.equal(dom.window.document.activeElement, textarea);
    assert.equal(tokenClickCount, 0);

    await act(async () => {
      tokenButton.dispatchEvent(
        new dom.window.MouseEvent("click", {
          bubbles: true,
          cancelable: true,
        })
      );
    });

    assert.equal(tokenClickCount, 1);
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
    dom.window.close();
  }
});
