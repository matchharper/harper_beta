import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260903120000_crm_email_broadcasts.sql",
  "utf8"
);
test("a broadcast freezes one durable queue row per eligible talent", () => {
  assert.match(migration, /queue_crm_email_broadcast/);
  assert.match(
    migration,
    /contact_queue_crm_broadcast_recipient_uidx[\s\S]*user_id[\s\S]*crmBroadcastId/
  );
  assert.match(
    migration,
    /insert into public\.contact_queue[\s\S]*'crm_broadcast'[\s\S]*'crmBroadcastId'/
  );
  assert.match(migration, /talent\.deleted_at is null/);
  assert.match(migration, /profile_visibility[\s\S]*<> 'dont_share'/);
  assert.match(
    migration,
    /get_external_recommendation[\s\S]*get_internal_recommendation/
  );
});

test("a broadcast can pause remaining deliveries without rewriting sent facts", () => {
  const pauseFunction = migration.match(
    /create or replace function public\.set_crm_email_broadcast_paused[\s\S]*?revoke all on function public\.set_crm_email_broadcast_paused/
  )?.[0];
  assert.ok(pauseFunction);
  assert.match(pauseFunction, /and status = 'queued'/);
  assert.match(pauseFunction, /'infinity'::timestamptz/);
  assert.match(pauseFunction, /crmBroadcastResumeScheduledAt/);
  assert.doesNotMatch(pauseFunction, /status = 'sent'/);
  assert.match(migration, /sync_crm_email_broadcast_completion/);
  assert.match(migration, /pending\.status in \('queued', 'processing'\)/);
});
