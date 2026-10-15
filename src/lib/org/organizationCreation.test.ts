import assert from "node:assert/strict";
import test from "node:test";
import { companyHomepageInput } from "./signupServer";
import {
  canUseSignupWorkspace,
  isOrgOnboardingComplete,
  type WorkspaceSignupState,
} from "./signup";
import { getOrgOnboardingSteps } from "./onboarding";
import { buildOrgHref, buildOrgOrganizationCreationHref } from "./routes";

const state: WorkspaceSignupState = {
  source: "organization_add",
  createdBy: "creator",
  researchStatus: "idle",
  plan: "free",
};
test("company homepage uses a public company domain, independently of the user's email", () => {
  assert.deepEqual(companyHomepageInput("WWW.EXAMPLE.COM/about?from=org"), {
    domain: "example.com",
    homepageUrl: "https://www.example.com",
  });
  assert.deepEqual(companyHomepageInput("https://jobs.company.co.uk"), {
    domain: "company.co.uk",
    homepageUrl: "https://jobs.company.co.uk",
  });
  assert.equal(
    companyHomepageInput("https://myteam.github.io").domain,
    "myteam.github.io"
  );
  for (const value of [
    null,
    "",
    "http://localhost",
    "https://127.0.0.1",
    "http://[::1]",
    "https://example.com:444",
    "https://user:pass@example.com",
    "ftp://example.com",
    "javascript:alert(1)",
  ])
    assert.throws(() => companyHomepageInput(value), /signup_invalid_homepage/);
});
test("additional organization completion never uses a creator's prior personal onboarding", () => {
  const member = { onboardingCompletedAt: "2026-10-01T00:00:00Z" };
  assert.equal(isOrgOnboardingComplete(state, member, "creator"), false);
  assert.equal(
    isOrgOnboardingComplete(
      { ...state, onboardingCompletedAt: "2026-10-12T00:00:00Z" },
      member,
      "creator"
    ),
    true
  );
  assert.equal(isOrgOnboardingComplete(state, member, "teammate"), true);
  assert.equal(isOrgOnboardingComplete(null, member, "creator"), true);
  assert.equal(
    isOrgOnboardingComplete({ ...state, source: undefined }, member, "creator"),
    true
  );
});
test("paused signup permits only the additional organization's creator", () => {
  assert.equal(canUseSignupWorkspace(state, "creator", false), true);
  assert.equal(canUseSignupWorkspace(state, "teammate", false), false);
  assert.equal(
    canUseSignupWorkspace({ ...state, source: undefined }, "creator", false),
    false
  );
  assert.equal(
    canUseSignupWorkspace({ ...state, source: undefined }, "creator", true),
    true
  );
});
test("additional organization steps reuse company and Slack without profile, plan or invented roles", () => {
  assert.deepEqual(
    getOrgOnboardingSteps({
      showProfile: false,
      showCompanyDetails: true,
      showCompany: true,
      showSlack: true,
      showPlan: false,
      roles: [],
    }),
    ["company-details", "company", "slack", "guide", "done"]
  );
  assert.deepEqual(
    getOrgOnboardingSteps({
      showProfile: true,
      showCompanyDetails: true,
      showCompany: true,
      showSlack: false,
      roles: [],
    }),
    ["profile", "company-details", "company", "guide", "done"]
  );
});
test("organization creation and the existing Role creation route remain distinct", () => {
  assert.equal(
    buildOrgOrganizationCreationHref("source"),
    "/org/new?create=organization&orgId=source"
  );
  assert.equal(
    buildOrgHref({ orgId: "source", page: "new-role" }),
    "/org/new?orgId=source"
  );
});
