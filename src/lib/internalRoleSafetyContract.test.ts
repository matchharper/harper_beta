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

  assert.match(migration, /test-only internal roles cannot have talent opportunity fit rows/);
  assert.match(migration, /testTalentIds/);
  assert.equal((migration.match(/before insert or update/g) ?? []).length, 2);
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
