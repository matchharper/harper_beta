import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260828170000_google_calendar_busy_block_overrides.sql"
  ),
  "utf8"
);

test("Google Calendar busy blocks can be made available for Harper meetings without deleting the source event", () => {
  assert.match(
    migration,
    /alter table public\.company_user_calendar_busy_blocks[\s\S]*is_blocking boolean not null default true/
  );
  assert.doesNotMatch(migration, /create table/);
  assert.match(
    migration,
    /where busy\.is_blocking[\s\S]*busy\.company_user_id::text/
  );
});

test("a complete sync removes events that disappeared while preserving explicit overrides", () => {
  assert.match(
    migration,
    /create or replace function public\.upsert_google_calendar_busy_blocks_v1[\s\S]*with removed as \([\s\S]*delete from public\.company_user_calendar_busy_blocks existing[\s\S]*and not exists \([\s\S]*'removedCount', v_removed_count/
  );
  const conflictUpdate = migration.match(
    /on conflict \([\s\S]*?\) do update([\s\S]*?)with removed as \(/
  )?.[1];
  assert.ok(conflictUpdate);
  assert.doesNotMatch(conflictUpdate, /is_blocking\s*=/);
  assert.match(
    migration,
    /last_sync_window_end_at > p_window_end[\s\S]*a newer Google Calendar sync already completed/
  );
});

test("busy block overrides serialize with sync and meeting confirmation", () => {
  assert.match(
    migration,
    /create or replace function public\.set_google_calendar_busy_block_blocking_v1[\s\S]*pg_advisory_xact_lock\([\s\S]*update public\.company_user_calendar_busy_blocks[\s\S]*set is_blocking = p_is_blocking/
  );
  assert.match(
    migration,
    /grant execute on function public\.set_google_calendar_busy_block_blocking_v1\([\s\S]*\) to service_role/
  );
});
