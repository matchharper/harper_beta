import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260909160000_internal_candidate_reengagement.sql",
  "utf8"
);

test("renewed interest reuses the existing candidate request lifecycle", () => {
  const targetSql =
    migration.match(
      /create or replace function public\.company_talent_request_target_is_active_v1[\s\S]*?\n\$\$;/
    )?.[0] ?? "";
  assert.match(migration, /intent in \('ordinary', 'candidate_reengagement'\)/);
  assert.match(
    migration,
    /intent = 'candidate_reengagement'[\s\S]*resume_stage[\s\S]*is not null/
  );
  assert.match(
    migration,
    /company_talent_request_target_is_active_v1[\s\S]*recommendation\.saved_stage, ''\)\)\) = 'closed'/
  );
  assert.match(
    migration,
    /candidate_reengagement_request_is_current_v1[\s\S]*coalesce\(stage_change\.updated_at, stage_change\.created_at\) > request\.created_at/
  );
  assert.match(
    migration,
    /request\.intent = 'candidate_reengagement'[\s\S]*candidate_reengagement_request_is_current_v1\(request\.id\)/
  );
  assert.match(
    targetSql,
    /role\.status, 'active'\) not in \('ended', 'deleted'\)[\s\S]*role\.is_expired, false\) = false/
  );
  assert.doesNotMatch(targetSql, /role\.expires_at/);
});

test("only an explicit positive candidate reply reopens the closed Role", () => {
  const functionSql =
    migration.match(
      /create or replace function public\.record_company_talent_response_v2[\s\S]*?\n\$\$;/
    )?.[0] ?? "";
  assert.match(
    functionSql,
    /p_disposition not in \('positive', 'negative', 'other'\)/
  );
  assert.match(
    functionSql,
    /if p_disposition = 'positive' and v_reengagement_current then[\s\S]*saved_stage = 'accepted'[\s\S]*processed_stage = v_stage/
  );
  assert.match(
    functionSql,
    /internal_process_reactivated[\s\S]*consentSource', 'candidate_reply'/
  );
  assert.match(
    functionSql,
    /internal_process_reengagement_response[\s\S]*종료 상태를 유지했습니다/
  );
  assert.match(
    functionSql,
    /v_stage := 'pending_connection'[\s\S]*v_stage_fallback := true/
  );
  assert.match(
    functionSql,
    /company_stage_changed_after_request[\s\S]*자동으로 복구하지 않고 현재 상태를 유지했습니다/
  );
});

test("reply processing is idempotent for the same semantic disposition", () => {
  assert.match(
    migration,
    /if v_request\.response_disposition = p_disposition then[\s\S]*return v_request/
  );
  assert.match(migration, /talent_progress_reengagement_event_key_uidx/);
});

test("Career closure commits closed and its progress fact atomically", () => {
  const functionSql =
    migration.match(
      /create or replace function public\.commit_internal_process_closure_notice_v1[\s\S]*?\n\$\$;/
    )?.[0] ?? "";
  assert.match(functionSql, /set saved_stage = 'closed'/);
  assert.match(functionSql, /returning role_id into v_role_id/);
  assert.match(functionSql, /internal_process_stopped_notified/);
  assert.match(functionSql, /if not found then[\s\S]*return false/);
});

test("private company confirmation reopens and records the actor in one operation", () => {
  const functionSql =
    migration.match(
      /create or replace function public\.confirm_internal_candidate_reengagement_v1[\s\S]*?\n\$\$;/
    )?.[0] ?? "";
  assert.match(functionSql, /set saved_stage = 'accepted'/);
  assert.match(functionSql, /processed_stage = v_stage/);
  assert.match(functionSql, /company_user_id/);
  assert.match(functionSql, /internal_process_reactivated/);
  assert.match(functionSql, /delete from public\.talent_opportunity_tag/);
  assert.match(functionSql, /insert into public\.talent_opportunity_tag/);
  assert.match(functionSql, /v_stage_tag := case v_stage/);
  assert.match(
    functionSql,
    /progress\.kind = 'internal_process_reactivated'[\s\S]*progress\.metadata ->> 'eventKey' = p_metadata ->> 'eventKey'[\s\S]*return true/
  );
  assert.match(
    functionSql,
    /role\.status, 'active'\) not in \('ended', 'deleted'\)[\s\S]*role\.is_expired, false\) = false/
  );
  assert.doesNotMatch(functionSql, /role\.expires_at/);
});
