import assert from "node:assert/strict";
import test from "node:test";
import { compactSearchTime, partitionStoredFits, read_search } from "./readSearch";

test("compact dates use Korean calendar time and retain years across year boundaries", () => {
  assert.equal(compactSearchTime("2026-10-14T00:56:15.205294+00:00", "2026-10-15T03:14:55Z"), "10/14 09:56");
  assert.equal(compactSearchTime("2025-12-31T16:10:00Z", "2026-01-02T00:00:00Z"), "01/01 01:10");
  assert.equal(compactSearchTime("2025-12-31T14:10:00Z", "2026-01-02T00:00:00Z"), "2025/12/31 23:10");
  assert.equal(compactSearchTime(null, "2026-10-15T00:00:00Z"), "미기록");
});

test("stored-result denominator excludes legacy and incomplete records; failed axes count once", () => {
  const base = { fit_contract_version: "talent_role_fit_v2" };
  const groups = partitionStoredFits([
    { ...base, evaluated_stage: 1, stage_one_result: "screened_out" },
    { ...base, evaluated_stage: 2, role_fit: "bad", candidate_fit: "unfit", company_fit: "good" },
    { ...base, evaluated_stage: 2, role_fit: "good", candidate_fit: "worth_considering", company_fit: "perfect" },
    { ...base, evaluated_stage: 2, role_fit: "good", candidate_fit: null, company_fit: "good" },
    { fit_contract_version: null, role_fit: "ambiguous" },
  ]);
  assert.equal(groups.stage1.length, 1);
  assert.equal(groups.stage2.length, 2);
  assert.equal(groups.failed.length, 1);
  assert.equal(groups.passed, 1);
  assert.equal(groups.legacyOrUnclassified, 2);
});

test("operator scope is checked before any review or fit is read", async () => {
  const workspaceId = "11111111-1111-1111-1111-111111111111";
  const roleId = "22222222-2222-2222-2222-222222222222";
  const tables: string[] = [], filters: unknown[] = [];
  const admin = { from(table: string) {
    tables.push(table);
    const query = { select() { return query; }, eq(key: string, value: string) { filters.push([table, key, value]); return query; },
      async single() { return { data: table === "company_workspace" ? { is_internal: false } : { source_type: "internal" }, error: null }; } };
    return query;
  } };
  await assert.rejects(read_search({ admin: admin as any, workspaceId, roleId }), /internal workspace/);
  assert.deepEqual(tables, ["company_workspace", "company_roles"]);
  assert.ok(filters.some((x: any) => x[0] === "company_roles" && x[1] === "company_workspace_id" && x[2] === workspaceId));
  assert.ok(filters.some((x: any) => x[0] === "company_roles" && x[1] === "role_id" && x[2] === roleId));
});
