import assert from "node:assert/strict";
import test from "node:test";
import { companyIntroRoleIsAvailable } from "./companyIntroRoleAvailability";

const role = {
  source_type: "internal", status: "active", is_expired: false,
  expires_at: null,
  information: { testOnly: true, testFixture: "company-intro-search-setting-v1", testTalentIds: ["fixture-talent"] },
  company_internal_roles: { is_company_first_search: false },
};
const available = (overrides = {}, talentId = "fixture-talent") =>
  companyIntroRoleIsAvailable({ ...role, ...overrides } as any, talentId);

test("existing company-first cards stay available when periodic search is off", () => {
  assert.equal(available(), true);
  assert.equal(available({ company_internal_roles: [{ is_company_first_search: false }] }), true);
  assert.equal(available({ company_internal_roles: { is_company_first_search: true } }), true);
  assert.equal(available({ status: "paused" }), true);
});

test("search opt-out does not weaken existing lifecycle or fixture guards", () => {
  for (const overrides of [
    { status: "ended" }, { status: "deleted" }, { is_expired: true },
    { expires_at: "2020-01-01T00:00:00Z" }, { source_type: "external" },
    { company_internal_roles: null }, { company_internal_roles: [] },
  ]) assert.equal(available(overrides), false);
  assert.equal(available({}, "ordinary-talent"), false);
});
