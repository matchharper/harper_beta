import assert from "node:assert/strict";
import test from "node:test";
import { companyIntroRoleIsAvailable } from "./companyIntroRoleAvailability";
test("historical visibility preserves expired roles without allowing new actions or fixture leakage", () => {
  const role = { source_type: "internal", company_internal_roles: {}, status: "closed", is_expired: true, information: {} };
  assert.equal(companyIntroRoleIsAvailable(role, "person"), false);
  assert.equal(companyIntroRoleIsAvailable(role, "person", true), true);
  assert.equal(companyIntroRoleIsAvailable({ ...role, information: { testOnly: true, testTalentIds: ["fixture"] } }, "person", true), false);
  assert.equal(companyIntroRoleIsAvailable({ ...role, information: { testOnly: true, testTalentIds: ["fixture"] } }, "fixture", true), true);
});
