import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260908180000_org_agent_role_salary_range.sql",
  "utf8"
);
const catalog = readFileSync("src/lib/org/agent/companyDataCatalog.ts", "utf8");
const context = readFileSync("src/lib/org/agent/context.ts", "utf8");
const executor = readFileSync("src/lib/org/agent/toolExecution.ts", "utf8");
const promptFormat = readFileSync("src/lib/org/agent/promptFormat.ts", "utf8");
const roleCreationTools = readFileSync(
  "src/lib/org/agent/roleCreationTools.ts",
  "utf8"
);
const tools = readFileSync("src/lib/org/agent/tools.ts", "utf8");

test("Role salary range joins the optimistic atomic company-data contract", () => {
  assert.match(migration, /apply_company_data_changes_with_role_salary_v1/);
  assert.match(migration, /'salaryRange'/);
  assert.match(migration, /salary_range = v_value_text/);
  assert.match(
    migration,
    /coalesce\(to_jsonb\(v_current\), 'null'::jsonb\) is distinct from v_expected/
  );
  assert.match(migration, /public\.apply_company_data_changes_v1\(/);
  assert.match(migration, /insert into public\.company_events/);
  assert.match(
    migration,
    /revoke all on function public\.apply_company_data_changes_with_role_salary_v1[\s\S]*grant execute[\s\S]*to service_role/
  );
  assert.match(
    executor,
    /change\.key === "salaryRange"[\s\S]*"apply_company_data_changes_with_role_salary_v1"/
  );
  assert.doesNotMatch(migration, /'role_salary_range'/);
});

test("company-side LLM reads and writes compensation only as salaryRange", () => {
  assert.match(catalog, /"salaryRange"/);
  assert.match(context, /"salaryRange"/);
  assert.match(promptFormat, /\["salaryRange", role\.salaryRange\]/);
  assert.match(roleCreationTools, /salaryRange:/);
  assert.match(tools, /compensation only through salaryRange/);
  for (const splitField of [
    "salaryMin",
    "salaryMax",
    "salaryCurrency",
    "salary_min",
    "salary_max",
    "salary_currency",
  ]) {
    const property = new RegExp(`["']${splitField}["']\\s*:`);
    assert.doesNotMatch(catalog, property);
    assert.doesNotMatch(roleCreationTools, property);
    assert.doesNotMatch(tools, property);
  }
});
