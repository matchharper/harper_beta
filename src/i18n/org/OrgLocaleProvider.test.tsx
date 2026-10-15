import assert from "node:assert/strict";
import test from "node:test";
import { act, useState } from "react";
import { JSDOM } from "jsdom";

test("persisted Org language updates copy and billing descendants together; pricing keeps its own language storage", async () => {
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>", {
    url: "http://localhost/org",
  });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
    BroadcastChannel: undefined,
  };
  const originals = Object.fromEntries(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  );
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  const { createRoot } = await import("react-dom/client");
  const { OrgLocaleProvider, OrgLocaleScope, useOrgLocale } =
    await import("./OrgLocaleProvider");
  const { useOrgBillingFormat } =
    await import("@/hooks/org/useOrgBillingFormat");
  const { BillingIntervalTabs } =
    await import("@/components/org/billing/BillingIntervalTabs");
  const root = createRoot(dom.window.document.getElementById("root")!);
  let selection: ReturnType<typeof useOrgLocale> | undefined;
  function Probe() {
    selection = useOrgLocale();
    const { c } = selection;
    const {
      date,
      formatBillingDaysUntil,
      formatBillingMoney,
      formatIntroCount,
    } = useOrgBillingFormat();
    return (
      <>
        <p data-copy>{c("선택된 언어", "Selected language")}</p>
        <p data-interpolation>
          {c(
            "{name}: {count}명 · {note}",
            "{count} candidates for {name} · {note}",
            {
              name: "팀{count}",
              count: 0,
              note: null,
            }
          )}
        </p>
        <p data-date>{date("2030-01-02T12:00:00Z")}</p>
        <p data-days>
          {formatBillingDaysUntil(
            "2030-01-03T12:00:00Z",
            Date.parse("2030-01-02T12:00:00Z")
          )}
        </p>
        <p data-money>{formatBillingMoney(20000, "usd")}</p>
        <p data-count>{formatIntroCount(2)}</p>
        <BillingIntervalTabs value="year" onChange={() => undefined} />
      </>
    );
  }
  const read = (name: string) =>
    dom.window.document.querySelector(`[data-${name}]`)!.textContent;
  let publicSelection = "en";
  function PricingSurface() {
    const [locale, setLocale] = useState<"ko" | "en">("en");
    return (
      <OrgLocaleScope
        locale={locale}
        setLocale={(next) => {
          publicSelection = next;
          setLocale(next);
        }}
      >
        <Probe />
      </OrgLocaleScope>
    );
  }
  try {
    dom.window.localStorage.setItem("harper:org-locale", "ko");
    await act(async () =>
      root.render(
        <OrgLocaleProvider>
          <Probe />
        </OrgLocaleProvider>
      )
    );
    assert.equal(read("copy"), "선택된 언어");
    assert.equal(read("interpolation"), "팀{count}: 0명 · ");
    assert.equal(read("days"), "1일 뒤");
    assert.equal(read("count"), "2 Intro");
    assert.ok(dom.window.document.querySelector('[aria-label="결제 주기"]'));
    const koreanDate = read("date");
    const koreanMoney = read("money");
    const copy = selection!.c;
    await act(async () =>
      root.render(
        <OrgLocaleProvider>
          <Probe />
        </OrgLocaleProvider>
      )
    );
    assert.equal(selection!.c, copy);

    await act(async () => selection!.setLocale("en"));
    assert.equal(read("copy"), "Selected language");
    assert.equal(read("interpolation"), "0 candidates for 팀{count} · ");
    assert.equal(read("days"), "in 1 day");
    assert.equal(read("count"), "2 Intros");
    assert.notEqual(read("date"), koreanDate);
    assert.notEqual(read("money"), koreanMoney);
    assert.ok(
      dom.window.document.querySelector('[aria-label="Billing period"]')
    );
    assert.equal(dom.window.localStorage.getItem("harper:org-locale"), "en");
    assert.equal(dom.window.document.documentElement.lang, "en");

    dom.window.localStorage.setItem("harper:org-locale", "ko");
    await act(async () =>
      dom.window.dispatchEvent(
        new dom.window.StorageEvent("storage", {
          key: "harper:org-locale",
          newValue: "ko",
        })
      )
    );
    assert.equal(read("copy"), "선택된 언어");
    assert.equal(read("date"), koreanDate);
    assert.equal(read("money"), koreanMoney);

    await act(async () => root.render(<PricingSurface />));
    assert.equal(read("copy"), "Selected language");
    await act(async () => selection!.setLocale("ko"));
    assert.equal(publicSelection, "ko");
    assert.equal(read("copy"), "선택된 언어");
    await act(async () => selection!.setLocale("en"));
    assert.equal(read("copy"), "Selected language");
    assert.equal(dom.window.localStorage.getItem("harper:org-locale"), "ko");
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
