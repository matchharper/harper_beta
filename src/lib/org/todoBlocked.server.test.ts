import assert from "node:assert/strict";
import test from "node:test";
import { roleSearchAndBlockedItems } from "./todo.server";

const op = (kind: string, status: string, at: string, trigger: string | null = null) => ({
  created_at: at,
  external: kind === "external_search" ? { trigger } : null,
  finished_at: status === "queued" || status === "running" ? null : at,
  id: `${kind}-${at}`,
  kind,
  status,
});
const base = {
  operations: [],
  outbox: [],
  optOuts: [],
  workspace: { slackChannels: [], activeSlackTeams: new Set<string>() },
  introsLeft: 3,
  pendingCount: 2,
};
const kinds = (items: ReturnType<typeof roleSearchAndBlockedItems>) =>
  items.map((item) => `${item.column}:${item.kind}${item.detail ? `:${item.detail}` : ""}`);

test("nothing is blocked when searches, Slack and intros are fine", () => {
  assert.deepEqual(roleSearchAndBlockedItems(base), []);
});

test("a failed search is blocked until a later one succeeds; a running external search is in progress", () => {
  const failed = roleSearchAndBlockedItems({
    ...base,
    operations: [op("member_search", "failed", "2026-11-06T02:00:00Z")],
  });
  assert.deepEqual(kinds(failed), ["blocked:search_failed:member_search"]);
  // Rows are newest first: a later success clears the earlier failure.
  const cleared = roleSearchAndBlockedItems({
    ...base,
    operations: [
      op("member_search", "succeeded", "2026-11-06T03:00:00Z"),
      op("member_search", "failed", "2026-11-06T02:00:00Z"),
    ],
  });
  assert.deepEqual(kinds(cleared), []);
  const running = roleSearchAndBlockedItems({
    ...base,
    operations: [op("external_search", "running", "2026-11-06T03:00:00Z")],
  });
  assert.deepEqual(kinds(running), ["in_progress:external_search_running"]);
  // Shadow runs are internal and never shown.
  const shadow = roleSearchAndBlockedItems({
    ...base,
    operations: [op("external_search", "failed", "2026-11-06T03:00:00Z", "shadow")],
  });
  assert.deepEqual(kinds(shadow), []);
});

test("Slack is blocked when its app is disconnected or the last send failed, and clears once it works", () => {
  const channel = { id: "C1", slack_team_id: "T1" };
  assert.deepEqual(
    kinds(roleSearchAndBlockedItems({ ...base, workspace: { slackChannels: [channel], activeSlackTeams: new Set() } })),
    ["blocked:slack_delivery_error:integration"]
  );
  assert.deepEqual(
    kinds(roleSearchAndBlockedItems({ ...base, workspace: { slackChannels: [channel], activeSlackTeams: new Set() }, optOuts: [{ channel_id: "C1" }] })),
    []
  );
  assert.deepEqual(
    kinds(roleSearchAndBlockedItems({ ...base, outbox: [{ delivery_channel: "slack", status: "failed", updated_at: "2026-11-06T03:00:00Z" }] })),
    ["blocked:slack_delivery_error:send"]
  );
  assert.deepEqual(
    kinds(roleSearchAndBlockedItems({ ...base, outbox: [
      { delivery_channel: "slack", status: "sent", updated_at: "2026-11-06T04:00:00Z" },
      { delivery_channel: "slack", status: "failed", updated_at: "2026-11-06T03:00:00Z" },
    ] })),
    []
  );
});

test("no intros left is blocked only while someone waits to connect", () => {
  assert.deepEqual(kinds(roleSearchAndBlockedItems({ ...base, introsLeft: 0 })), ["blocked:intros_empty"]);
  assert.equal(roleSearchAndBlockedItems({ ...base, introsLeft: 0 })[0].count, 2);
  assert.deepEqual(kinds(roleSearchAndBlockedItems({ ...base, introsLeft: 0, pendingCount: 0 })), []);
  assert.deepEqual(kinds(roleSearchAndBlockedItems({ ...base, introsLeft: null })), []);
});

test("no intros left is blocked too while only people to request wait, since requesting uses an intro", () => {
  const onlyToRequest = roleSearchAndBlockedItems({ ...base, introsLeft: 0, pendingCount: 0, toRequestCount: 4 });
  assert.deepEqual(kinds(onlyToRequest), ["blocked:intros_empty:company_intro"]);
  assert.equal(onlyToRequest[0].count, 4);
  // Waiting to connect comes first: its number, as before.
  const both = roleSearchAndBlockedItems({ ...base, introsLeft: 0, toRequestCount: 4 });
  assert.deepEqual(kinds(both), ["blocked:intros_empty"]);
  assert.equal(both[0].count, 2);
  assert.deepEqual(kinds(roleSearchAndBlockedItems({ ...base, introsLeft: 1, pendingCount: 0, toRequestCount: 4 })), []);
});
