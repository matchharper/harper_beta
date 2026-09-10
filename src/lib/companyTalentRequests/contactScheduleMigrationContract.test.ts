import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260908170000_company_talent_contact_five_minute_delay.sql"
  ),
  "utf8"
);

const legacyEnqueueFunction = migration.match(
  /create or replace function public\.enqueue_company_talent_request_v1\([\s\S]*?\n\$\$;/
)?.[0];
const draftScheduleFunction = migration.match(
  /create or replace function public\.schedule_company_talent_request_v1\([\s\S]*?\n\$\$;/
)?.[0];

test("standard candidate contact always keeps exactly the five-minute delay", () => {
  assert.ok(legacyEnqueueFunction);
  assert.ok(draftScheduleFunction);

  assert.match(
    legacyEnqueueFunction,
    /v_scheduled_at timestamptz := v_now \+ interval '5 minutes'/
  );
  assert.match(
    draftScheduleFunction,
    /when p_delivery_mode = 'immediate' then v_now[\s\S]*?else v_now \+ interval '5 minutes'/
  );
});

test("candidate contact scheduling no longer has a KST delivery window", () => {
  assert.ok(legacyEnqueueFunction);
  assert.ok(draftScheduleFunction);

  assert.doesNotMatch(legacyEnqueueFunction, /Asia\/Seoul|08:00|20:00/);
  assert.doesNotMatch(draftScheduleFunction, /Asia\/Seoul|08:00|20:00/);
});

test("the migration does not reschedule existing queue rows", () => {
  assert.doesNotMatch(migration, /update public\.contact_queue/);
});
