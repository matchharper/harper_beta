import assert from "node:assert/strict";
import test from "node:test";
import { readRoleMatchingActivity } from "./activity.server";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const roleId = "20000000-0000-4000-8000-000000000001";
const field = (row: any, path: string): any => path.split(/->>?/).reduce((value, key) => value?.[key], row);

function fixture() {
  const runs: any[] = [], jobs: any[] = [];
  const admin: any = { from(table: string) {
    let rows = [...(table === "company_first_search_runs" ? runs : jobs)];
    const query: any = {
      select() { return query; },
      eq(key: string, value: unknown) { rows = rows.filter(row => field(row, key) === value); return query; },
      in(key: string, values: unknown[]) { rows = rows.filter(row => values.includes(field(row, key))); return query; },
      is(key: string, value: unknown) { rows = rows.filter(row => (field(row, key) ?? null) === value); return query; },
      or(filter: string) {
        assert.equal(filter, `role_id.eq.${roleId},scheduled_role_ids.cs.{${roleId}},requested_role_ids.cs.{${roleId}}`);
        rows = rows.filter(row => row.role_id === roleId || row.scheduled_role_ids?.includes(roleId) || row.requested_role_ids?.includes(roleId));
        return query;
      },
      order() { rows.reverse(); return query; }, limit(n: number) { rows = rows.slice(0, n); return query; },
      then(resolve: (result: unknown) => void) { return Promise.resolve(resolve({ error: null, data: rows.map(row => ({
        status: row.status, trigger_reason: row.trigger_reason,
        activation_run_id: row.request_options?.activationRunId ?? row.action_context?.activationRunId ?? null,
        selection_source_run_id: row.request_options?.selectionSourceRunId ?? null,
        completed_run_id: row.action_context?.completedRunId ?? null,
      })) })); },
    };
    return query;
  } };
  const base = { role_id: roleId, company_workspace_id: workspaceId };
  return { runs, jobs, base, read: () => readRoleMatchingActivity({ admin, workspaceId, roleId }) };
}

test("activation stays visible through worker, company review, publication and delivery, then clears", async () => {
  const f = fixture();
  const kickoff = { ...f.base, status: "queued", trigger_reason: "role_activated" };
  f.runs.push(kickoff);
  assert.deepEqual(await f.read(), { ok: true, active: false, activity: { trigger: "role_activated", phase: "queued" } });
  kickoff.status = "running";
  assert.equal((await f.read()).activity?.phase, "searching");
  kickoff.status = "skipped";
  const root = { ...f.base, status: "queued", action_name: "scheduled_matching_review", action_context: { activationRunId: "activation" } };
  f.jobs.push(root);
  assert.equal((await f.read()).activity?.phase, "queued");
  root.status = "completed";
  const search: any = { ...f.base, status: "running", trigger_reason: "scheduled", contract_version: "scheduled_agentic_role_search_v1", request_options: { activationRunId: "activation" }, result: {} };
  f.runs.push(search);
  assert.deepEqual((await f.read()).activity, { trigger: "role_activated", phase: "searching" });
  search.status = "succeeded";
  assert.equal((await f.read()).activity?.phase, "reviewing", "dispatcher handoff stays visible");
  search.result.scheduledContinuation = { jobId: "review" };
  const review = { ...root, status: "processing", action_context: { ...root.action_context, completedRunId: "search" } };
  f.jobs.push(review);
  assert.equal((await f.read()).activity?.phase, "reviewing");
  review.status = "completed";
  const publish: any = { ...search, status: "running", result: {}, request_options: { ...search.request_options, selectionSourceRunId: "search" } };
  f.runs.push(publish);
  assert.equal((await f.read()).activity?.phase, "preparing");
  publish.status = "delivery_pending";
  assert.equal((await f.read()).activity?.phase, "delivering");
  publish.status = "succeeded";
  assert.equal((await f.read()).activity?.phase, "reviewing");
  publish.result.scheduledContinuation = { jobId: "completion" };
  assert.equal((await f.read()).activity, null);
});

test("scheduled work includes legacy Role arrays, excludes other roles/workspaces and does not block the manual button", async () => {
  const f = fixture();
  f.runs.push({ ...f.base, role_id: null, scheduled_role_ids: [roleId], trigger_reason: "scheduled", status: "running" });
  f.runs.push({ ...f.base, role_id: "other", trigger_reason: "company_requested", status: "running" });
  f.jobs.push({ ...f.base, company_workspace_id: "other", action_name: "scheduled_matching_review", status: "processing" });
  assert.deepEqual(await f.read(), { ok: true, active: false, activity: { trigger: "scheduled", phase: "searching" } });
  f.runs.push({ ...f.base, role_id: null, requested_role_ids: [roleId], trigger_reason: "company_requested", status: "queued" });
  assert.equal((await f.read()).active, true);
  f.runs.forEach(row => { row.status = "failed"; });
  assert.equal((await f.read()).activity, null, "terminal legacy failures are not active work");
});

test("unavailable status data is an error, not idle", async () => {
  const q: any = { select: () => q, eq: () => q, or: () => q, in: () => q, is: () => q, order: () => q, limit: () => q,
    then: (resolve: any) => Promise.resolve(resolve({ data: null, error: new Error("unavailable") })) };
  await assert.rejects(readRoleMatchingActivity({ admin: { from: () => q } as any, roleId, workspaceId }), /unavailable/);
});
