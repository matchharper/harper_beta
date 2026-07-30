import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInitialRecommendationPendingResult,
  fetchActiveInitialConversationRun,
  getInitialRecommendationPendingAnswer,
} from "./initialRecommendationGuard";

function createAdmin(result: {
  data: unknown;
  error: { message?: string } | null;
}) {
  const calls: Array<[string, unknown]> = [];
  const query = {
    eq(column: string, value: unknown) {
      calls.push([`eq:${column}`, value]);
      return query;
    },
    in(column: string, value: unknown) {
      calls.push([`in:${column}`, value]);
      return query;
    },
    limit(value: number) {
      calls.push(["limit", value]);
      return query;
    },
    maybeSingle() {
      calls.push(["maybeSingle", true]);
      return Promise.resolve(result);
    },
    order(column: string, value: unknown) {
      calls.push([`order:${column}`, value]);
      return query;
    },
    select(value: string) {
      calls.push(["select", value]);
      return query;
    },
  };

  return {
    admin: {
      from(table: string) {
        calls.push(["from", table]);
        return query;
      },
    },
    calls,
  };
}

test("finds only an active initial conversation-completed run", async () => {
  const run = {
    created_at: "2026-07-30T00:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000001",
    status: "running" as const,
  };
  const { admin, calls } = createAdmin({ data: run, error: null });

  assert.deepEqual(
    await fetchActiveInitialConversationRun({
      admin,
      userId: "talent-1",
    }),
    run
  );
  assert.ok(
    calls.some(
      ([name, value]) =>
        name === "eq:trigger" && value === "conversation_completed"
    )
  );
  assert.ok(
    calls.some(([name, value]) => name === "eq:run_mode" && value === "initial")
  );
  assert.ok(
    calls.some(
      ([name, value]) =>
        name === "in:status" &&
        Array.isArray(value) &&
        value.join(",") === "queued,running"
    )
  );
});

test("returns a no-search result with a localized waiting notice", () => {
  const result = buildInitialRecommendationPendingResult({
    locale: "en",
  });

  assert.equal(result.initialRecommendationPending, true);
  assert.equal(result.recommendationCount, 0);
  assert.deepEqual(result.postingRoleIds, []);
  assert.match(result.answerDraft, /within an hour/);
  assert.doesNotMatch(result.answerDraft, /[가-힣]/);
  assert.match(getInitialRecommendationPendingAnswer("ko"), /1시간/);
});

test("fails closed when the active-run lookup fails", async () => {
  const { admin } = createAdmin({
    data: null,
    error: { message: "database unavailable" },
  });

  await assert.rejects(
    fetchActiveInitialConversationRun({
      admin,
      userId: "talent-1",
    }),
    /database unavailable/
  );
});
