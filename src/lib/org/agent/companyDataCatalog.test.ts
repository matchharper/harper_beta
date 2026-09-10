import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPANY_DATA_CATALOG,
  COMPANY_SIDE_LLM_DATA_KEYS,
} from "@/lib/org/agent/companyDataCatalog";
import { ORG_ROLE_MUTATION_STATUS_VALUES } from "@/lib/org/roleStatus";

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
    "salaryRange",
  ]) {
    assert.equal(exposed.includes(retained), true, retained);
  }
});

test("role compensation is a directly editable role field", () => {
  assert.equal(COMPANY_DATA_CATALOG.salaryRange.roleScoped, true);
  assert.equal(COMPANY_DATA_CATALOG.salaryRange.type, "text");
  assert.equal(COMPANY_DATA_CATALOG.salaryRange.maxLength, 1_000);
  assert.equal(
    (COMPANY_SIDE_LLM_DATA_KEYS as readonly string[]).includes("salaryRange"),
    true
  );
  for (const splitField of [
    "salaryMin",
    "salaryMax",
    "salaryCurrency",
    "salary_min",
    "salary_max",
    "salary_currency",
  ]) {
    assert.equal(
      (COMPANY_SIDE_LLM_DATA_KEYS as readonly string[]).includes(splitField),
      false,
      splitField
    );
  }
});

test("role status mutations share one application allowlist", () => {
  assert.deepEqual(
    COMPANY_DATA_CATALOG.role_status.allowedValues,
    ORG_ROLE_MUTATION_STATUS_VALUES
  );
  assert.equal(
    (COMPANY_SIDE_LLM_DATA_KEYS as readonly string[]).includes(
      "role_is_expired"
    ),
    false
  );
});
