import assert from "node:assert/strict";
import test from "node:test";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { paginateOrgInbox } from "@/lib/org/inboxPagination";
import { queryKeys } from "@/lib/queryKeys";
import {
  reconcileOrgCandidateSave,
  reconcileOrgCompanyIntro,
  type OrgBoardCache,
} from "@/lib/org/mutationCache";
import type { OrgBoardItem, OrgBoardResponse } from "@/lib/org/server";

test("infinite inbox loads 10/10/3, isolates tabs and sorting, retries a failed page, and refetches after saving", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://inbox-test.invalid";
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
  const { orgRoleInboxQueryOptions } = await import("./useOrgRoleInbox");
  const items = Array.from(
    { length: 23 },
    (_, i) =>
      ({
        recommendationId: `person-${i}`,
        talentId: `talent-${i}`,
        roleId: "r",
        stage: "pending_connection",
        savedAt: null,
        recommendationRank: i + 1,
        companyPresentedAt: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      }) as OrgBoardItem
  );
  const board = {
    workspaceId: "w",
    roleId: "r",
    items,
    stages: [],
    totalCount: items.length,
  } as OrgBoardResponse;
  let fail = false;
  const requests: URL[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://fixture.invalid");
    requests.push(url);
    if (fail)
      return Response.json(
        { error: "Temporarily unavailable" },
        { status: 503 }
      );
    return Response.json(
      paginateOrgInbox(
        board,
        url.searchParams.get("inboxStage") as any,
        url.searchParams.get("sort") as any,
        Number(url.searchParams.get("offset"))
      )
    );
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const options = {
    ...orgRoleInboxQueryOptions({
      workspaceId: "w",
      roleId: "r",
      stage: "pending_connection",
      sort: "latest",
    }),
    retry: false,
  };
  const observer = new InfiniteQueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  t.after(() => {
    unsubscribe();
    client.clear();
  });
  await client.fetchInfiniteQuery(options);
  assert.equal(requests.length, 1);
  assert.equal(observer.getCurrentResult().data?.pages[0].items.length, 10);
  fail = true;
  await observer.fetchNextPage();
  assert.equal(observer.getCurrentResult().isFetchNextPageError, true);
  assert.equal(observer.getCurrentResult().data?.pages.length, 1);
  fail = false;
  await observer.fetchNextPage();
  await observer.fetchNextPage();
  assert.deepEqual(
    observer.getCurrentResult().data?.pages.map((page) => page.items.length),
    [10, 10, 3]
  );
  assert.equal(observer.getCurrentResult().hasNextPage, false);
  assert.deepEqual(
    requests.map((url) => url.searchParams.get("offset")),
    ["0", "10", "10", "20"]
  );
  const tab = orgRoleInboxQueryOptions({
    workspaceId: "w",
    roleId: "r",
    stage: "company_intro",
    sort: "latest",
  });
  const sorted = orgRoleInboxQueryOptions({
    workspaceId: "w",
    roleId: "r",
    stage: "pending_connection",
    sort: "recommended",
  });
  await client.fetchInfiniteQuery(tab);
  await client.fetchInfiniteQuery(sorted);
  assert.notDeepEqual(options.queryKey, tab.queryKey);
  assert.notDeepEqual(options.queryKey, sorted.queryKey);
  assert.equal(client.getQueryData(options.queryKey)?.pages.length, 3);

  const saved = items[22];
  saved.savedAt = "2026-10-27T00:00:00Z";
  await reconcileOrgCandidateSave(
    client,
    { workspaceId: "w", roleId: "r", recommendationId: saved.recommendationId },
    saved.savedAt
  );
  await observer.refetch();
  const refreshed = observer.getCurrentResult().data!.pages;
  const loaded = refreshed.flatMap((page) => page.items);
  assert.equal(loaded.length, 22);
  assert.equal(new Set(loaded.map((item) => item.recommendationId)).size, 22);
  assert.ok(
    loaded.every((item) => item.recommendationId !== saved.recommendationId)
  );
  assert.equal(refreshed[0].counts.pending_connection, 22);
  assert.equal(refreshed[0].counts.saved, 1);
  assert.equal(refreshed.at(-1)?.nextOffset, null);

  const intro = {
    ...items[0],
    recommendationId: "company-intro:i",
    stage: "company_intro",
    companyIntro: { id: "i", status: "ready" },
    capabilities: { pass: true, requestIntro: true },
  } as OrgBoardItem;
  const introPage = paginateOrgInbox(
    { ...board, items: [intro] },
    "company_intro",
    "latest",
    0
  );
  client.setQueryData(tab.queryKey, { pages: [introPage], pageParams: [0] });
  await reconcileOrgCompanyIntro(client, "w", {
    ok: true,
    introCandidateId: "i",
    status: "requested",
    candidateUpdate: {
      roleId: "r",
      talentId: intro.talentId,
      status: "awaiting_talent",
      requestedAt: null,
      candidateSentAt: null,
      talentDecisionAt: null,
      closeReason: null,
      companyAppeal: null,
      nextStageId: null,
      updatedAt: "2026-10-27T00:00:00Z",
    },
  });
  const updated = client.getQueryData<OrgBoardCache>(tab.queryKey)!;
  assert.ok("pages" in updated);
  assert.equal(updated.pages[0].items[0].stage, "intro_requested");
  assert.equal(updated.pages[0].items[0].capabilities.requestIntro, false);
  await client.invalidateQueries({
    queryKey: queryKeys.org.boardAll,
    refetchType: "none",
  });
  assert.equal(client.getQueryState(tab.queryKey)?.isInvalidated, true);
});
