import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260909120000_behavior_context_talent_context_sources.sql"
  ),
  "utf8"
);

test("retires only provenance-marked legacy behavior copies from Memory", () => {
  assert.match(
    migration,
    /where collection = 'memory'[\s\S]*source_refs @> '\[\{"type":"talent_behavior_context_migration"\}\]'::jsonb/
  );
  assert.match(migration, /set deleted_at = coalesce\(deleted_at,/);
  assert.doesNotMatch(migration, /delete from public\.talent_contexts/);
});

test("queues Brief and Memory source changes without embedding-only churn", () => {
  assert.match(
    migration,
    /create trigger talent_contexts_behavior_context_change[\s\S]*on public\.talent_contexts/
  );
  assert.match(
    migration,
    /old\.content is not distinct from new\.content[\s\S]*old\.importance is not distinct from new\.importance[\s\S]*old\.deleted_at is not distinct from new\.deleted_at then[\s\S]*return new/
  );
  assert.match(migration, /'talent_context'/);
});

test("restores every grounded behavior source trigger", () => {
  for (const trigger of [
    "talent_messages_behavior_context_change",
    "career_email_messages_behavior_context_change",
    "talent_recommendation_behavior_context_change",
    "talent_activity_events_behavior_context_change",
    "talent_opportunity_tag_behavior_context_change",
    "talent_progress_behavior_context_change",
  ]) {
    assert.match(migration, new RegExp(`create trigger ${trigger}`));
  }
});

test("opportunity progress is queued as source evidence without semantic filtering", () => {
  const progressFunction = migration.match(
    /create or replace function public\.enqueue_talent_progress_behavior_context_change\(\)[\s\S]*?\n\$\$;/
  )?.[0];

  assert.ok(progressFunction);
  assert.match(progressFunction, /'progress'/);
  assert.match(progressFunction, /old\.metadata is distinct from new\.metadata/);
  assert.doesNotMatch(progressFunction, /interview|offer|accepted|rejected/);
});

test("activity capture does not classify preference meaning with keyword lists", () => {
  const activityFunction = migration.match(
    /create or replace function public\.enqueue_activity_behavior_context_change\(\)[\s\S]*?\n\$\$;/
  )?.[0];

  assert.ok(activityFunction);
  assert.doesNotMatch(activityFunction, /profile_ingestion|resume_upload|career_goal/);
  assert.doesNotMatch(activityFunction, /impact_level[^\n]* in \(/);
  assert.match(activityFunction, /btrim\(coalesce\(new\.summary, ''\)\) <> ''/);
});

test("a recommendation exposure alone does not dirty Behavior Context", () => {
  const recommendationFunction = migration.match(
    /create or replace function public\.enqueue_recommendation_behavior_context_change\(\)[\s\S]*?\n\$\$;/
  )?.[0];

  assert.ok(recommendationFunction);
  assert.match(recommendationFunction, /if not new_recorded then return new/);
  assert.match(recommendationFunction, /new\.viewed_at is not null/);
  assert.match(recommendationFunction, /new\.clicked_at is not null/);
  assert.match(recommendationFunction, /when tg_op = 'INSERT'/);
  assert.doesNotMatch(recommendationFunction, /array\[\s*'role_id', 'recommended_at'/);
});

test("all future discovery runs default to the unified context path", () => {
  assert.match(
    migration,
    /alter table public\.opportunity_discovery_run[\s\S]*alter column context_variant set default 'talent_contexts'/
  );
});
