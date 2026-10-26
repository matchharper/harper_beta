import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRequire } from "node:module";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://history-ui-test.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-only";

import { JSDOM } from "jsdom";
const dom = new JSDOM("<div id='history-root'></div>", {
  url: "https://history-ui-test.invalid",
});
const keys = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "getComputedStyle",
  "CustomEvent",
  "NodeFilter",
  "HTMLInputElement",
  "MutationObserver",
  "BroadcastChannel",
] as const;
const original = new Map(
  keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
);
for (const key of keys)
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: (dom.window as any)[key],
  });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// UI-only contract fixtures. No company data, requests, or model calls.
test("pending summary is a skeleton, retry/failed retain an explicit state, and completed summary renders verbatim", async () => {
  const { MatchingHistorySummary } = await import("./OrgRoleMatchingHistory");
  const pending = renderToStaticMarkup(
    <MatchingHistorySummary
      item={{ summary: null, summaryStatus: "pending" }}
    />
  );
  assert.ok(pending.includes('role="status"'));
  assert.ok(pending.includes("animate-pulse"));
  for (const summaryStatus of ["retry", "failed"]) {
    const html = renderToStaticMarkup(
      <MatchingHistorySummary item={{ summary: null, summaryStatus }} />
    );
    assert.ok(!html.includes("animate-pulse"));
    assert.ok(html.includes("원문"));
  }
  const ready = renderToStaticMarkup(
    <MatchingHistorySummary
      item={{
        summary: "필수 조건을 우대 조건으로 변경했어요.",
        summaryStatus: "completed",
      }}
    />
  );
  assert.ok(ready.includes("필수 조건을 우대 조건으로 변경했어요."));
});

test("history snapshots preserve long Brief and criterion text without editor controls", async () => {
  const { MatchingHistorySnapshot } = await import("./OrgRoleMatchingHistory");
  const suffix = "원문 마지막 조건을 유지합니다.";
  const html = renderToStaticMarkup(
    <MatchingHistorySnapshot
      title="변경 전"
      snapshot={{
        request: `## Hard constraints\n${"긴 원문 ".repeat(1000)}${suffix}`,
        criteria: [
          {
            name: "책임 범위",
            requirement: "must",
            criteria: `상세 근거 ${"프로필 근거 ".repeat(1000)}${suffix}`,
          },
        ],
      }}
    />
  );
  assert.ok(html.includes("변경 전"));
  assert.ok(html.includes("Hard constraints"));
  assert.ok(html.includes("필수"));
  assert.equal(html.split(suffix).length - 1, 2);
  assert.ok(!html.includes("textarea"));
  assert.ok(!html.includes("contenteditable"));
});

test("a pending history entry opens the actual before/after snapshot without sending a message", async (t) => {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { supabase } = createRequire(import.meta.url)("@/lib/supabase");
  const { OrgRoleMatchingHistory } = await import("./OrgRoleMatchingHistory");
  t.mock.method(supabase.auth, "getSession", async () => ({
    data: { session: { access_token: "test-only" } },
    error: null,
  }));
  const item = {
    id: "history",
    createdAt: "2026-10-22T01:00:00Z",
    actorLabel: "Synthetic teammate",
    source: "web",
    summary: null,
    summaryStatus: "pending",
  };
  const reads: URL[] = [];
  let failEarlierPage = true;
  let detailFailureStatus = 0;
  t.mock.method(globalThis, "fetch", async (input: any, init?: RequestInit) => {
    const url = new URL(String(input), "https://history-ui-test.invalid");
    assert.equal(url.pathname, "/api/org/role/matching-history");
    assert.equal(init?.method ?? "GET", "GET");
    reads.push(url);
    if (url.searchParams.has("historyId") && detailFailureStatus) {
      return Response.json(
        { error: "Read failure" },
        { status: detailFailureStatus }
      );
    }
    assert.equal(url.searchParams.get("workspaceId"), "workspace");
    assert.equal(url.searchParams.get("roleId"), "role");
    if (url.searchParams.get("offset") === "1") {
      if (failEarlierPage) {
        failEarlierPage = false;
        return Response.json(
          { error: "Temporary read failure" },
          { status: 500 }
        );
      }
      return Response.json({
        items: [
          {
            ...item,
            id: "earlier",
            summary: "Earlier saved change",
            summaryStatus: "completed",
          },
        ],
        total: 2,
        nextOffset: null,
      });
    }
    return new Response(
      JSON.stringify(
        url.searchParams.has("historyId")
          ? {
              ...item,
              before: {
                request: "Original hiring requirement",
                criteria: [
                  { name: "Original criterion", criteria: "Original evidence" },
                ],
              },
              after: {
                request: "Revised hiring preference",
                criteria: [
                  { name: "Revised criterion", criteria: "Revised evidence" },
                ],
              },
            }
          : { items: [item], total: 2, nextOffset: 1 }
      ),
      { headers: { "content-type": "application/json" } }
    );
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const root = createRoot(dom.window.document.getElementById("history-root")!);
  try {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <OrgRoleMatchingHistory workspaceId="workspace" roleId="role" />
        </QueryClientProvider>
      );
    });
    assert.equal(reads.length, 0, "closed history does not fetch");
    const trigger =
      dom.window.document.querySelector<HTMLButtonElement>("button")!;
    await act(async () => trigger.click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    assert.ok(dom.window.document.querySelector('[role="dialog"]'));
    const buttonWithText = (label: string) =>
      [...dom.window.document.querySelectorAll("button")].find(
        (button) => button.textContent === label
      )!;
    await act(async () => buttonWithText("이전 변경 더 보기").click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    assert.ok(
      dom.window.document.querySelector('[role="alert"]'),
      "pagination failure stays recoverable"
    );
    assert.ok(
      dom.window.document.body.textContent?.includes("Synthetic teammate"),
      "loaded records survive pagination failure"
    );
    await act(async () => buttonWithText("다시 불러오기").click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    assert.ok(
      dom.window.document.body.textContent?.includes("Earlier saved change")
    );
    assert.equal(dom.window.document.querySelector('[role="alert"]'), null);
    assert.equal(buttonWithText("이전 변경 더 보기"), undefined);
    const row = [...dom.window.document.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Synthetic teammate")
    );
    assert.ok(row, "pending entry remains selectable");
    await act(async () => {
      row.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const text = dom.window.document.body.textContent!;
    for (const value of [
      "변경 전",
      "변경 후",
      "Revised hiring preference",
      "Revised evidence",
    ])
      assert.ok(text.includes(value), value);
    assert.equal(
      reads.filter((url) => url.searchParams.get("historyId") === "history")
        .length,
      1
    );
    assert.equal(
      dom.window.document.activeElement?.getAttribute("aria-label"),
      "변경 이력 목록으로"
    );
    assert.ok(
      !text.includes("Original hiring requirement"),
      "selected saved version opens first"
    );
    await act(async () => buttonWithText("변경 전").click());
    assert.equal(
      buttonWithText("변경 전").getAttribute("aria-pressed"),
      "true"
    );
    assert.ok(
      dom.window.document.body.textContent?.includes(
        "Original hiring requirement"
      )
    );
    assert.ok(
      dom.window.document.body.textContent?.includes("Original evidence")
    );
    assert.ok(
      !dom.window.document.body.textContent?.includes(
        "Revised hiring preference"
      )
    );
    const refreshDetail = async () => {
      await act(async () => {
        await client.refetchQueries({
          queryKey: [
            "org",
            "matching-criteria-history",
            "workspace",
            "role",
            "detail",
            "history",
          ],
        });
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
    };
    detailFailureStatus = 500;
    await refreshDetail();
    assert.ok(
      dom.window.document.body.textContent?.includes(
        "Original hiring requirement"
      ),
      "a summary refresh failure does not hide the saved snapshot"
    );
    assert.ok(
      dom.window.document.body.textContent?.includes(
        "최신 요약을 불러오지 못했어요."
      )
    );
    detailFailureStatus = 403;
    await refreshDetail();
    assert.ok(
      !dom.window.document.body.textContent?.includes(
        "Original hiring requirement"
      ),
      "revoked access hides cached snapshot"
    );
    assert.equal(buttonWithText("변경 전"), undefined);
    detailFailureStatus = 0;
    await refreshDetail();
    await act(async () => {
      dom.window.document
        .querySelector<HTMLButtonElement>('[aria-label="변경 이력 목록으로"]')!
        .click();
    });
    assert.ok(
      dom.window.document.activeElement?.textContent?.includes(
        "Synthetic teammate"
      )
    );
    await act(async () => {
      dom.window.document.activeElement?.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        })
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    assert.equal(dom.window.document.querySelector('[role="dialog"]'), null);
    assert.equal(dom.window.document.activeElement, trigger);
    await act(async () => trigger.click());
    await act(async () => {
      dom.window.document
        .querySelector<HTMLButtonElement>('[aria-label="변경 이력 닫기"]')!
        .click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    assert.equal(dom.window.document.querySelector('[role="dialog"]'), null);
    assert.equal(dom.window.document.activeElement, trigger);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    supabase.auth.stopAutoRefresh();
  }
});

test.after(() => {
  for (const key of keys) {
    const descriptor = original.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as any)[key];
  }
  dom.window.close();
});
