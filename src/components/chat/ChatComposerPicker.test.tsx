import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ChatComposerPicker,
  type ChatComposerPickerItem,
  useChatComposerPickerKeyboard,
} from "@/components/chat/ChatComposerPicker";

async function withDom(
  run: (context: {
    container: HTMLDivElement;
    dom: JSDOM;
    outside: HTMLButtonElement;
    root: Root;
  }) => Promise<void>
) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
  });
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document"
  );
  const previousNode = Object.getOwnPropertyDescriptor(globalThis, "Node");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, "Node", {
    configurable: true,
    value: dom.window.Node,
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
  dom.window.HTMLElement.prototype.scrollIntoView = () => undefined;

  const container = dom.window.document.createElement("div");
  const outside = dom.window.document.createElement("button");
  dom.window.document.body.append(container, outside);
  const root = createRoot(container);

  try {
    await run({ container, dom, outside, root });
  } finally {
    await act(async () => root.unmount());
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    if (previousDocument) {
      Object.defineProperty(globalThis, "document", previousDocument);
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }
    if (previousNode) {
      Object.defineProperty(globalThis, "Node", previousNode);
    } else {
      Reflect.deleteProperty(globalThis, "Node");
    }
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
    dom.window.close();
  }
}

test("renders text, option, and action items in one full-width list", async () => {
  await withDom(async ({ container, dom, root }) => {
    let actionCount = 0;
    const items: ChatComposerPickerItem[] = [
      {
        id: "title",
        text: "Candidates",
        trailingText: "1명",
        type: "text",
      },
      {
        id: "candidate",
        imageSrc: "https://example.com/company-logo.png",
        onSelect: () => undefined,
        subText: "Product Engineer",
        text: "Alex Kim",
        trailingText: "추천",
        type: "option",
      },
      {
        id: "load-more",
        onSelect: () => {
          actionCount += 1;
        },
        text: "더 불러오기",
        type: "action",
      },
    ];

    await act(async () => {
      root.render(
        <ChatComposerPicker
          highlightedIndex={1}
          items={items}
          listId="picker-test"
          onClose={() => undefined}
          onHighlight={() => undefined}
        />
      );
    });

    const rootElement = container.firstElementChild as HTMLDivElement;
    assert.match(rootElement.className, /\bw-full\b/);
    assert.doesNotMatch(rootElement.className, /sm:w-/);

    const options = container.querySelectorAll('[role="option"]');
    assert.equal(options.length, 3);
    assert.equal(options[0]?.getAttribute("aria-disabled"), "true");
    assert.match(options[1]?.textContent ?? "", /Alex Kim/);
    assert.match(options[1]?.textContent ?? "", /Product Engineer/);
    assert.doesNotMatch(options[1]?.textContent ?? "", /company-logo/);
    assert.match((options[1] as HTMLElement).className, /whitespace-nowrap/);
    const trailingText = Array.from(
      options[1]?.querySelectorAll("span") ?? []
    ).find((element) => element.textContent === "추천");
    assert.ok(trailingText);
    assert.match(trailingText.className, /\bml-4\b/);
    assert.match(trailingText.className, /\bmin-w-0\b/);
    assert.doesNotMatch(trailingText.className, /\bmax-w-/);
    assert.match(
      (trailingText.previousElementSibling as HTMLElement).className,
      /\bflex-1\b/
    );
    assert.equal(
      options[1]?.querySelector("img")?.getAttribute("src"),
      "https://example.com/company-logo.png"
    );

    const loadMore = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("더 불러오기")
    );
    loadMore?.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true })
    );
    assert.equal(actionCount, 1);
  });
});

test("keyboard navigation skips text items and activates option and action items", async () => {
  await withDom(async ({ container, root }) => {
    const selected: string[] = [];
    let keyboardController:
      | ReturnType<typeof useChatComposerPickerKeyboard>
      | undefined;
    const items: ChatComposerPickerItem[] = [
      { id: "title", text: "Candidates", type: "text" },
      {
        id: "candidate",
        onSelect: () => selected.push("candidate"),
        text: "Alex Kim",
        type: "option",
      },
      {
        id: "load-more",
        onSelect: () => selected.push("load-more"),
        text: "더 불러오기",
        type: "action",
      },
    ];

    function Harness() {
      const picker = useChatComposerPickerKeyboard({
        isOpen: true,
        items,
        listId: "keyboard-picker",
        onClose: () => undefined,
      });
      keyboardController = picker;
      return (
        <>
          <textarea
            aria-activedescendant={picker.activeDescendantId}
            onKeyDown={picker.onKeyDown}
          />
          <ChatComposerPicker
            highlightedIndex={picker.highlightedIndex}
            items={items}
            listId="keyboard-picker"
            onClose={() => undefined}
            onHighlight={picker.setHighlightedIndex}
          />
        </>
      );
    }

    await act(async () => root.render(<Harness />));
    const textarea = container.querySelector("textarea");
    assert.ok(textarea);
    const keyboardEvent = (key: string) =>
      ({
        key,
        nativeEvent: { isComposing: false },
        preventDefault: () => undefined,
      }) as unknown as ReactKeyboardEvent<HTMLTextAreaElement>;
    const getKeyboardController = () => {
      assert.ok(keyboardController);
      return keyboardController;
    };
    assert.match(
      textarea.getAttribute("aria-activedescendant") ?? "",
      /candidate/
    );

    await act(async () => {
      getKeyboardController().onKeyDown(keyboardEvent("Enter"));
    });
    assert.deepEqual(selected, ["candidate"]);

    await act(async () => {
      getKeyboardController().onKeyDown(keyboardEvent("ArrowDown"));
    });
    assert.match(
      textarea.getAttribute("aria-activedescendant") ?? "",
      /load-more/
    );

    await act(async () => {
      getKeyboardController().onKeyDown(keyboardEvent("Enter"));
    });
    assert.deepEqual(selected, ["candidate", "load-more"]);
  });
});

test("nudges after an offscreen selection finishes its native scroll", async () => {
  await withDom(async ({ container, dom, root }) => {
    const items: ChatComposerPickerItem[] = [
      { id: "title", text: "Candidates", type: "text" },
      {
        id: "candidate-a",
        onSelect: () => undefined,
        text: "Alex Kim",
        type: "option",
      },
      {
        id: "candidate-b",
        onSelect: () => undefined,
        text: "Jamie Lee",
        type: "option",
      },
    ];
    const renderPicker = (
      highlightedIndex: number,
      navigationDirection: "down" | "up" | null
    ) =>
      root.render(
        <ChatComposerPicker
          highlightedIndex={highlightedIndex}
          items={items}
          listId="scroll-picker"
          navigationDirection={navigationDirection}
          onClose={() => undefined}
          onHighlight={() => undefined}
        />
      );

    await act(async () => renderPicker(1, null));
    const list = container.querySelector('[role="listbox"]') as HTMLDivElement;
    const options = container.querySelectorAll("button");
    const firstOption = options[0] as HTMLButtonElement;
    const secondOption = options[1] as HTMLButtonElement;
    Object.defineProperties(list, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 200 },
    });
    list.scrollTop = 20;
    list.getBoundingClientRect = () =>
      dom.window.DOMRect.fromRect({ height: 100, y: 0 });
    firstOption.getBoundingClientRect = () =>
      dom.window.DOMRect.fromRect({ height: 32, y: 72 });
    secondOption.getBoundingClientRect = () =>
      dom.window.DOMRect.fromRect({ height: 32, y: 104 });

    let nextFrameId = 0;
    const scheduledFrames = new Map<number, FrameRequestCallback>();
    dom.window.requestAnimationFrame = (callback) => {
      nextFrameId += 1;
      scheduledFrames.set(nextFrameId, callback);
      return nextFrameId;
    };
    dom.window.cancelAnimationFrame = (frameId) => {
      scheduledFrames.delete(frameId);
    };
    secondOption.scrollIntoView = () => {
      dom.window.requestAnimationFrame(() => {
        list.scrollTop = 40;
      });
    };

    await act(async () => renderPicker(2, "down"));
    assert.equal(list.scrollTop, 20);
    await act(async () => {
      const frames = [...scheduledFrames.values()];
      scheduledFrames.clear();
      frames.forEach((callback) => callback(0));
    });
    assert.equal(list.scrollTop, 48);

    await act(async () => renderPicker(1, "up"));
    assert.equal(list.scrollTop, 48);
  });
});

test("closes only when a pointer press starts outside the picker", async () => {
  await withDom(async ({ container, dom, outside, root }) => {
    let closeCount = 0;

    await act(async () => {
      root.render(
        <ChatComposerPicker
          highlightedIndex={0}
          items={[
            {
              id: "item",
              onSelect: () => undefined,
              text: "item",
              type: "option",
            },
          ]}
          listId="picker-test"
          onClose={() => {
            closeCount += 1;
          }}
          onHighlight={() => undefined}
        />
      );
    });

    container
      .querySelector('[role="option"]')
      ?.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
    assert.equal(closeCount, 0);

    outside.dispatchEvent(
      new dom.window.Event("pointerdown", { bubbles: true })
    );
    assert.equal(closeCount, 1);
  });
});
