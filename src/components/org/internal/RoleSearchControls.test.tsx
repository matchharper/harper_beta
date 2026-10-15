import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

test("manual search stays blue and disabled while queued/running, and history updates", async () => {
  const { supabase } = await import("@/lib/supabase");
  const dom = new JSDOM("<div id='root'></div>", {
    url: "http://localhost",
    pretendToBeVisual: true,
  });
  const keys = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const old = keys.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
  );
  keys.forEach((key) =>
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value:
        key === "IS_REACT_ACT_ENVIRONMENT" ? true : (dom.window as any)[key],
    })
  );
  const originalSession = supabase.auth.getSession;
  supabase.auth.getSession = async () =>
    ({ data: { session: { access_token: "fixture" } }, error: null }) as any;
  const oldFetch = globalThis.fetch;
  let status = "";
  let posts = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "POST") {
      posts++;
      status = "queued";
      return Response.json({ runId: "fixture-run", status });
    }
    return Response.json({
      offset: 0,
      nextOffset: null,
      activeRun:
        status === "queued" || status === "running"
          ? { id: "fixture-run", status }
          : null,
      items: status
        ? [
            {
              id: "fixture-run",
              status,
              trigger: "talent_first_requested",
              createdAt: "2026-10-15T00:00:00Z",
              startedAt: null,
              finishedAt: null,
              reviewedTalents: null,
              candidateProposalsSelected: null,
              companyProposals: null,
            },
          ]
        : [],
    });
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 35));
    });
  const button = () => dom.window.document.querySelector("button")!;
  try {
    const { RoleSearchControls } = await import("./RoleSearchControls");
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <RoleSearchControls
            roles={[{ roleId: "fixture-role", name: "Fixture role" }]}
            workspaceId="fixture-workspace"
            surface="ops"
          />
        </QueryClientProvider>
      )
    );
    await settle();
    assert.equal(button().disabled, false);
    assert.match(dom.window.document.body.textContent!, /검색 이력이 없습니다/);
    await act(async () => button().click());
    await settle();
    assert.equal(posts, 1);
    assert.equal(button().disabled, true);
    assert.match(button().className, /text-action/);
    assert.match(button().textContent!, /대기 중/);
    await act(async () => button().click());
    assert.equal(posts, 1);
    status = "running";
    await act(async () => {
      await client.invalidateQueries();
    });
    await settle();
    assert.match(button().textContent!, /실행 중/);
    status = "succeeded";
    await act(async () => {
      await client.invalidateQueries();
    });
    await settle();
    assert.equal(button().disabled, false);
    assert.match(
      dom.window.document.querySelector("table")!.textContent!,
      /완료/
    );
  } finally {
    await act(async () => root.unmount());
    client.clear();
    globalThis.fetch = oldFetch;
    supabase.auth.getSession = originalSession;
    dom.window.close();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
  }
});
