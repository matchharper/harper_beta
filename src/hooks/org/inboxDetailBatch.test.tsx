import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type {
  OrgBoardItem,
  OrgBoardResponse,
  OrgTalentDetailResponse,
} from "@/lib/org/server";
import { paginateOrgInbox } from "@/lib/org/inboxPagination";

test("ten complete profiles render from one batch; navigating 1–10 never requests detail, 11 loads one more batch", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://batch-test.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-key";
  const { supabase } = await import("@/lib/supabase");
  t.mock.method(
    supabase.auth,
    "getSession",
    async () =>
      ({
        data: { session: { access_token: "fixture-token" } },
        error: null,
      }) as any
  );
  const { useOrgJobsBoardData, useOrgJobsDetailData } =
    await import("./useOrgJobsData");
  const board = {
    workspaceId: "w",
    roleId: "r",
    stages: [],
    totalCount: 23,
    items: Array.from(
      { length: 23 },
      (_, i) =>
        ({
          recommendationId: `rec-${i}`,
          talentId: `talent-${i}`,
          roleId: "r",
          stage: "company_intro",
          recommendationRank: i + 1,
        }) as OrgBoardItem
    ),
  } as OrgBoardResponse;
  const requests: URL[] = [];
  let releaseBatch: (() => void) | undefined;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://fixture.invalid");
    requests.push(url);
    assert.equal(
      url.pathname,
      "/api/org/board",
      "candidate navigation must not send an individual detail GET"
    );
    assert.equal(url.searchParams.get("inboxStage"), "company_intro");
    const page = paginateOrgInbox(
      board,
      "company_intro",
      "recommended",
      Number(url.searchParams.get("offset"))
    );
    await new Promise<void>((resolve) => {
      releaseBatch = resolve;
    });
    page.details = Object.fromEntries(
      page.items.map((item) => [
        item.recommendationId,
        {
          talent: { userId: item.talentId, name: item.talentId },
          role: { roleId: "r" },
          workspace: { workspaceId: "w" },
          recommendation: { recommendationId: item.recommendationId },
          profile: {
            experiences: [{ role: `Experience ${item.talentId}` }],
            educations: [{ school: `School ${item.talentId}` }],
          },
        } as unknown as OrgTalentDetailResponse,
      ])
    );
    return Response.json(page);
  });
  const dom = new JSDOM("<div id='root'></div>");
  const original = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  let select!: (index: number) => void;
  let loadNext!: () => Promise<unknown>;
  const snapshots: Array<{
    id: string;
    loading: boolean;
    name?: string | null;
  }> = [];
  function Harness() {
    const [index, setIndex] = useState(0);
    select = setIndex;
    const list = useOrgJobsBoardData({
      selectedRoleId: "r",
      workspaceId: "w",
      inbox: { stage: "company_intro", sort: "recommended", enabled: true },
    });
    const item = list.board?.items[index];
    const batchDetail = list.inboxQuery?.data?.pages.find(
      (page) => page.details?.[item?.recommendationId ?? ""]
    )?.details?.[item?.recommendationId ?? ""];
    const detail = useOrgJobsDetailData({
      workspaceId: "w",
      detailRoleId: "r",
      detailRecommendationId: item?.recommendationId ?? "",
      detailTalentId: item?.talentId ?? "",
      batchLoading: list.inboxQuery?.isPending,
      batchDetail,
    });
    loadNext = () => list.inboxQuery!.fetchNextPage();
    if (item)
      snapshots.push({
        id: item.talentId,
        loading: detail.detailQuery.isLoading,
        name: detail.detailQuery.data?.talent.name,
      });
    return (
      <div>
        {detail.detailQuery.data?.profile.experiences[0]?.role ??
          "Loading batch"}
      </div>
    );
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  t.after(async () => {
    releaseBatch?.();
    await act(async () => root.unmount());
    client.clear();
    Object.assign(globalThis, original, { IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    );
    await flush();
  });
  assert.equal(requests.length, 1);
  assert.match(dom.window.document.body.textContent!, /Loading batch/);
  await act(async () => {
    releaseBatch?.();
    await flush();
    await flush();
  });
  assert.match(dom.window.document.body.textContent!, /Experience talent-0/);
  assert.equal(
    client
      .getQueryCache()
      .findAll({ queryKey: ["org", "detail"] })
      .filter((query) => query.state.data).length,
    10
  );
  // Simulate taking longer than the old 20-second stale time to review people.
  for (const item of board.items.slice(0, 10)) {
    const key = queryKeys.org.detail({
      workspaceId: "w",
      roleId: "r",
      recommendationId: item.recommendationId,
      talentId: item.talentId,
    });
    client.setQueryData(key, client.getQueryData(key), {
      updatedAt: Date.now() - 60_000,
    });
  }
  for (let i = 1; i < 10; i++) {
    await act(async () => {
      select(i);
      await flush();
    });
    assert.match(
      dom.window.document.body.textContent!,
      new RegExp(`Experience talent-${i}`)
    );
    assert.equal(requests.length, 1);
  }
  assert.ok(
    snapshots.every(
      (snapshot) => !snapshot.loading && snapshot.name === snapshot.id
    ),
    "not even an intermediate render shows a per-person skeleton"
  );
  let next!: Promise<unknown>;
  await act(async () => {
    next = loadNext();
    await flush();
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].searchParams.get("offset"), "10");
  assert.match(
    dom.window.document.body.textContent!,
    /Experience talent-9/,
    "retain the tenth profile while the batch loads"
  );
  await act(async () => {
    releaseBatch?.();
    await next;
    await flush();
    select(10);
  });
  assert.match(dom.window.document.body.textContent!, /Experience talent-10/);
  for (const index of [11, 19, 0, 9, 10]) {
    await act(async () => {
      select(index);
      await flush();
    });
    assert.match(
      dom.window.document.body.textContent!,
      new RegExp(`Experience talent-${index}`)
    );
  }
  assert.equal(
    requests.length,
    2,
    "twenty complete profiles use exactly two batch GETs"
  );
  assert.ok(
    snapshots.every(
      (snapshot) => !snapshot.loading && snapshot.name === snapshot.id
    )
  );

  // Switching context or completing a write cancels old board reads; they must
  // not populate individual detail caches after their response finally arrives.
  await act(async () => {
    next = loadNext();
    await flush();
  });
  await act(async () => {
    await client.cancelQueries({ queryKey: queryKeys.org.boardAll });
    releaseBatch?.();
    await next;
    await flush();
  });
  const lastItem = board.items[20];
  const lastKey = queryKeys.org.detail({
    workspaceId: "w",
    roleId: "r",
    recommendationId: lastItem.recommendationId,
    talentId: lastItem.talentId,
  });
  assert.equal(
    client.getQueryData(lastKey),
    undefined,
    "cancelled batches cannot resurrect stale detail"
  );
  await act(async () => {
    next = loadNext();
    await flush();
  });
  const newer = {
    talent: { userId: lastItem.talentId, name: "Confirmed newer profile" },
  };
  client.setQueryData(lastKey, newer, { updatedAt: Date.now() + 1_000 });
  await act(async () => {
    releaseBatch?.();
    await next;
    await flush();
  });
  assert.equal(
    client.getQueryData(lastKey),
    newer,
    "a late batch cannot overwrite a newer confirmed write"
  );
});
