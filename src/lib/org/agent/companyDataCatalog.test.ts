import assert from "node:assert/strict";
import test from "node:test";
import { COMPANY_SIDE_LLM_DATA_KEYS } from "@/lib/org/agent/companyDataCatalog";

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
