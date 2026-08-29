import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260828180000_org_candidate_activity_progress.sql"
  ),
  "utf8"
);

test("company candidate activity stays one lightweight progress kind", () => {
  assert.match(migration, /kind = 'org_candidate_activity'/);
  assert.match(migration, /'org_candidate_activity'/);
  assert.match(migration, /'candidate_contact_sent'/);
  assert.match(migration, /'candidate_response_received'/);
  assert.match(migration, /'requestId', v_request_id/);
  assert.match(migration, /'meeting_confirmed'/);

  assert.doesNotMatch(migration, /resume_opened|profile_opened/);
  assert.doesNotMatch(migration, /calendar_(?:failed|recovered)/);
  assert.doesNotMatch(migration, /meet_(?:failed|recovered)/);
});

test("migration does not backfill existing requests or meetings", () => {
  const afterTriggers = migration.split(
    "for each row execute function public.record_confirmed_meeting_org_candidate_activity_v1();"
  )[1];

  assert.ok(afterTriggers);
  assert.doesNotMatch(afterTriggers, /insert into public\.talent_progress/);
  assert.doesNotMatch(afterTriggers, /from public\.company_talent_requests/);
  assert.doesNotMatch(afterTriggers, /from public\.meeting_schedules/);
});

test("delivered questions and company-safe candidate answers remain reviewable", () => {
  assert.match(
    migration,
    /company_request_candidate_delivery[\s\S]*?\{delivery,chatText\}/
  );
  assert.match(
    migration,
    /company_request_company_delivery[\s\S]*?\{delivery,body\}/
  );
  assert.match(migration, /'candidate_response_received'/);
  assert.match(
    migration,
    /talent_response\.created_at[\s\S]*?document\.created_at/
  );
});

test("confirmed meetings retain the selected message and canonical time details", () => {
  assert.match(migration, /selection_snapshot ->> 'companyMessage'/);
  assert.match(migration, /'scheduledAt', new\.confirmed_start_at/);
  assert.match(migration, /'scheduledEndAt', new\.confirmed_end_at/);
  assert.match(migration, /'durationMinutes', new\.duration_minutes/);
  assert.match(migration, /'timezone', v_timezone/);
  assert.doesNotMatch(migration, /미팅이 확정됐어요\. %s/);
});

test("progress logging is idempotent and never rolls back delivery or confirmation", () => {
  assert.match(migration, /unique index[\s\S]*metadata ->> 'eventKey'/);
  assert.match(migration, /on conflict do nothing/g);
  assert.equal(
    (migration.match(/exception when others then/g) ?? []).length,
    2
  );
});
