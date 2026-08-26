import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260825113000_meeting_schedule_drafts.sql"
  ),
  "utf8"
);

test("meeting draft RPC serializes retries and validates changed draft input", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(
    migration,
    /v_round\.meeting_config_snapshot[\s\S]*?is distinct from p_meeting_config_snapshot/
  );
  assert.match(
    migration,
    /v_round\.additional_message is distinct from p_additional_message/
  );
});

test("meeting migration can resume after an earlier manual application", () => {
  assert.match(
    migration,
    /add column if not exists confirmed_start_at timestamptz/
  );
  assert.match(
    migration,
    /add column if not exists public_token_hash text/
  );
  assert.match(
    migration,
    /add column if not exists delivery_queue_id uuid[\s\S]*?references public\.contact_queue/
  );
  assert.match(migration, /when duplicate_object then null/);
  assert.doesNotMatch(migration, /from pg_constraint/);
});

test("an otherwise identical later-message retry keeps the original audit source", () => {
  const existingDraftBranch = migration.match(
    /if found then([\s\S]*?)return jsonb_build_object\(/
  )?.[1];

  assert.ok(existingDraftBranch);
  assert.doesNotMatch(
    existingDraftBranch,
    /source_company_message_id[\s\S]*?is distinct/
  );
  assert.match(
    migration,
    /Keep the original source[\s\S]*?message as the audit origin/
  );
});

test("active round and participant ownership remain database-enforced", () => {
  assert.match(
    migration,
    /foreign key \(id, active_round_id\)[\s\S]*?references public\.meeting_schedule_rounds\(schedule_id, id\)/
  );
  assert.match(migration, /meeting schedule attendees must include organizer/);
  assert.match(
    migration,
    /meeting schedule attendee is not a workspace member/
  );
});

test("web-created drafts may omit a chat message without weakening workspace checks", () => {
  assert.match(
    migration,
    /source_company_message_id bigint\s+references public\.company_messages/
  );
  assert.match(
    migration,
    /if p_source_company_message_id is not null and not exists/
  );
});

test("draft edits update the aggregate and active round atomically with a version check", () => {
  const updateFunction = migration.match(
    /create or replace function public\.update_meeting_schedule_draft_v1([\s\S]*?)revoke all on function public\.update_meeting_schedule_draft_v1/
  )?.[1];

  assert.ok(updateFunction);
  assert.match(
    updateFunction,
    /v_schedule\.version is distinct from p_expected_version/
  );
  assert.match(updateFunction, /update public\.meeting_schedules/);
  assert.match(updateFunction, /update public\.meeting_schedule_rounds/);
  assert.match(
    updateFunction,
    /meeting schedule attendee is not a workspace member/
  );
});

test("candidate invitation queueing stores one hashed token and one durable outbox row", () => {
  const queueFunction = migration.match(
    /create or replace function public\.queue_meeting_schedule_invitation_v1([\s\S]*?)revoke all on function public\.queue_meeting_schedule_invitation_v1/
  )?.[1];

  assert.ok(queueFunction);
  assert.match(queueFunction, /insert into public\.contact_queue/);
  assert.match(queueFunction, /meeting_schedule_candidate_invitation/);
  assert.match(queueFunction, /public_token_hash = p_public_token_hash/);
  assert.match(queueFunction, /status = 'awaiting_talent'/);
  assert.match(
    migration,
    /unique index[\s\S]*meeting_schedule_rounds_public_token_hash_uidx/
  );
});

test("candidate submission rechecks availability and every company attendee conflict atomically", () => {
  const submitFunction = migration.match(
    /create or replace function public\.submit_meeting_schedule_options_v1([\s\S]*?)revoke all on function public\.submit_meeting_schedule_options_v1/
  )?.[1];

  assert.ok(submitFunction);
  assert.match(
    submitFunction,
    /availability\.version = p_expected_availability_version/
  );
  assert.match(submitFunction, /for share/);
  assert.match(submitFunction, /meeting-attendee:/);
  assert.match(submitFunction, /pg_advisory_xact_lock/);
  assert.match(submitFunction, /other\.organizer_company_user_id/);
  assert.match(
    submitFunction,
    /jsonb_array_elements\(other\.company_attendees\)/
  );
  assert.match(submitFunction, /status = 'confirmed'/);
  assert.match(submitFunction, /confirmed_start_at = p_confirmed_start_at/);
});
