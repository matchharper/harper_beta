import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { BillingCredits } from "./BillingCredits";
import { billingErrorCopy, type BillingSummary } from "@/lib/org/billing/types";

const slots: BillingSummary["creditSlots"] = [
  {
    id: "a",
    slotId: "a",
    label: "Slot 1",
    roleId: "role-a",
    roleName: "Engineering",
    remaining: 0,
    allowance: 50,
    renewsAt: "2026-11-07T00:00:00Z",
    cancelAt: null,
  },
  {
    id: "b",
    slotId: "b",
    label: "Slot 2",
    roleId: "role-b",
    roleName: "Design",
    remaining: 50,
    allowance: 50,
    renewsAt: "2026-11-12T00:00:00Z",
    cancelAt: null,
  },
];
const summary: BillingSummary = {
  workspaceId: "fixture",
  model: "slot",
  activeRoles: 2,
  capacity: null,
  creditSlots: slots,
  freeRenewsAt: null,
  slots: [],
  hasCustomer: true,
  canManage: true,
};

test("credits render independent slot balances, assignments and dates without a shared meter", () => {
  for (const locale of ["ko", "en"] as const) {
    const dom = new JSDOM(
      renderToStaticMarkup(
        <BillingCredits
          summary={summary}
          locale={locale}
          date={(value) => value ?? "—"}
        />
      )
    );
    try {
      const rows = [...dom.window.document.querySelectorAll("li")];
      assert.equal(rows.length, 2);
      for (const [index, row] of rows.entries()) {
        const slot = slots[index];
        assert.ok(row.textContent?.includes(slot.label));
        assert.ok(row.textContent?.includes(slot.roleName!));
        assert.equal(
          row.querySelector('[role="meter"]')?.getAttribute("aria-valuenow"),
          String(slot.remaining)
        );
        assert.equal(
          row.querySelector('[role="meter"]')?.getAttribute("aria-valuemax"),
          "50"
        );
        assert.equal(
          row.querySelector("time")?.getAttribute("datetime"),
          slot.renewsAt
        );
      }
      assert.equal(
        dom.window.document.querySelectorAll('[role="meter"]').length,
        2
      );
      assert.equal(
        dom.window.document.querySelector('a[href^="mailto:"]'),
        null
      );
    } finally {
      dom.window.close();
    }
  }
});

test("Free has an unassigned ten-credit shared pool; Enterprise has no finite credit meter", () => {
  const free = {
    ...summary,
    model: "free" as const,
    creditSlots: [
      {
        ...slots[0],
        id: "free",
        slotId: null,
        label: "Free",
        allowance: 10,
        roleId: null,
        roleName: null,
        remaining: 3,
      },
    ],
  };
  for (const current of [
    free,
    { ...summary, model: "scale" as const, creditSlots: [] },
  ]) {
    const dom = new JSDOM(
      renderToStaticMarkup(
        <BillingCredits
          summary={current}
          locale="ko"
          date={(value) => value ?? "—"}
        />
      )
    );
    try {
      const meter = dom.window.document.querySelector('[role="meter"]');
      if (current.model === "free") {
        assert.equal(meter?.getAttribute("aria-valuemax"), "10");
        assert.equal(meter?.getAttribute("aria-valuenow"), "3");
      } else assert.equal(meter, null);
    } finally {
      dom.window.close();
    }
  }
});

test("missing or malformed credit slots show an error instead of crashing or claiming a zero balance", () => {
  for (const locale of ["ko", "en"] as const) {
    for (const model of ["free", "slot"] as const) {
      for (const creditSlots of [undefined, null, {}, "invalid"]) {
        const dom = new JSDOM(
          renderToStaticMarkup(
            <BillingCredits
              summary={{ ...summary, model, creditSlots } as BillingSummary}
              locale={locale}
              date={(value) => value ?? "—"}
            />
          )
        );
        try {
          assert.equal(
            dom.window.document.querySelector('[role="alert"]')?.textContent,
            billingErrorCopy("billing_unavailable", locale)
          );
          assert.equal(
            dom.window.document.querySelector('[role="meter"]'),
            null
          );
          assert.equal(dom.window.document.querySelector("ul"), null);
        } finally {
          dom.window.close();
        }
      }
    }
  }
});

test("an empty slot array and unlimited plans remain distinct from unavailable credits", () => {
  for (const current of [
    { ...summary, creditSlots: [] },
    { ...summary, model: "scale", creditSlots: undefined },
    { ...summary, model: "legacy", creditSlots: undefined },
  ]) {
    const dom = new JSDOM(
      renderToStaticMarkup(
        <BillingCredits
          summary={current as BillingSummary}
          locale="ko"
          date={(value) => value ?? "—"}
        />
      )
    );
    try {
      assert.equal(dom.window.document.querySelector('[role="alert"]'), null);
      assert.equal(dom.window.document.querySelector('[role="meter"]'), null);
      if (current.model === "scale")
        assert.ok(dom.window.document.body.textContent?.includes("무제한"));
    } finally {
      dom.window.close();
    }
  }
});
