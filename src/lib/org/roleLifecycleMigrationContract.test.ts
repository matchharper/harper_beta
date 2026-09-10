import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ORG_ROLE_MUTATION_STATUS_VALUES,
  ORG_ROLE_STATUS_VALUES,
} from "@/lib/org/roleStatus";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260907150000_company_role_lifecycle_validation.sql",
    import.meta.url
  ),
  "utf8"
);
const companySlackGmailE2e = readFileSync(
  new URL("../../../scripts/evalCompanySlackGmailE2E.ts", import.meta.url),
  "utf8"
);
const deletedStatusMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260819100000_internal_role_deleted_status.sql",
    import.meta.url
  ),
  "utf8"
);
const terminalTimestampMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260909130000_internal_role_terminal_expired_at.sql",
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

test("the role table constraint accepts the same complete lifecycle set", () => {
  const branch = deletedStatusMigration.match(
    /status in \(([^)]+)\)\s*or \(status = 'deleted'/
  )?.[1];
  assert.ok(branch, "company_roles lifecycle constraint is missing");
  const allowed = Array.from(branch.matchAll(/'([a-z_]+)'/g), (match) =>
    String(match[1])
  );
  assert.deepEqual([...allowed, "deleted"], [...ORG_ROLE_STATUS_VALUES]);
  assert.match(
    deletedStatusMigration,
    /status = 'deleted' and source_type = 'internal'/
  );
});

test("chat and Slack deletion can validate the paired expiry write", () => {
  const branch = migration.match(
    /if p_key = 'role_is_expired' then([\s\S]*?)return;/
  )?.[1];
  assert.ok(branch, "role_is_expired validation branch is missing");
  assert.match(branch, /jsonb_typeof\(p_value\) <> 'boolean'/);
  assert.doesNotMatch(branch, /p_source/);
});

test("unrelated mutation fields retain the legacy strict validator", () => {
  assert.match(
    migration,
    /perform public\.validate_company_data_change_value_strict_v1\(\s*p_key, p_value, p_source\s*\)/
  );
  assert.match(
    migration,
    /revoke all on function public\.validate_company_data_change_value_v1/
  );
});

test("direct E2E cleanup preserves the deleted-and-expired invariant", () => {
  assert.match(
    companySlackGmailE2e,
    /\.update\(\{ is_expired: true, status: "deleted", updated_at: now \}\)/
  );
});

test("ended and deleted internal roles record one terminal timestamp", () => {
  assert.match(
    terminalTimestampMigration,
    /v_new_status in \('ended', 'deleted'\)/
  );
  assert.match(
    terminalTimestampMigration,
    /v_old_status not in \('ended', 'deleted'\)[\s\S]*new\.expired_at := v_now/
  );
  assert.match(
    terminalTimestampMigration,
    /before update of status on public\.company_roles/
  );
  assert.match(
    terminalTimestampMigration,
    /role\.status, ''\)\)\) in \('ended', 'deleted'\)[\s\S]*role\.expired_at is null/
  );
});
