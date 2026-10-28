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
import * as assignments from "@/lib/org/billing/assignments";
import * as billingTypes from "@/lib/org/billing/types";
import { OrgActionPicker } from "../OrgActionPicker";

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
      setTimeout,
      clearTimeout,
      require: (id: string) => {
        assert.ok(id in deps, id);
        return deps[id];
      },
    }
  );
  return loaded.exports;
}
const slot = (
  id: string,
  roleId: string | null = null
): billingTypes.BillingSlot => ({
  id,
  roleId,
  label: id,
  roleName: roleId,
  revision: 4,
  active: true,
  status: "active",
  startedAt: "2026-10-27",
  periodEnd: null,
  billingInterval: "month",
  creditsRenewAt: null,
  cancelAt: null,
  endedAt: null,
  remaining: 50,
});
const initialSummary: billingTypes.BillingSummary = {
  workspaceId: "workspace",
  model: "slot",
  activeRoles: 2,
  capacity: 4,
  slots: [slot("older-empty"), slot("purchased"), slot("already-paid", "paid")],
  creditSlots: [],
  freeRenewsAt: null,
  hasCustomer: true,
  canManage: true,
};
const roles = [
  { roleId: "free", name: "Backend Engineer", status: "active" },
  { roleId: "paid", name: "Designer", status: "active" },
  { roleId: "draft", name: "Draft Role", status: "draft" },
  { roleId: "paused", name: "Paused Role", status: "paused" },
];

test("choice only includes active Free Roles and the confirmed checkout's available slots", () => {
  const options = assignments.purchasedSlotAssignmentOptions(
    initialSummary,
    roles,
    ["purchased", "already-paid"]
  );
  assert.deepEqual(
    options.slots.map((s) => s.id),
    ["purchased"]
  );
  assert.deepEqual(
    options.roles.map((r) => r.roleId),
    ["free"]
  );
  assert.equal(
    assignments.purchasedSlotAssignmentOptions(initialSummary, roles, []).slots
      .length,
    0
  );
  assert.equal(
    assignments.purchasedSlotAssignmentOptions(
      {
        ...initialSummary,
        slots: [slot("purchased", "free"), slot("already-paid", "paid")],
      },
      roles,
      ["purchased"]
    ).roles.length,
    0
  );
});

test("checkout opens the shared picker without waiting for other refreshes; assignment retries and Not now work", async () => {
  const dom = new JSDOM("<div id='root'></div>");
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
  const noop = () => {};
  const Empty = () => null;
  const c = (ko: string, _en: string, values: Record<string, unknown> = {}) =>
    ko.replace(/\{(\w+)\}/g, (_, key) => String(values[key]));
  const locale = { useOrgLocale: () => ({ locale: "ko", c }) };
  const Modal = ({
    open,
    title,
    description,
    children,
    footer,
    onClose,
  }: any) =>
    open ? (
      <section role="dialog">
        <h2>{title}</h2>
        <p>{description}</p>
        {children}
        {footer}
        <button onClick={onClose}>Close</button>
      </section>
    ) : null;
  const Button = ({ children, variant, size, asChild, ...props }: any) => (
    <button {...props}>{children}</button>
  );
  const base = {
    react: React,
    "react/jsx-runtime": jsx,
    "@/i18n/org/OrgLocaleProvider": locale,
    "@/components/common/TalentCareerModal": { default: Modal },
    "@/components/ui/button": { MuteButton: Button },
  };
  const dialog = load(
    new URL("./SlotRoleAssignmentDialog.tsx", import.meta.url),
    {
      ...base,
      "lucide-react": { BriefcaseBusiness: Empty, Layers: Empty },
      "../OrgActionPicker": { OrgActionPicker },
    }
  );
  let summary = initialSummary;
  const requestCalls: { action: string; values: any }[] = [];
  const messages: any[] = [];
  let visibleRoles = [
    ...roles,
    { roleId: "other-free", name: "Product Engineer", status: "active" },
  ];
  let resolveConfirm: (value: any) => void;
  let resolveAssign: () => void;
  let rejectAssign: (error: Error) => void;
  const router = {
    pathname: "/org/slots",
    query: { checkout: "cancelled", session_id: "cs_purchase" },
    replace: async () => true,
  };
  const billing = {
    data: { summary, catalog: { available: true } },
    isFetching: false,
    isError: false,
    isLoading: false,
    refetch: async () => ({ data: { summary } }),
    invalidateDependents: () => new Promise(() => {}),
  };
  const page = load(
    new URL("../workspace/pages/OrgBillingPage.tsx", import.meta.url),
    {
      ...base,
      "@/hooks/org/useBillingPurchaseTracking": {
        useBillingCheckoutReturnLog: noop,
      },
      "@/hooks/org/useOrgBillingFormat": {
        useOrgBillingFormat: () => ({ date: () => "" }),
      },
      "@/lib/org/billing/compat": { isSlotPurchase: () => false },
      "next/router": { useRouter: () => router },
      "next/link": { default: Empty },
      "@tanstack/react-query": {
        useQueryClient: () => ({
          invalidateQueries: () => new Promise(() => {}),
        }),
      },
      "lucide-react": { ArrowRight: Empty, LoaderCircle: Empty },
      "../OrgPageHeader": { OrgPageHeader: () => <div>Slots page</div> },
      "@/components/ui/badge": { Badge: Empty },
      "@/components/ui/skeleton": { Skeleton: Empty },
      "@/components/org/billing/BillingSlots": {
        BillingSlots: () => <button>Page stays usable</button>,
      },
      "@/components/org/billing/BillingPlanSummary": {
        BillingPlanSummary: Empty,
      },
      "@/components/org/billing/BillingHistory": {
        BillingInvoiceHistory: Empty,
        BillingUsageHistory: Empty,
      },
      "@/store/useToastStore": {
        useToastStore: () => (message: any) => messages.push(message),
      },
      "@/components/org/billing/SlotPurchaseDialog": {
        SlotPurchaseDialog: Empty,
      },
      "@/components/org/billing/SlotRoleAssignmentDialog": dialog,
      "@/components/org/internal/OrgBillingDevControls": {
        OrgBillingPreviewNotice: Empty,
      },
      "@/components/org/internal/OrgBillingPortalPreview": {
        OrgBillingPaymentPreview: Empty,
        OrgBillingPortalPreview: Empty,
      },
      "@/store/useOrgBillingPreviewStore": {
        useOrgBillingPreview: () => ({ setPreview: noop }),
      },
      "@/hooks/org/useOrgWorkspace": {
        useOrgWorkspace: () => ({
          workspace: { workspaceId: "workspace" },
          roles: visibleRoles,
          permissions: { role: "owner", canManageWorkspace: true },
        }),
      },
      "@/i18n/org/errorMessage": {
        localizedOrgErrorMessage: (error: Error) => error.message,
      },
      "@/hooks/org/useOrgBilling": {
        useOrgBilling: () => ({
          ...billing,
          data: { ...billing.data, summary },
        }),
        billingRequest: (_id: string, action: string, values: any) => {
          requestCalls.push({ action, values });
          return new Promise((resolve, reject) => {
            if (action === "confirm") resolveConfirm = resolve;
            else {
              resolveAssign = () => resolve({ ok: true });
              rejectAssign = reject;
            }
          });
        },
      },
      "@/lib/org/billing/types": billingTypes,
      "@/lib/org/billing/assignments": assignments,
      "@/lib/org/billing/preview": { previewAssignRole: noop },
    }
  );
  let root = createRoot(dom.window.document.getElementById("root")!);
  const render = () =>
    act(async () => root.render(<page.OrgBillingPage section="slots" />));
  const choose = () =>
    dom.window.document.querySelector<HTMLButtonElement>(
      '[aria-label="Backend Engineer에 슬롯 배정"]'
    )!;
  try {
    await render();
    assert.equal(
      requestCalls.length,
      0,
      "cancelled checkout never opens a chooser"
    );
    router.query.checkout = "success";
    await render();
    assert.equal(dom.window.document.querySelector('[role="dialog"]'), null);
    await act(async () =>
      resolveConfirm!({ confirmed: true, purchasedSlotIds: ["purchased"] })
    );
    assert.ok(dom.window.document.querySelector('[role="dialog"]'));
    assert.ok(choose());
    assert.equal(
      dom.window.document.querySelectorAll(
        '[aria-label="슬롯을 배정할 역할"] li'
      ).length,
      2
    );
    assert.match(dom.window.document.body.textContent!, /Page stays usable/);
    await act(async () => choose().click());
    assert.deepEqual(
      { ...requestCalls.at(-1)?.values },
      { slotId: "purchased", revision: 4, roleId: "free" }
    );
    await act(async () =>
      rejectAssign!(new Error("배정을 저장하지 못했어요."))
    );
    assert.match(
      dom.window.document.querySelector('[role="dialog"] [role="alert"]')!
        .textContent!,
      /저장하지 못했어요/
    );
    await act(async () => choose().click());
    summary = {
      ...summary,
      slots: summary.slots.map((s) =>
        s.id === "purchased" ? { ...s, roleId: "free" } : s
      ),
    };
    await act(async () => resolveAssign!());
    assert.equal(dom.window.document.querySelector('[role="dialog"]'), null);
    assert.match(messages.at(-1).message, /Backend Engineer에 슬롯을 배정/);
    await render();
    assert.equal(requestCalls.filter((r) => r.action === "confirm").length, 1);

    await act(async () => root.unmount());
    summary = initialSummary;
    root = createRoot(dom.window.document.getElementById("root")!);
    await render();
    await act(async () =>
      resolveConfirm!({ confirmed: true, purchasedSlotIds: ["purchased"] })
    );
    const count = requestCalls.length;
    const later = [...dom.window.document.querySelectorAll("button")].find(
      (b) => b.textContent === "나중에"
    )!;
    await act(async () => later.click());
    await render();
    assert.equal(dom.window.document.querySelector('[role="dialog"]'), null);
    assert.equal(
      requestCalls.length,
      count,
      "Not now leaves the purchased slot unassigned"
    );
    await act(async () => root.unmount());
    visibleRoles = roles;
    summary = {
      ...initialSummary,
      slots: initialSummary.slots.map((s) =>
        s.id === "purchased" ? { ...s, roleId: "free" } : s
      ),
    };
    root = createRoot(dom.window.document.getElementById("root")!);
    await render();
    const beforeAutomatic = requestCalls.length;
    await act(async () =>
      resolveConfirm!({
        confirmed: true,
        purchasedSlotIds: ["purchased"],
        transferredRoleName: "Backend Engineer",
      })
    );
    assert.equal(
      dom.window.document.querySelector('[role="dialog"]'),
      null,
      "the only eligible Role was already assigned by confirmation, so no chooser opens"
    );
    assert.equal(
      requestCalls.length,
      beforeAutomatic,
      "the browser does not duplicate the automatic assignment"
    );
    assert.match(messages.at(-1).message, /Backend Engineer/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
