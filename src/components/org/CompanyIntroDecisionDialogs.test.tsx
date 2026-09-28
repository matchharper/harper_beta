import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

// DOM interaction only: no authentication, API, or candidate contact.
test("Intro submits without a process stage and displays validation errors", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const globals = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLButtonElement",
    "Element",
    "Node",
    "NodeFilter",
    "Event",
    "MutationObserver",
    "CustomEvent",
    "getComputedStyle",
  ] as const;
  const saved = new Map(
    globals.map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  );
  for (const key of globals)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: (dom.window as any)[key],
    });
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { CompanyIntroRequestDialog } =
    await import("./CompanyIntroDecisionDialogs");
  const root = createRoot(dom.window.document.getElementById("root")!);
  const submissions: unknown[] = [];
  try {
    await act(async () => {
      root.render(
        <CompanyIntroRequestDialog
          candidateName="Synthetic Candidate"
          defaultEmail="member@example.invalid"
          onClose={() => {}}
          onSubmit={async (value) => {
            submissions.push(value);
          }}
          open
          pending={false}
        />
      );
    });
    const form = dom.window.document.querySelector("form")!;
    const input = dom.window.document.querySelector("textarea")!;
    const submit = () =>
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true })
      );
    await act(async () => {
      submit();
    });
    assert.equal(submissions.length, 0);
    assert.ok(dom.window.document.querySelector('[role="alert"]')?.textContent);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLTextAreaElement.prototype,
        "value"
      )!.set!.call(input, "운영 경험을 이야기하고 싶습니다.");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await act(async () => {
      submit();
    });
    assert.deepEqual(submissions, [
      {
        companyAppeal: "운영 경험을 이야기하고 싶습니다.",
        introRecipientEmails: ["member@example.invalid"],
      },
    ]);
    assert.equal(dom.window.document.querySelector('[role="alert"]'), null);
    assert.equal(
      dom.window.document.querySelectorAll('[role="combobox"]').length,
      0
    );
  } finally {
    await act(async () => {
      root.unmount();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    for (const key of globals) {
      const descriptor = saved.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
    dom.window.close();
  }
});
