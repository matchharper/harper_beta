import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { BillingPlanSummary } from "./BillingPlanSummary";
import { BillingSlots } from "./BillingSlots";
import {
  isEndedBillingSlot,
  type BillingSlot,
  type BillingSummary,
} from "@/lib/org/billing/types";

const end = "2099-02-01T00:00:00Z";
const grant: BillingSlot = {
  id: "grant",
  source: "grant",
  label: "Slot 1",
  roleId: null,
  roleName: null,
  status: "active",
  startedAt: "2099-01-01T00:00:00Z",
  periodEnd: end,
  billingInterval: "month",
  creditsRenewAt: end,
  cancelAt: end,
  endedAt: end,
  remaining: 50,
  active: true,
  revision: 1,
};
const summary: BillingSummary = {
  workspaceId: "workspace",
  model: "slot",
  activeRoles: 0,
  capacity: 1,
  slots: [grant],
  hasCustomer: false,
  canManage: true,
  freeRenewsAt: null,
  creditSlots: [
    {
      id: grant.id,
      slotId: grant.id,
      label: grant.label,
      roleId: null,
      roleName: null,
      remaining: 50,
      allowance: 50,
      renewsAt: end,
      cancelAt: end,
    },
  ],
};
const noop = () => {};
const date = (value: string | null) => value ?? "—";

test("complimentary slot shows its expiry without promising renewal or charging", () => {
  const html = renderToStaticMarkup(
    <BillingSlots
      summary={summary}
      locale="ko"
      busy={false}
      canManage
      canAssign
      canViewBilling
      date={date}
      onAddSlot={noop}
      onCancel={noop}
      onResume={noop}
      onAssign={noop}
      onPortal={noop}
    />
  );
  assert.match(html, /제공 슬롯/);
  assert.match(html, /자동 결제 없음/);
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelector("time")?.dateTime, end);
  assert.match(document.querySelector("time")?.textContent ?? "", /만료/);
  assert.doesNotMatch(html, /월간 구독|자동 갱신|크레딧 갱신/);
  assert.equal(isEndedBillingSlot(grant), false);
  assert.equal(
    isEndedBillingSlot({ ...grant, active: false }, Date.parse(end)),
    true
  );
});

test("mixed plan summary only uses subscriptions for the next payment", () => {
  const subscription = {
    ...grant,
    id: "paid",
    source: "stripe" as const,
    cancelAt: null,
    endedAt: null,
    periodEnd: "2099-03-01T00:00:00Z",
  };
  const mixed = {
    ...summary,
    slots: [grant, subscription],
    capacity: 2,
    hasCustomer: true,
  };
  const html = renderToStaticMarkup(
    <BillingPlanSummary
      summary={mixed}
      locale="ko"
      busy={false}
      date={date}
      onPortal={noop}
      onAddSlot={noop}
    />
  );
  assert.match(html, /슬롯 2개/);
  assert.match(html, /2099-03-01/);
  assert.doesNotMatch(html, /2099-02-01/);
  const onlyGrant = renderToStaticMarkup(
    <BillingPlanSummary
      summary={summary}
      locale="en"
      busy={false}
      date={date}
      onPortal={noop}
      onAddSlot={noop}
    />
  );
  assert.match(onlyGrant, /complimentary slots/);
  assert.doesNotMatch(
    onlyGrant,
    /next subscription payment|renewal is cancelled/
  );
});

test("shared credits coexist with a paid Slot without appearing as an assignable Slot", () => {
  const shared = {
    id: "free",
    slotId: null,
    roleId: null,
    roleName: null,
    label: "Shared credits",
    remaining: 7,
    allowance: 10,
    renewsAt: end,
    cancelAt: null,
  };
  for (const locale of ["ko", "en"] as const) {
    const html = renderToStaticMarkup(
      <BillingSlots
        summary={{
          ...summary,
          capacity: null,
          activeRoles: 3,
          creditSlots: [shared, ...summary.creditSlots],
        }}
        locale={locale}
        busy={false}
        canManage
        canViewBilling
        canAssign
        roles={[
          { roleId: "new-role", name: "New Role", status: "active" },
          { roleId: "second-role", name: "Second Role", status: "active" },
          { roleId: "third-role", name: "Third Role", status: "active" },
        ]}
        date={(value) => value ?? "—"}
        onAddSlot={() => {}}
        onCancel={() => {}}
        onResume={() => {}}
        onAssign={() => {}}
        onPortal={() => {}}
      />
    );
    assert.ok(
      html.includes(
        locale === "ko" ? "공용 크레딧 7개 남음" : "7 shared credits left"
      )
    );
    const document = new JSDOM(html).window.document;
    assert.equal(document.querySelectorAll("ul a").length, 3);
    assert.ok(html.includes("50"));
    assert.ok(!html.includes("Free slot") && !html.includes("무료 슬롯"));
  }
});
