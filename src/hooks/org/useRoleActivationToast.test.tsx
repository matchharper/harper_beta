import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { isOrgRoleCountedAsActive } from "@/lib/org/roleStatus";

test("only committed activation shows one dark toast after its assigned slot is confirmed; no UI waits", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  const messages: any[] = [];
  const pending: ((result: any) => void)[] = [];
  let rejectRead: (error: Error) => void;
  let calls = 0;
  let preview = false;
  const client = {
    invalidateQueries: async () => {},
    fetchQuery: (options: any) => {
      assert.equal(options.staleTime, 0);
      calls++;
      return new Promise((resolve, reject) => {
        pending.push(resolve);
        rejectRead = reject;
      });
    },
  };
  const c = (ko: string, _en: string, values: any) =>
    ko.replace("{role}", values.role);
  const deps: Record<string, any> = {
    react: React,
    "@tanstack/react-query": { useQueryClient: () => client },
    "@/i18n/org/OrgLocaleProvider": { useOrgLocale: () => ({ c }) },
    "@/store/useToastStore": {
      useToastStore: () => (message: any) => messages.push(message),
    },
    "@/store/useOrgBillingPreviewStore": {
      getOrgBillingPreview: () => preview,
    },
    "./useOrgBilling": {
      orgEntitlementsOptions: () => ({}),
      orgBillingKey: (id: string) => [id],
    },
    "@/lib/org/roleStatus": { isOrgRoleCountedAsActive },
  };
  const loaded = { exports: {} as any };
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL("./useRoleActivationToast.ts", import.meta.url),
        "utf8"
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }
    ).outputText,
    {
      module: loaded,
      exports: loaded.exports,
      require: (id: string) => {
        assert.ok(id in deps, id);
        return deps[id];
      },
      console: { warn: () => {} },
    }
  );
  function View({
    status,
    workspace = "workspace",
  }: {
    status: string;
    workspace?: string;
  }) {
    loaded.exports.useRoleActivationToast(workspace, [
      { roleId: "role", name: "Backend Engineer", status },
    ]);
    return <button>Ready</button>;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = async (status: string, workspace?: string) => {
    await act(async () =>
      root.render(
        <React.StrictMode>
          <View status={status} workspace={workspace} />
        </React.StrictMode>
      )
    );
  };
  try {
    await render("draft");
    await render("draft");
    assert.equal(calls, 0, "setup does not allocate or announce a slot");
    await render("active");
    assert.equal(
      dom.window.document.querySelector("button")?.textContent,
      "Ready"
    );
    assert.equal(messages.length, 0, "pending read never claims assignment");
    await render("active");
    assert.equal(calls, 1);
    await act(async () =>
      pending.shift()!({ creditSlots: [{ slotId: "slot", roleId: "role" }] })
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].variant, "dark");
    assert.match(messages[0].message, /Backend Engineer.*빈 슬롯.*배정/);
    await render("paused");
    await render("active");
    await act(async () => pending.shift()!({ creditSlots: [] }));
    assert.equal(messages.length, 2);
    assert.doesNotMatch(messages[1].message, /슬롯/);
    await render("paused");
    await render("active");
    await render("active", "other-workspace");
    await act(async () =>
      pending.shift()!({ creditSlots: [{ slotId: "slot", roleId: "role" }] })
    );
    assert.equal(
      messages.length,
      2,
      "switching workspace suppresses stale notices"
    );
    preview = true;
    await render("paused", "other-workspace");
    await render("active", "other-workspace");
    assert.equal(calls, 3, "preview does not read actual billing");
    preview = false;
    await render("paused", "other-workspace");
    await render("active", "other-workspace");
    await act(async () => rejectRead!(new Error("billing unavailable")));
    assert.equal(
      messages.length,
      3,
      "a failed slot read still confirms hiring"
    );
    assert.doesNotMatch(messages[2].message, /슬롯/);
    assert.equal(
      dom.window.document.querySelector("button")?.textContent,
      "Ready"
    );
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
  }
});
