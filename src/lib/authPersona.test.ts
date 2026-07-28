import assert from "node:assert/strict";
import test from "node:test";
import {
  getCompanyAuthEntryLabel,
  getCompanyBootstrapDisposition,
  inferCompanyAuthEntrySource,
  isTalentAuthDestination,
  normalizeCompanyAuthEntrySource,
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
    isTalentAuthDestination({ flow: "", nextPath: "/invitation" }),
    false
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
  assert.equal(getCompanyAuthEntryLabel("invitation"), "Invitation");
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
