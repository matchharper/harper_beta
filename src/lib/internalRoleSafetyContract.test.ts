import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("database triggers block test-role fit and non-fixture recommendations", () => {
  const migration = readFileSync(
    join(
      root,
      "supabase/migrations/20260827150000_test_internal_role_talent_isolation.sql"
    ),
    "utf8"
  );

  assert.match(
    migration,
    /test-only internal roles cannot have talent opportunity fit rows/
  );
  assert.match(migration, /testTalentIds/);
  assert.equal((migration.match(/before insert or update/g) ?? []).length, 2);
});

test("test-only roles cannot enter or be claimed from company context runs", () => {
  const migration = readFileSync(
    join(
      root,
      "supabase/migrations/20260831160000_test_only_company_context_run_guard.sql"
    ),
    "utf8"
  );

  assert.match(
    migration,
    /create or replace function public\.enqueue_company_context_run_v1/
  );
  assert.match(
    migration,
    /create or replace function public\.enqueue_due_company_context_runs_v1/
  );
  assert.match(
    migration,
    /create or replace function public\.claim_company_context_run_v1/
  );
  assert.match(
    migration,
    /test-only internal roles cannot have company context runs/
  );
  assert.match(migration, /resultReason', 'test_only_role'/);
  assert.match(migration, /company_context_runs_test_only_guard_v1/);
  assert.ok((migration.match(/information->>'testOnly'/g) ?? []).length >= 5);
});

test("company Slack Gmail E2E fixtures carry the mandatory marker", () => {
  const fixture = readFileSync(
    join(root, "scripts/evalCompanySlackGmailE2E.ts"),
    "utf8"
  );

  assert.match(fixture, /testOnly:\s*true/);
  assert.match(fixture, /testTalentIds:\s*\[TALENT_ID\]/);
  assert.match(fixture, /!isMarkedTestOnly\(role\.information\)/);
});
