import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260828162000_ops_matching_role_stage_meeting_defaults.sql"
  ),
  "utf8"
);

test("meeting defaults extend the existing Role pipeline stages", () => {
  assert.match(migration, /alter table public\.ops_matching_role_stages/);
  assert.match(migration, /meeting_purpose text/);
  assert.match(migration, /meeting_duration_minutes integer/);
  assert.match(migration, /meeting_candidate_message text/);
  assert.match(migration, /between 15 and 240/);
  assert.match(migration, /meeting_details_pair_check/);
  assert.doesNotMatch(migration, /company_role_meeting_profiles/);
});
