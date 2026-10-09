import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { OrgLocaleProvider } from "@/i18n/org/OrgLocaleProvider";

test("Intro errors stay in the modal, retain the form, and use the selected language; chat notices render only when supplied", async () => {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id='root'></div></body></html>",
    {
      url: "http://localhost/org",
      pretendToBeVisual: true,
    }
  );
  const replacements: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Node: dom.window.Node,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    MutationObserver: dom.window.MutationObserver,
    CustomEvent: dom.window.CustomEvent,
    NodeFilter: dom.window.NodeFilter,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
    // JSDOM has no cross-tab browser transport; don't open Node MessagePorts.
    BroadcastChannel: undefined,
  };
  const originals = Object.fromEntries(
    Object.keys(replacements).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  );
  for (const [key, value] of Object.entries(replacements))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  const { createRoot } = await import("react-dom/client");
  const { CompanyIntroRequestDialog } =
    await import("../CompanyIntroDecisionDialogs");
  const { BillingActionNotice } = await import("./BillingActionNotice");
  const { billingErrorCopy, BILLING_SUPPORT_HREF } =
    await import("@/lib/org/billing/types");
  const { useToastStore } = await import("@/store/useToastStore");
  const root = createRoot(dom.window.document.getElementById("root")!);
  const toastBefore = useToastStore.getState();
  let submissions = 0;
  let closes = 0;
  try {
    for (const locale of ["ko", "en"] as const) {
      dom.window.localStorage.setItem("harper:org-locale", locale);
      await act(async () =>
        root.render(
          <OrgLocaleProvider key={locale}>
            <CompanyIntroRequestDialog
              candidateName="Test Candidate"
              defaultEmail="team@example.invalid"
              open
              pending={false}
              onClose={() => {
                closes++;
              }}
              onSubmit={async () => {
                submissions++;
                throw Object.assign(new Error("서버 한국어 오류"), {
                  billingCode: "credits_exhausted",
                });
              }}
            />
          </OrgLocaleProvider>
        )
      );
      const textarea = dom.window.document.querySelector("textarea")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLTextAreaElement.prototype,
          "value"
        )!.set!.call(textarea, "API reliability experience");
        textarea.dispatchEvent(
          new dom.window.Event("input", { bubbles: true })
        );
      });
      await act(async () =>
        dom.window.document
          .querySelector("form")!
          .dispatchEvent(
            new dom.window.Event("submit", { bubbles: true, cancelable: true })
          )
      );
      const alerts = dom.window.document.querySelectorAll('[role="alert"]');
      assert.equal(alerts.length, 1);
      assert.equal(
        alerts[0].textContent,
        billingErrorCopy("credits_exhausted", locale)
      );
      assert.equal(textarea.value, "API reliability experience");
      assert.equal(closes, 0);
      assert.deepEqual(useToastStore.getState(), toastBefore);

      await act(async () =>
        root.render(
          <OrgLocaleProvider key={`${locale}-chat`}>
            <BillingActionNotice
              metadata={{ billingNotice: { code: "credits_exhausted" } }}
            />
          </OrgLocaleProvider>
        )
      );
      assert.equal(
        dom.window.document.querySelectorAll('[role="status"]').length,
        1
      );
      assert.equal(
        dom.window.document.querySelector("a")?.getAttribute("href"),
        BILLING_SUPPORT_HREF
      );
      assert.ok(
        dom.window.document.body.textContent?.includes(
          billingErrorCopy("credits_exhausted", locale)
        )
      );
      await act(async () =>
        root.render(
          <OrgLocaleProvider>
            <BillingActionNotice metadata={{}} />
          </OrgLocaleProvider>
        )
      );
      assert.equal(dom.window.document.querySelector('[role="status"]'), null);
    }
    assert.equal(submissions, 2);
  } finally {
    await act(async () => root.unmount());
    const { supabase } = await import("@/lib/supabase");
    await supabase.auth.stopAutoRefresh();
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
