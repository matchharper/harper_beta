import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261029134103_hold_intro_booking_invitation.sql"
  ),
  "utf8"
);

test("a link held for the intro email is queued far in the future from the insert", () => {
  // The same signature, so the web before and after this change both call it.
  assert.match(
    migration,
    /create or replace function public\.queue_meeting_schedule_invitation_v1\(\s*p_schedule_id uuid,\s*p_company_workspace_id uuid,\s*p_expected_schedule_version bigint,\s*p_public_token_hash text,\s*p_invitation_expires_at timestamp with time zone,\s*p_invitation_snapshot jsonb,\s*p_queue_payload jsonb\s*\)/
  );
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path to 'public'/);
  // Held rows get the far date in the insert itself; others stay due now.
  assert.match(
    migration,
    /when p_queue_payload -> 'heldForIntroEmail' = 'true'::jsonb\s+then timezone\('utc', '9999-12-31T00:00:00Z'::timestamptz\)\s+else timezone\('utc', now\(\)\)/
  );
  // Grants are kept by create or replace; none are changed here.
  assert.doesNotMatch(migration, /\b(grant|revoke)\b/i);
});
