import assert from "node:assert/strict";
import test from "node:test";
import { claimRun, digestDependencies, mailCriteriaByCandidate, markEmailRowFailedFinal } from "./emailDelivery.server";
import type { EmailOutboxRow } from "./emailDelivery";

// A Supabase stand-in that records every chained call; reads return the given row.
function fakeAdmin(requested: Record<string, unknown> | null) {
  const calls: Array<Array<[string, ...unknown[]]>> = [];
  const from = () => {
    const chain: Array<[string, ...unknown[]]> = [];
    calls.push(chain);
    const builder: any = new Proxy({}, {
      get(_, prop: string) {
        if (prop === "then") return (resolve: (value: unknown) => void) => resolve({ data: null, error: null });
        if (prop === "maybeSingle") return async () => ({ data: requested, error: null });
        return (...args: unknown[]) => { chain.push([prop, ...args]); return builder; };
      },
    });
    return builder;
  };
  return { calls, admin: { from } as any };
}

const row = { id: "row", status: "sending" } as EmailOutboxRow;

test("a group ended failed for a person is stored with a retry time of infinity", async () => {
  const { calls, admin } = fakeAdmin(null);
  await markEmailRowFailedFinal(admin, row, "check delivery");
  const [update] = calls[0];
  assert.equal(update[0], "update");
  assert.deepEqual({ ...(update[1] as object), updated_at: undefined },
    { available_at: "infinity", last_error: "check delivery", status: "failed", updated_at: undefined });
  assert.deepEqual(calls[0].slice(1), [["eq", "id", "row"], ["eq", "status", "sending"]]);
});

test("a database error is stored as its message, not as [object Object]", async () => {
  const { calls, admin } = fakeAdmin(null);
  const deps = digestDependencies(admin, async () => { throw new Error("unused"); });
  await deps.release("job", "owner", { message: "column metadata does not exist", code: "42703" });
  await deps.release("job", "owner", 42);
  await deps.release("job", "owner", { message: " ", code: "PGRST116" });
  assert.equal((calls[0][0][1] as { last_error: string }).last_error, "column metadata does not exist");
  assert.equal((calls[1][0][1] as { last_error: string }).last_error, "Company email failed");
  assert.equal((calls[2][0][1] as { last_error: string }).last_error, "Company email failed");
});

test("the claim never takes a failed row whose retry time is infinity or unreadable", async () => {
  for (const available_at of ["infinity", "not a time"]) {
    const { calls, admin } = fakeAdmin({ status: "failed", available_at });
    assert.deepEqual(await claimRun(admin, { id: "row", run_id: "run", company_workspace_id: "w" }),
      { rows: [], busy: false, requestedStatus: "failed" });
    // Only the stale sweep and the read ran; nothing was set to "sending".
    assert.ok(!calls.some((chain) => chain.some(([name, value]) => name === "update" && (value as any)?.status === "sending")));
  }
});

test("a failed row whose retry time has passed is still claimed", async () => {
  const { calls, admin } = fakeAdmin({ status: "failed", available_at: new Date(Date.now() - 1000).toISOString() });
  await claimRun(admin, { id: "row", run_id: "run", company_workspace_id: "w" }).catch(() => {});
  assert.ok(calls.some((chain) => chain.some(([name, value]) => name === "update" && (value as any)?.status === "sending")));
});

// A Supabase stand-in that answers each table with its own rows, whatever the filters.
function tableAdmin(tables: Record<string, unknown[]>) {
  const from = (table: string) => {
    const builder: any = new Proxy({}, {
      get(_, prop: string) {
        if (prop === "then") return (resolve: (value: unknown) => void) => resolve({ data: tables[table] ?? [], error: null });
        return () => builder;
      },
    });
    return builder;
  };
  return { from } as any;
}

test("after the team edits a criterion, the mail shows the ratings the web card shows", async () => {
  const intro = { id: "intro", role_id: "role", talent_id: "talent" };
  const rated = (name: string, criteria: string, fitness: string, extra = {}) =>
    ({ name, fitness, content: `${name} evidence`, criterionDefinition: criteria, ...extra });
  const admin = tableAdmin({
    // The role's criteria after the edit: "모델 서빙" became "모델 배포".
    company_internal_roles: [{ role_id: "role", criteria: [
      { name: "ML 실무", criteria: "3년 이상" }, { name: "모델 배포", criteria: "운영 배포 경험" }] }],
    // Ratings stored with the proposal, before the edit.
    company_intro_candidates: [{ role_id: "role", talent_id: "talent", presentation: { criteriaEvaluations: [
      rated("ML 실무", "3년 이상", "excellent"), rated("모델 서빙", "서빙 경험", "excellent")] } }],
    // Grades written after the edit win, as on the web; the re-judged one is pending.
    company_role_candidate_evaluations: [{ role_id: "role", talent_id: "talent", evaluations: [
      rated("ML 실무", "3년 이상", "excellent"), rated("모델 배포", "운영 배포 경험", "uncertain", { pending: true })] }],
  });
  const criteria = (await mailCriteriaByCandidate(admin, [intro])).get("intro");
  assert.deepEqual(criteria, [{ name: "ML 실무", fitness: "excellent" }]);
  // Without the edit, the proposal's own ratings are used.
  const before = tableAdmin({
    company_internal_roles: [{ role_id: "role", criteria: [{ name: "ML 실무", criteria: "3년 이상" }, { name: "모델 서빙", criteria: "서빙 경험" }] }],
    company_intro_candidates: [{ role_id: "role", talent_id: "talent", presentation: { criteriaEvaluations: [
      rated("ML 실무", "3년 이상", "excellent"), rated("모델 서빙", "서빙 경험", "good")] } }],
  });
  assert.deepEqual((await mailCriteriaByCandidate(before, [intro])).get("intro"),
    [{ name: "ML 실무", fitness: "excellent" }, { name: "모델 서빙", fitness: "good" }]);
});
