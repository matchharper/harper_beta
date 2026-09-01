import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260831140000_company_candidate_role_move.sql"
  ),
  "utf8"
);

test("candidate Role move is one atomic RPC with durable idempotency", () => {
  assert.match(
    migration,
    /create or replace function public\.move_company_candidate_to_role_v1/
  );
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(
    migration,
    /talent_progress_org_candidate_role_move_event_key_uidx/
  );
  assert.match(migration, /contact_queue_candidate_role_changed_transfer_uidx/);
  assert.match(migration, /'org_candidate_role_move'/);
  assert.match(migration, /'internal_candidate_role_changed'/);
});

test("candidate Role move preserves source requests and meetings", () => {
  assert.match(
    migration,
    /from public\.company_talent_requests request[\s\S]*v_open_question_count/
  );
  assert.match(
    migration,
    /from public\.meeting_schedules meeting[\s\S]*v_active_meeting_count/
  );
  assert.doesNotMatch(
    migration,
    /update public\.company_talent_requests[\s\S]*role_id\s*=/
  );
  assert.doesNotMatch(
    migration,
    /update public\.meeting_schedules[\s\S]*role_id\s*=/
  );
});

test("test-only destinations require an allowlist and never write fit rows", () => {
  assert.match(migration, /information ->> 'testOnly'/);
  assert.match(migration, /information ->> 'testFixture'/);
  assert.match(migration, /information -> 'testTalentIds'/);
  assert.match(
    migration,
    /if not v_is_test_only then[\s\S]*talent_opportunity_fit/
  );
});
