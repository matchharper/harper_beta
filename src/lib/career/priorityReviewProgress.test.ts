import assert from "node:assert/strict";
import test from "node:test";
import { isPriorityReviewInboxArchived, readPriorityReviewProgress } from "./priorityReviewProgress";

const now = Date.now();
const lifetime = 28 * 24 * 60 * 60 * 1000;

test("Inbox archives the three waiting states at exactly four weeks", () => {
  for (const decision of [null, "company_first", "no_action"]) {
    assert.equal(isPriorityReviewInboxArchived(new Date(now - lifetime + 1).toISOString(), decision, now), false);
    assert.equal(isPriorityReviewInboxArchived(new Date(now - lifetime).toISOString(), decision, now), true);
  }
  for (const decision of ["candidate_first", "both", "connect", "defer", "reject"]) {
    assert.equal(isPriorityReviewInboxArchived("2020-01-01T00:00:00.000Z", decision, now), false);
  }
  for (const requestedAt of [null, "invalid", new Date(now + lifetime).toISOString()]) {
    assert.equal(isPriorityReviewInboxArchived(requestedAt, null, now), false);
  }
});

test("Inbox uses the latest open review, preserves candidate-first, and removes actual recommendations", async () => {
  const tables: Record<string, any[]> = { talent_progress: [], talent_opportunity_matching_review: [],
    talent_opportunity_recommendation: [] };
  function add(id: string, decision: string | null, old = true) {
    tables.talent_progress.push({ id, talent_id: "user", role_id: id,
      kind: "candidate_requested_connection", metadata: {},
      created_at: new Date(now - (old ? lifetime + 1000 : lifetime - 60_000)).toISOString(),
      role: { name: id, status: "active", information: {}, is_expired: false,
        company: { company_name: "Example" } } });
    if (decision) tables.talent_opportunity_matching_review.push({ talent_id: "user",
      priority_request_id: id, decision, closed_at: null, reviewed_at: "2026-10-09" });
  }
  add("unreviewed", null);
  add("company", "company_first");
  add("no-action", "no_action");
  add("candidate", "candidate_first");
  add("fresh", null, false);
  add("presented", "candidate_first");
  add("withdrawn", null, false);
  add("ended", null, false);
  tables.talent_opportunity_recommendation.push({ talent_id: "user", role_id: "presented" });
  tables.talent_progress.find(row => row.id === "withdrawn").metadata.withdrawnAt = "2026-10-09";
  tables.talent_progress.find(row => row.id === "ended").role.status = "ended";
  tables.talent_opportunity_matching_review.push({ talent_id: "user", priority_request_id: "candidate",
    decision: "no_action", closed_at: null, reviewed_at: "2026-10-08" });
  const before = structuredClone(tables);
  const admin = { from(table: string) {
    let rows = [...tables[table]];
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { rows = rows.filter(row => row[key] === value); return query; },
      in(key: string, values: unknown[]) { rows = rows.filter(row => values.includes(row[key])); return query; },
      is(key: string, value: unknown) {
        rows = rows.filter(row => (key === "metadata->>withdrawnAt" ? row.metadata?.withdrawnAt ?? null : row[key]) === value);
        return query;
      },
      order(key: string, options: { ascending: boolean }) {
        rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (options.ascending ? 1 : -1));
        return query;
      },
      then(resolve: (result: unknown) => unknown) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
    };
    return query;
  } };
  const progress = await readPriorityReviewProgress(admin as never, "user");
  assert.deepEqual(progress.map(row => row.roleId).sort(), ["candidate", "fresh"]);
  assert.equal(progress.find(row => row.roleId === "candidate")?.reviewState, "reviewed");
  assert.equal(progress.find(row => row.roleId === "fresh")?.reviewState, "requested");
  assert.deepEqual(tables, before);
});
