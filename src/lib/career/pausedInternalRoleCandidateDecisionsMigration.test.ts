import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260914123000_paused_internal_role_candidate_decisions.sql"
  ),
  "utf8"
);

const candidateDecisionStatuses =
  /not in \('active', 'paused', 'top_priority'\)/g;

test("allows paused internal roles through every candidate decision database entry point", () => {
  for (const functionName of [
    "set_talent_internal_role_recommendation_before_company_share_v1",
    "accept_talent_internal_role_recommendation_v1",
    "change_internal_talent_opportunity_decision_v2",
    "present_talent_internal_role_recommendation_for_review_v1",
  ]) {
    assert.match(
      migration,
      new RegExp(`create or replace function public\\.${functionName}\\(`)
    );
  }

  assert.equal([...migration.matchAll(candidateDecisionStatuses)].length, 4);
});

test("continues blocking expired and test-only internal roles", () => {
  assert.match(migration, /coalesce\(v_target_role\.is_expired, false\)/);
  assert.match(migration, /v_target_role\.expires_at <= v_now/);
  assert.match(migration, /v_target_role\.information ->> 'testOnly'/);
  assert.match(migration, /coalesce\(v_role\.is_expired, false\)/);
  assert.match(migration, /v_role\.expires_at <= v_now/);
  assert.match(migration, /v_role\.information ->> 'testOnly'/);
});
