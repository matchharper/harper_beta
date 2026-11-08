import assert from "node:assert/strict";
import test from "node:test";
import {
  DECISION_EVIDENCE_LIMITS,
  loadRoleDecisionEvidence,
  summarizeDecisionWait,
  summarizePassReasons,
  summarizeSearchRun,
} from "./decisionEvidence.server";
import { loadCompanyProactiveAwareness } from "./proactiveReview.server";
import { buildCompanyProactiveReviewPrompt } from "./proactiveReview";

const now = new Date("2026-11-08T03:00:00Z");

test("waiting decisions report the count and the oldest wait in whole days", () => {
  const read: any = {
    counts: {}, oldestWaitingSince: "2026-11-03T02:00:00Z",
    waiting: [{ talentId: "a", since: "2026-11-03T02:00:00Z" }, { talentId: "b", since: null }],
    toRequest: [{ talentId: "c", at: "2026-11-07T00:00:00Z" }, { talentId: "d", at: "2026-10-30T00:00:00Z" }],
  };
  assert.deepEqual(summarizeDecisionWait(read, now), {
    waitingToConnect: 2, oldestWaitingSince: "2026-11-03T02:00:00Z", oldestWaitingDays: 5,
    awaitingIntroDecision: 2, oldestAwaitingIntroSince: "2026-10-30T00:00:00Z", oldestAwaitingIntroDays: 9,
  });
  assert.equal(summarizeDecisionWait(undefined, now), null);
});

test("search funnel keeps recorded numbers, the stage-one screens and the lowest-scored criteria", () => {
  const summary = summarizeSearchRun({
    finished_at: "2026-11-07T00:00:00Z",
    counts: { retrieved: 120, scored: 30, selected: 2 },
    roleSearch: { funnel: {
      pool: 120, stage1Excluded: 90, stage2Evaluated: 30,
      stage1ExcludedBy: { workScreen: 70, companyPracticalScreen: 15, candidatePracticalScreen: 5 },
      criteriaStats: [
        { name: "Go 운영 경험", meanScore: 0.21234, count: 30 },
        { name: "B2B SaaS", meanScore: 0.8, count: 30 },
        { name: "x".repeat(200), meanScore: 0.5, count: 30 },
        { name: "팀 리딩", meanScore: 0.4, count: 30 },
      ],
    } },
  });
  assert.equal(summary?.retrieved, 120);
  assert.equal(summary?.evaluated, 30);
  assert.equal(summary?.selected, 2);
  assert.deepEqual(summary?.stage1ExcludedBy, { workScreen: 70, companyPracticalScreen: 15, candidatePracticalScreen: 5 });
  assert.deepEqual(summary?.lowestScoredCriteria.map((c) => c.name.length <= DECISION_EVIDENCE_LIMITS.criterionNameChars), [true, true, true]);
  assert.deepEqual(summary?.lowestScoredCriteria.map((c) => c.meanScore), [0.21, 0.4, 0.5]);
});

test("a run without a funnel leaves the missing numbers null instead of inventing them", () => {
  const summary = summarizeSearchRun({ finished_at: null, counts: { selected: 0 }, roleSearch: {} });
  assert.equal(summary?.retrieved, null);
  assert.equal(summary?.evaluated, null);
  assert.equal(summary?.selected, 0);
  assert.equal(summary?.stage1ExcludedBy, null);
  assert.deepEqual(summary?.lowestScoredCriteria, []);
  assert.equal(summarizeSearchRun(null), null);
});

test("pass reasons are few and short", () => {
  const rows = [
    { reason_text: "가".repeat(500), created_at: "2026-11-07T00:00:00Z" },
    { reason_text: "  ", created_at: "2026-11-06T00:00:00Z" },
    { reason_text: "초기 스타트업 경험이 없어요", created_at: "2026-11-05T00:00:00Z" },
    { reason_text: "b", created_at: "2026-11-04T00:00:00Z" },
    { reason_text: "c", created_at: "2026-11-03T00:00:00Z" },
  ];
  const reasons = summarizePassReasons(rows);
  assert.equal(reasons.length, DECISION_EVIDENCE_LIMITS.passReasons);
  assert.equal(reasons[0].text.length, DECISION_EVIDENCE_LIMITS.passReasonChars);
  assert.equal(reasons[0].complete, false);
  assert.deepEqual(reasons.slice(1).map((r) => r.text), ["초기 스타트업 경험이 없어요", "b"]);
});

function fakeAdmin(tables: Record<string, any>, calls: Array<{ table: string; ops: string[] }> = []) {
  return {
    from(table: string) {
      const call = { table, ops: [] as string[] };
      calls.push(call);
      const query: any = new Proxy({}, {
        get(_target, property) {
          if (property === "then") {
            const result = typeof tables[table] === "function" ? tables[table](call) : tables[table];
            return (resolve: any) => resolve(result ?? { data: [], error: null });
          }
          return (...args: unknown[]) => { call.ops.push(`${String(property)}:${JSON.stringify(args)}`); return query; };
        },
      });
      return query;
    },
  };
}

test("loader reads each Role's last finished search and recent pass reasons, bounded", async () => {
  const calls: any[] = [];
  const admin = fakeAdmin({
    company_first_search_runs: { data: [{ finished_at: "2026-11-07T00:00:00Z", counts: { retrieved: 10, scored: 4, selected: 1 },
      funnel: { stage1ExcludedBy: { workScreen: 6 } }, criteriaStats: null, searchCounts: null }], error: null },
    company_decision_events: { data: [{ reason_text: "연봉 기대치가 높아요", created_at: "2026-11-06T00:00:00Z" }], error: null },
  }, calls);
  const roleIds = Array.from({ length: 20 }, (_, i) => `role-${i}`);
  const evidence = await loadRoleDecisionEvidence({ admin, workspaceId: "w", roleIds, user: null, now },
    { readCounts: async () => new Map() as any });
  assert.equal(evidence.length, DECISION_EVIDENCE_LIMITS.roles);
  assert.equal((evidence[0].lastSearch as any).retrieved, 10);
  assert.deepEqual((evidence[0].lastSearch as any).stage1ExcludedBy, { workScreen: 6 });
  assert.deepEqual((evidence[0].recentPassReasons as any[]).map((r) => r.text), ["연봉 기대치가 높아요"]);
  const passCall = calls.find((c) => c.table === "company_decision_events");
  assert.ok(passCall.ops.includes(`eq:["action","pass"]`));
  assert.ok(passCall.ops.some((op: string) => op.startsWith("gte:")));
  const searchCall = calls.find((c) => c.table === "company_first_search_runs");
  assert.ok(searchCall.ops.includes(`limit:[1]`));
  assert.ok(!searchCall.ops.some((op: string) => op.includes("selectionInput")));
});

test("an unreadable part is marked unavailable, not empty", async () => {
  const admin = fakeAdmin({
    company_first_search_runs: { data: null, error: { message: "down" } },
    company_decision_events: { data: null, error: { message: "down" } },
  });
  const [evidence] = await loadRoleDecisionEvidence({ admin, workspaceId: "w", roleIds: ["r"], user: null, now },
    { readCounts: async () => { throw new Error("board down"); } });
  assert.deepEqual(evidence, { roleId: "r", decisionWait: "unavailable", lastSearch: "unavailable", recentPassReasons: "unavailable" });
});

test("proactive awareness carries the evidence for active Roles and the prompt leaves the choice to Harper", async () => {
  const admin = fakeAdmin({});
  const seen: any[] = [];
  const awareness = await loadCompanyProactiveAwareness({ admin, workspaceId: "w", channelDbId: "c", anchor: 10, now,
    roles: [{ roleId: "a", status: "active" }, { roleId: "b", status: "paused" }] },
  { evidence: async (args: any) => { seen.push(args.roleIds); return [{ roleId: "a" }] as any; } });
  assert.deepEqual(seen, [["a"]]);
  assert.deepEqual((awareness as any).roleEvidence, [{ roleId: "a" }]);
  const prompt = buildCompanyProactiveReviewPrompt(awareness);
  assert.match(prompt, /roleEvidence/);
  assert.match(prompt, /not triggers/);
});
