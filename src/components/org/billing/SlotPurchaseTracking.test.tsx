import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import * as billingTypes from "@/lib/org/billing/types";

function load(file: URL, deps: Record<string, any>) {
  const loaded = { exports: {} as any };
  vm.runInNewContext(
    ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      module: loaded,
      exports: loaded.exports,
      process: { env: {} },
      require: (id: string) => {
        assert.ok(id in deps, id);
        return deps[id];
      },
    }
  );
  return loaded.exports;
}

test("modal open/reopen, close, submit and checkout return log without waiting for telemetry", async () => {
  const dom = new JSDOM("<div id='root'></div>", {
    url: "https://fixture.invalid/org/slots",
  });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  const logs: any[] = [];
  let submissions = 0;
  const tracking = load(
    new URL(
      "../../../hooks/org/useBillingPurchaseTracking.ts",
      import.meta.url
    ),
    {
      react: React,
      "@/lib/logEvent": {
        postLogEvent: (type: string, options: any) => {
          logs.push({ type, ...options.metadata });
          return new Promise(() => {}); // Never resolves: the UI must still respond.
        },
      },
    }
  );
  const Button = ({ children, variant, size, asChild, ...props }: any) => (
    <button {...props}>{children}</button>
  );
  const Icon = () => <span />;
  const { SlotPurchaseDialog } = load(
    new URL("./SlotPurchaseDialog.tsx", import.meta.url),
    {
      react: React,
      "react/jsx-runtime": jsx,
      "@/hooks/org/useBillingPurchaseTracking": tracking,
      "@/hooks/org/useOrgBillingFormat": {
        useOrgBillingFormat: () => ({
          formatBillingMoney: (amount: number) => `$${amount / 100}`,
        }),
      },
      "@/i18n/org/OrgLocaleProvider": {
        useOrgLocale: () => ({ c: (_ko: string, en: string) => en }),
      },
      "lucide-react": {
        CircleCheck: Icon,
        Layers: Icon,
        LoaderCircle: Icon,
        Minus: Icon,
        Plus: Icon,
      },
      "@/components/ui/button": { MuteButton: Button },
      "@/components/ui/input": { Input: (props: any) => <input {...props} /> },
      "@/components/common/TalentCareerModal": {
        default: ({ children, footer, headerActions }: any) => (
          <div>
            {headerActions}
            {children}
            {footer}
          </div>
        ),
      },
      "./BillingIntervalTabs": { BillingIntervalTabs: () => <div /> },
      "@/lib/org/billing/types": billingTypes,
    }
  );
  const context = { workspaceId: "workspace", source: "slots", preview: false };
  const root = createRoot(dom.window.document.getElementById("root")!);
  let open = true;
  const render = async (preview = false) => {
    await act(async () =>
      root.render(
        <React.StrictMode>
          <SlotPurchaseDialog
            open={open}
            tracking={{ ...context, preview }}
            initialInterval="month"
            initialQuantity={2}
            catalog={{
              available: true,
              amount: 24900,
              annualAmount: 238800,
              currency: "usd",
            }}
            busy={false}
            error=""
            onOpenChange={(value: boolean) => {
              open = value;
            }}
            onCheckout={() => {
              submissions++;
            }}
          />
        </React.StrictMode>
      )
    );
  };
  try {
    await render();
    await render();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].type, "org_billing_purchase_modal_opened");
    await act(async () =>
      dom.window.document
        .querySelector("form")!
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true })
        )
    );
    assert.equal(submissions, 1);
    assert.equal(logs.at(-1).type, "org_billing_checkout_submitted");
    const close = [...dom.window.document.querySelectorAll("button")].find(
      (b) => b.textContent === "Close"
    )!;
    await act(async () => close.click());
    assert.equal(open, false);
    assert.equal(logs.at(-1).type, "org_billing_purchase_modal_closed");
    await render();
    open = true;
    await render();
    assert.equal(
      logs.filter((l) => l.type === "org_billing_purchase_modal_opened").length,
      2
    );
    open = false;
    await render();
    open = true;
    const count = logs.length;
    await render(true);
    assert.equal(
      logs.length,
      count,
      "preview does not pollute production logs"
    );
    const Return = ({ result }: { result: string }) => {
      tracking.useBillingCheckoutReturnLog(context, result, "cs_fixture");
      return null;
    };
    await act(async () =>
      root.render(
        <React.StrictMode>
          <Return result="cancelled" />
        </React.StrictMode>
      )
    );
    await act(async () =>
      root.render(
        <React.StrictMode>
          <Return result="cancelled" />
        </React.StrictMode>
      )
    );
    assert.equal(
      logs.filter((l) => l.type === "org_billing_checkout_returned").length,
      1
    );
    assert.equal(logs.at(-1).result, "cancelled");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
