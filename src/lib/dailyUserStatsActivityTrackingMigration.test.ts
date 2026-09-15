import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260915160000_weekly_user_stats_activity_tracking.sql"
  ),
  "utf8"
);
const reportSource = readFileSync(
  path.join(process.cwd(), "src/lib/dailyUserStats.ts"),
  "utf8"
);

test("freezes mutable login and recommendation timestamps in append-only logs", () => {
  assert.match(
    migration,
    /after update of last_logined_at on public\.talent_users/i
  );
  assert.match(
    migration,
    /after update of viewed_at, clicked_at, feedback_at[\s\S]*on public\.talent_opportunity_recommendation/i
  );
  assert.match(migration, /weekly_stats_activity:login/);
  assert.match(migration, /weekly_stats_activity:recommendation_view/);
  assert.match(migration, /weekly_stats_activity:recommendation_click/);
  assert.match(migration, /weekly_stats_activity:recommendation_feedback/);
  assert.match(
    migration,
    /talent\.last_logined_at[\s\S]*talent_opportunity_recommendation_backfill/
  );
});

test("persists and backfills canonical testTalentIds for analytics exclusion", () => {
  assert.match(migration, /analytics_excluded_test_fixture_talent/);
  assert.match(
    migration,
    /after insert or update of information on public\.company_roles/i
  );
  assert.match(migration, /information -> 'testTalentIds'/);
  assert.match(migration, /information ->> 'testOnly'/);
});

test("uses append-only role activities instead of recommendation updated_at for saved status", () => {
  assert.match(
    reportSource,
    /from\("talent_role_activity"\)[\s\S]*\.eq\("kind", "saved_stage_changed"\)/
  );
  assert.doesNotMatch(
    reportSource,
    /\.not\("saved_stage", "is", null\)[\s\S]{0,300}\.gte\("updated_at"/
  );
});
