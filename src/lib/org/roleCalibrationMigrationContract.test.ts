import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260904130000_company_role_calibrations.sql",
    import.meta.url
  ),
  "utf8"
);

test("role calibration migration keeps one JSONB lifecycle row and atomic claims", () => {
  assert.match(migration, /create table public\.company_role_calibrations/);
  assert.match(migration, /payload jsonb not null/);
  assert.match(migration, /for update of calibration skip locked/);
  assert.match(migration, /company_role_calibrations_one_open_role_idx/);
  assert.match(migration, /information->>'testOnly'/);
  assert.match(migration, /source_type[\s\S]*'internal'/);
});

test("a Role never receives a second calibration row in any lifecycle state", () => {
  const enqueueFunction = migration.match(
    /create or replace function public\.enqueue_company_role_calibration_v1[\s\S]*?\n\$\$;/
  )?.[0];

  assert.ok(enqueueFunction);
  assert.match(
    enqueueFunction,
    /select calibration\.id[\s\S]*where calibration\.role_id = p_role_id[\s\S]*if v_existing_id is not null then[\s\S]*return v_existing_id;/
  );
});

test("profile review and Hiring Brief update share one database function", () => {
  const feedbackFunction = migration.match(
    /create or replace function public\.apply_company_role_calibration_feedback_v1[\s\S]*?\n\$\$;/
  )?.[0];

  assert.ok(feedbackFunction);
  assert.match(feedbackFunction, /for update/);
  assert.match(feedbackFunction, /from public\.company_messages/);
  assert.match(
    feedbackFunction,
    /feedback source message is outside this workspace/
  );
  assert.match(feedbackFunction, /update public\.company_internal_roles/);
  assert.match(
    feedbackFunction,
    /reasonless feedback cannot change the Hiring Brief/
  );
  assert.match(feedbackFunction, /update public\.company_role_calibrations/);
});
