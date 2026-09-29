import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ORG_ROLE_MUTATION_STATUS_VALUES } from "@/lib/org/roleStatus";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260927032257_allow_deleted_company_role_status.sql",
    import.meta.url
  ),
  "utf8"
);

test("database validation accepts the same writable role states as the application", () => {
  const branch = migration.match(
    /if p_key = 'role_status' then([\s\S]*?)return;/
  )?.[1];
  assert.ok(branch, "role_status validation branch is missing");
  const allowed = Array.from(branch.matchAll(/'([a-z_]+)'/g), (match) =>
    String(match[1])
  ).filter((value) => value !== "string" && value !== "22023");
  assert.deepEqual(allowed, [...ORG_ROLE_MUTATION_STATUS_VALUES]);
});

test("role deletion accepts the paired expiry write", () => {
  const branch = migration.match(
    /if p_key = 'role_is_expired' then([\s\S]*?)return;/
  )?.[1];
  assert.ok(branch, "role_is_expired validation branch is missing");
  assert.match(branch, /jsonb_typeof\(p_value\) <> 'boolean'/);
  assert.doesNotMatch(branch, /p_source/);
});

test("unrelated company data retains the strict validator", () => {
  assert.match(
    migration,
    /perform public\.validate_company_data_change_value_strict_v1\(\s*p_key, p_value, p_source\s*\)/
  );
  assert.match(
    migration,
    /revoke all on function public\.validate_company_data_change_value_v1/
  );
});
