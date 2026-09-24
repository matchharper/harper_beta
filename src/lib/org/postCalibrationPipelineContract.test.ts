import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260923120000_post_calibration_company_matching.sql",
    import.meta.url
  ),
  "utf8"
);
const calibrationListener = readFileSync(
  new URL("../../../scripts/company_role_calibration_listener.py", import.meta.url),
  "utf8"
);

test("first calibration Slack receipt schedules one regular company matching run after 12 hours", () => {
  assert.match(migration, /v_sent_at \+ interval '12 hours'/);
  assert.match(
    migration,
    /perform public\.enqueue_post_calibration_company_matching_run_v1/
  );
  assert.match(migration, /insert into public\.company_first_search_runs/);
  assert.match(migration, /'post_calibration'/);
  assert.match(migration, /'company_matching_run_contract_v3'/);
  assert.match(migration, /requested_role_ids/);
  assert.match(migration, /array\[v_role_id\]/);
  assert.match(migration, /source_calibration_id/);
  assert.match(migration, /for v_insert_attempt in 0\.\.999999 loop/);
  assert.match(migration, /on conflict do nothing/);
  assert.match(
    migration,
    /company matching queue slot unavailable for calibration/
  );
});

test("post-calibration search keeps the scheduled matching route contract", () => {
  assert.match(migration, /trigger_reason[\s\S]*'post_calibration'/);
  assert.match(migration, /requested_role_ids[\s\S]*array\[v_role_id\]/);
  assert.doesNotMatch(migration, /trigger_reason[\s\S]*'company_requested'/);
  assert.doesNotMatch(
    migration.match(
      /create or replace function public\.mark_company_role_calibration_delivery_v1[\s\S]*?\n\$\$;/
    )?.[0] ?? "",
    /enqueue_post_calibration_company_context_run_v1/
  );
});

test("the local Codex listener remains calibration-only", () => {
  assert.doesNotMatch(calibrationListener, /post_calibration_work_rows/);
  assert.doesNotMatch(calibrationListener, /POST_CALIBRATION_PROMPT_PATH/);
  assert.doesNotMatch(calibrationListener, /company_context_runs/);
  assert.match(calibrationListener, /calibration_work_rows/);
  assert.match(
    calibrationListener,
    /company-role-profile-calibration-event-prompt-ko/
  );
});

test("queued legacy Codex work is migrated and disabled", () => {
  assert.match(
    migration,
    /drop trigger if exists company_context_runs_enqueue_waiting_post_calibration_v1/
  );
  assert.match(
    migration,
    /drop trigger if exists company_context_runs_notify_post_calibration_v1/
  );
  assert.match(migration, /superseded_by_company_matching_worker/);
  assert.match(
    migration,
    /unfinished_run\.status in \('queued', 'failed'\)/
  );
  const legacyEnqueue = migration.match(
    /create or replace function public\.enqueue_post_calibration_company_context_run_v1[\s\S]*?\n\$\$;/
  )?.[0];
  const legacyClaim = migration.match(
    /create or replace function public\.claim_post_calibration_company_context_run_v1[\s\S]*?\n\$\$;/
  )?.[0];
  const legacyNotify = migration.match(
    /create or replace function public\.notify_post_calibration_company_context_work_v1[\s\S]*?\n\$\$;/
  )?.[0];
  assert.ok(legacyEnqueue);
  assert.ok(legacyClaim);
  assert.ok(legacyNotify);
  assert.match(
    legacyEnqueue,
    /enqueue_post_calibration_company_matching_run_v1/
  );
  assert.doesNotMatch(legacyEnqueue, /insert into public\.company_context_runs/);
  assert.match(legacyClaim, /begin\s+return;\s+end;/);
  assert.doesNotMatch(legacyClaim, /for update|update public\.company_context_runs/);
  assert.match(legacyNotify, /begin\s+return new;\s+end;/);
  assert.doesNotMatch(legacyNotify, /pg_notify/);
  assert.match(
    migration,
    /create trigger company_context_runs_notify_post_calibration_v1/
  );
});

test("post-calibration enqueue stays service-only", () => {
  assert.match(
    migration,
    /revoke all on function public\.enqueue_post_calibration_company_matching_run_v1\(uuid\)[\s\S]*from public, anon, authenticated/
  );
  assert.match(
    migration,
    /grant execute on function public\.enqueue_post_calibration_company_matching_run_v1\(uuid\)[\s\S]*to service_role/
  );
});
