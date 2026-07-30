import assert from "node:assert/strict";
import test from "node:test";
import {
  getCompanyAuthEntryLabel,
  getCompanyBootstrapDisposition,
  inferCompanyAuthEntrySource,
  isCareerEmailOnboardingAuth,
  isTalentAuthDestination,
  normalizeCompanyAuthEntrySource,
  resolveAuthCallbackDestination,
  resolveAuthCallbackErrorDestination,
} from "./authPersona";

test("career destinations always use the talent persona", () => {
  assert.equal(
    isTalentAuthDestination({
      flow: "",
      nextPath: "/career/onboarding?step=profile",
    }),
    true
  );
  assert.equal(
    isTalentAuthDestination({
      flow: "talent_capture",
      nextPath: "/jobs/example",
    }),
    true
  );
});

test("company destinations do not become talent destinations", () => {
  assert.equal(
    isTalentAuthDestination({ flow: "", nextPath: "/search" }),
    false
  );
  assert.equal(
    isTalentAuthDestination({ flow: "", nextPath: "/" }),
    false
  );
});

test("email onboarding callbacks always resolve to career", () => {
  assert.equal(
    resolveAuthCallbackDestination({
      flow: "",
      rawNext: "/",
      source: "email_onboarding",
    }),
    "/career"
  );
  assert.equal(
    resolveAuthCallbackDestination({
      rawNext: "/career/email-onboarding?start=call",
      source: "email_onboarding_review",
    }),
    "/career"
  );
  assert.equal(
    resolveAuthCallbackDestination({
      rawNext: "//untrusted.example",
      emailOnboardingToken: "signed-token",
    }),
    "/career"
  );
  assert.equal(
    isCareerEmailOnboardingAuth({
      source: "email_onboarding_existing_user",
    }),
    true
  );
});

test("non-email-onboarding callbacks keep their requested destination", () => {
  assert.equal(
    resolveAuthCallbackDestination({
      rawNext: "/",
      source: "threads",
    }),
    "/"
  );
  assert.equal(
    resolveAuthCallbackDestination({
      flow: "talent_capture",
      rawNext: "",
    }),
    "/career"
  );
});

test("talent callback failures leave the callback instead of re-entering company auth", () => {
  assert.equal(
    resolveAuthCallbackErrorDestination({
      error: "talent_profile_upsert_failed",
      isTalentDestination: true,
    }),
    "/career?authError=talent_profile_upsert_failed"
  );
  assert.equal(
    resolveAuthCallbackErrorDestination({
      error: "no_user",
      isTalentDestination: false,
    }),
    "?error=no_user"
  );
});

test("company entry sources are inferred from the callback destination", () => {
  assert.equal(
    inferCompanyAuthEntrySource("/search?requestAccess=1"),
    "search"
  );
  assert.equal(inferCompanyAuthEntrySource("/org/example"), "org");
  assert.equal(inferCompanyAuthEntrySource("/unknown"), "auth_callback");
});

test("untrusted company entry sources fall back to auth callback", () => {
  assert.equal(normalizeCompanyAuthEntrySource("radar"), "radar");
  assert.equal(normalizeCompanyAuthEntrySource("career"), "auth_callback");
  assert.equal(normalizeCompanyAuthEntrySource(null), "auth_callback");
  assert.equal(getCompanyAuthEntryLabel("auth_callback"), "Company Auth");
});

test("company bootstrap never creates a company persona over a talent persona", () => {
  assert.equal(
    getCompanyBootstrapDisposition({
      hasCompanyUser: false,
      hasTalentUser: true,
    }),
    "existing_talent"
  );
  assert.equal(
    getCompanyBootstrapDisposition({
      hasCompanyUser: false,
      hasTalentUser: false,
    }),
    "create_company"
  );
});

test("legacy mixed personas keep their existing company access", () => {
  assert.equal(
    getCompanyBootstrapDisposition({
      hasCompanyUser: true,
      hasTalentUser: true,
    }),
    "existing_company"
  );
});
