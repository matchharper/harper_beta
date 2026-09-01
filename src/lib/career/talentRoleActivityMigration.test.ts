import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260831130000_talent_role_activity.sql"
  ),
  "utf8"
);
const talentTools = readFileSync(
  path.join(process.cwd(), "src/lib/talentOnboarding/tools.ts"),
  "utf8"
);

test("creates an append-only talent role activity table scoped to a recommendation", () => {
  assert.match(
    migration,
    /create table if not exists public\.talent_role_activity/
  );
  assert.match(
    migration,
    /recommendation_id uuid not null[\s\S]*references public\.talent_opportunity_recommendation\(id\) on delete cascade/
  );
  assert.match(migration, /talent_role_activity_recommendation_created_idx/);
  assert.match(
    migration,
    /alter table public\.talent_role_activity enable row level security/
  );
  assert.match(
    migration,
    /revoke all on table public\.talent_role_activity[\s\S]*from public, anon, authenticated/
  );
});

test("backfills only non-empty legacy memos once", () => {
  assert.match(
    migration,
    /where nullif\(btrim\(recommendation\.talent_memo\), ''\) is not null/
  );
  assert.match(migration, /'source', 'talent_memo_backfill'/);
  assert.match(
    migration,
    /activity\.metadata ->> 'source' = 'talent_memo_backfill'/
  );
});

test("memo append and talent stage moves validate recommendation ownership", () => {
  assert.match(migration, /append_talent_role_memo_activity_v1/);
  assert.match(migration, /move_talent_role_saved_stage_v1/);
  assert.match(migration, /update_talent_role_feedback_v1/);
  assert.match(
    migration,
    /recommendation\.id = p_recommendation_id[\s\S]*recommendation\.talent_id = p_talent_id/
  );
  assert.match(migration, /'saved_stage_changed'/);
  assert.match(migration, /'previousStage', v_previous_stage/);
  assert.match(migration, /'savedStage', p_saved_stage/);
});

test("does not attribute automatic progress-based closure to the talent", () => {
  assert.match(
    talentTools,
    /recordTalentRoleActivity: false,\s*savedStage: "closed"/
  );
});
