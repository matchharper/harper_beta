import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260827110000_google_calendar_scheduling.sql"
  ),
  "utf8"
);

test("calendar integration storage is reproducible from repository migrations", () => {
  assert.match(
    migration,
    /create table if not exists public\.company_user_integrations/
  );
  assert.match(migration, /primary key \(company_user_id, provider\)/);
  assert.match(migration, /unique \(composio_connected_account_id\)/);
  assert.match(migration, /alter column company_user_id set not null/);
  assert.match(migration, /company_user_integrations_account_id_check/);
  assert.match(
    migration,
    /revoke all on table public\.company_user_integrations[\s\S]*from public, anon, authenticated/
  );
});

test("calendar busy storage keeps privacy-minimal event identity and time ranges", () => {
  const table = migration.match(
    /create table if not exists public\.company_user_calendar_busy_blocks([\s\S]*?)create index/
  )?.[1];
  assert.ok(table);
  assert.match(table, /external_calendar_id text not null/);
  assert.match(table, /external_event_id text not null/);
  assert.match(table, /start_at timestamptz not null/);
  assert.match(table, /end_at timestamptz not null/);
  assert.doesNotMatch(table, /summary|description|attendees/);
  assert.match(
    migration,
    /revoke all on table public\.company_user_calendar_busy_blocks[\s\S]*from public, anon, authenticated/
  );
  assert.match(
    migration,
    /revoke all on table public\.meeting_schedule_calendar_events[\s\S]*from public, anon, authenticated/
  );
});

test("calendar sync is limited to fourteen days and deduplicates by provider event", () => {
  const sync = migration.match(
    /create or replace function public\.upsert_google_calendar_busy_blocks_v1([\s\S]*?)revoke all on function public\.upsert_google_calendar_busy_blocks_v1/
  )?.[1];
  assert.ok(sync);
  assert.match(sync, /interval '14 days 1 minute'/);
  assert.match(
    sync,
    /on conflict \([\s\S]*external_event_id[\s\S]*\) do update/
  );
  assert.match(sync, /last_synced_at/);
});

test("calendar sync and meeting confirmation serialize on the same attendee lock", () => {
  assert.ok(
    migration.match(/meeting-attendee:/g)?.length &&
      migration.match(/meeting-attendee:/g)!.length >= 2
  );
  assert.match(
    migration,
    /a synced Google Calendar event overlaps this meeting/
  );
  assert.match(migration, /meeting_schedules_calendar_busy_update_v1/);
  const confirmationGuard = migration.match(
    /create or replace function public\.enforce_confirmed_meeting_calendar_busy_v1([\s\S]*?)revoke all on function public\.enforce_confirmed_meeting_calendar_busy_v1/
  )?.[1];
  assert.ok(confirmationGuard);
  assert.doesNotMatch(confirmationGuard, /integration\.status = 'active'/);
});

test("synced busy ranges survive token expiry but are erased on disconnect", () => {
  assert.match(
    migration,
    /company_user_integrations_disable_calendar_busy_v1/
  );
  assert.match(migration, /new\.status = 'disabled'/);
  assert.match(migration, /after delete on public\.company_user_integrations/);
});

test("calendar event delivery has an idempotent claim and durable terminal states", () => {
  assert.match(migration, /meeting_schedule_calendar_events/);
  assert.match(migration, /'created_without_meet'/);
  const initializer = migration.match(
    /create or replace function public\.initialize_meeting_schedule_calendar_event_v1([\s\S]*?)revoke all on function public\.initialize_meeting_schedule_calendar_event_v1/
  )?.[1];
  assert.ok(initializer);
  assert.match(initializer, /new\.status = 'confirmed'/);
  assert.match(initializer, /on conflict \(schedule_id\) do nothing/);
  assert.match(migration, /after insert or update of status/);
  const claim = migration.match(
    /create or replace function public\.claim_meeting_schedule_calendar_event_v1([\s\S]*?)revoke all on function public\.claim_meeting_schedule_calendar_event_v1/
  )?.[1];
  assert.ok(claim);
  assert.match(claim, /for update/);
  assert.match(claim, /interval '90 seconds'/);
  assert.match(claim, /attempts = attempts \+ 1/);
});
