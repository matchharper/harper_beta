import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useApplicationComposerDraft } from "./useApplicationComposerDraft";

// Preparation no longer owns an active session or polls. Drafts live in the
// shared composer; ApplicationHistory.test.tsx covers its read-only predecessor.
test("unsubmitted answers survive switching forms and remounting without mixing scopes", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const globals = { window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  let draft!: ReturnType<typeof useApplicationComposerDraft<string>>;
  function Editor({ scope }: { scope: string }) { draft = useApplicationComposerDraft(scope); return null; }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = async (scope: string) => act(async () => root.render(<Editor key={scope} scope={scope} />));
  try {
    await render("form-a");
    await act(async () => draft[1]({ answer: "Unsubmitted A" }));
    await render("form-b");
    assert.deepEqual(draft[0], {});
    await act(async () => draft[1]({ answer: "Unsubmitted B" }));
    await render("form-a");
    assert.equal(draft[0].answer, "Unsubmitted A");
    await act(async () => root.render(null));
    await render("form-b");
    assert.equal(draft[0].answer, "Unsubmitted B");
    await act(async () => draft[2]());
    await render("form-a");
    assert.equal(draft[0].answer, "Unsubmitted A", "clearing B preserves A");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
});
