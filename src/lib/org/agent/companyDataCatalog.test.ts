import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  COMPANY_DATA_KEYS,
  COMPANY_SIDE_LLM_DATA_KEYS,
} from "@/lib/org/agent/companyDataCatalog";

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
    assert.equal(
      (COMPANY_DATA_KEYS as readonly string[]).includes(siteOnly),
      false
    );
  }
});

test("company-side LLM consolidates descriptive fields and non-primary links", () => {
  const exposed = COMPANY_SIDE_LLM_DATA_KEYS as readonly string[];
  for (const removed of [
    "company_description",
    "short_description",
    "logo_url",
    "career_url",
    "funding_url",
    "specialities",
    "investors",
    "main_investors",
    "last_funding_round_description",
  ]) {
    assert.equal(exposed.includes(removed), false, removed);
  }
  for (const retained of [
    "pitch",
    "homepage_url",
    "linkedin_url",
    "related_links",
  ]) {
    assert.equal(exposed.includes(retained), true, retained);
  }
});
