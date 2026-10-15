import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

test("Home and Inbox share one in-flight board request and its result", async () => {
  const client = new QueryClient();
  let requests = 0;
  const payload = { items: [{ stage: "pending_connection" }] };
  let complete!: () => void;
  const response = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const queryFn = async () => {
    requests += 1;
    await response;
    return payload;
  };
  try {
    const home = client.fetchQuery({
      queryKey: queryKeys.org.board({ workspaceId: "one", roleId: "" }),
      queryFn,
    });
    const inbox = client.fetchQuery({
      queryKey: queryKeys.org.inbox("one"),
      queryFn,
    });
    assert.equal(requests, 1);
    complete();
    const results = await Promise.all([home, inbox]);
    assert.equal(results[0], payload);
    assert.equal(results[1], payload);
    assert.equal(client.getQueryCache().getAll().length, 1);
  } finally {
    complete();
    client.clear();
  }
});

test("filtered boards stay separate and board mutations invalidate every board", async () => {
  const client = new QueryClient();
  const keys = [
    queryKeys.org.inbox("one"),
    queryKeys.org.board({ workspaceId: "two" }),
    queryKeys.org.board({ workspaceId: "one", roleId: "role" }),
    queryKeys.org.board({ workspaceId: "one", query: "search" }),
    queryKeys.org.board({ workspaceId: "one", recommendedDate: "2026-10-12" }),
    queryKeys.org.board({
      workspaceId: "one",
      recommendedFromDate: "2026-10-01",
    }),
    queryKeys.org.board({
      workspaceId: "one",
      recommendedToDate: "2026-10-12",
    }),
  ];
  const slackKey = queryKeys.org.slack("one");
  try {
    for (const [index, key] of keys.entries()) client.setQueryData(key, index);
    client.setQueryData(slackKey, { connected: true });
    assert.equal(client.getQueryCache().getAll().length, keys.length + 1);
    await client.invalidateQueries({ queryKey: queryKeys.org.boardAll });
    for (const key of keys)
      assert.equal(client.getQueryState(key)?.isInvalidated, true);
    assert.equal(client.getQueryState(slackKey)?.isInvalidated, false);
  } finally {
    client.clear();
  }
});
