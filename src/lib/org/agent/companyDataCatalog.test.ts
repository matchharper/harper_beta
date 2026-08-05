import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COMPANY_DATA_KEYS } from "@/lib/org/agent/companyDataCatalog";

test("TypeScript flat catalog matches the SQL mutation allowlist", () => {
  const sql = readFileSync(
    new URL(
      "../../../../supabase/migrations/20260805030000_company_data_changes_rpc.sql",
      import.meta.url
    ),
    "utf8"
  );
  for (const key of COMPANY_DATA_KEYS) {
    assert.match(sql, new RegExp(`when '${key}'`), `${key} missing from SQL`);
  }

  // These are deliberately available to trusted website adapters but never
  // appear in the company-side LLM schema.
  for (const siteOnly of ["role_is_expired", "role_source_type"]) {
    assert.match(sql, new RegExp(`when '${siteOnly}'`));
    assert.equal((COMPANY_DATA_KEYS as readonly string[]).includes(siteOnly), false);
  }
});
