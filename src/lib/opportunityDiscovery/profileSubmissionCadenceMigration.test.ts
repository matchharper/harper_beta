import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260901110000_periodic_profile_submission_cadence.sql"
  ),
  "utf8"
);

test("latest profile submission defers every periodic scheduler state by three days", () => {
  assert.match(
    migration,
    /where role = 'user' and message_type = 'profile_submit'/
  );
  assert.match(
    migration,
    /create trigger talent_messages_defer_opportunity_scheduler/
  );
  assert.match(
    migration,
    /new\.created_at \+ interval '3 days'/
  );
  assert.match(
    migration,
    /set next_check_at = greatest\([\s\S]*excluded\.next_check_at/
  );
});

test("new and existing scheduler states use the same profile-submission floor", () => {
  assert.match(
    migration,
    /create or replace function public\.ensure_opportunity_scheduler_state\(\)/
  );
  assert.ok(
    (migration.match(/latest_submitted_at \+ interval '3 days'/g) ?? [])
      .length >= 1
  );
  assert.match(
    migration,
    /insert into public\.opportunity_scheduler_state[\s\S]*from public\.talent_setting setting/
  );
});
