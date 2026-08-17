import assert from "node:assert/strict";
import test from "node:test";
import {
  CAREER_EMAIL_ONBOARDING_VARIANT,
  CAREER_SIGNUP_FLOW_CONTROL_ABTEST_TYPE,
  CAREER_SIGNUP_FLOW_EMAIL_FIRST_ABTEST_TYPE,
  CAREER_SIGNUP_FLOW_EMAIL_FIRST_ALLOCATION_PERCENT,
  CAREER_WEB_ONBOARDING_VARIANT,
} from "@/lib/careerEmailOnboarding/constants";
import {
  getCareerSignupFlowAbtestType,
  resolveCareerOnboardingLandingVariant,
} from "@/lib/careerEmailOnboarding/experiment";

test("assigns all non-overridden signup-flow traffic to login-first", () => {
  assert.equal(CAREER_SIGNUP_FLOW_EMAIL_FIRST_ALLOCATION_PERCENT, 0);

  for (const localId of [
    "visitor-0",
    "visitor-1",
    "visitor-99",
    "another-random-visitor",
  ]) {
    assert.equal(
      resolveCareerOnboardingLandingVariant({ localId }),
      CAREER_WEB_ONBOARDING_VARIANT
    );
  }
});

test("keeps email-first query overrides active at zero allocation", () => {
  for (const override of ["email", "email_onboarding", "mail", " EMAIL "]) {
    assert.equal(
      resolveCareerOnboardingLandingVariant({
        localId: "forced-email-visitor",
        override,
      }),
      CAREER_EMAIL_ONBOARDING_VARIANT
    );
  }
});

test("keeps login-first query overrides active", () => {
  for (const override of ["web", "web_onboarding", "control", " WEB "]) {
    assert.equal(
      resolveCareerOnboardingLandingVariant({
        localId: "forced-web-visitor",
        override,
      }),
      CAREER_WEB_ONBOARDING_VARIANT
    );
  }
});

test("maps forced and default variants to their existing analytics types", () => {
  assert.equal(
    getCareerSignupFlowAbtestType(CAREER_EMAIL_ONBOARDING_VARIANT),
    CAREER_SIGNUP_FLOW_EMAIL_FIRST_ABTEST_TYPE
  );
  assert.equal(
    getCareerSignupFlowAbtestType(CAREER_WEB_ONBOARDING_VARIANT),
    CAREER_SIGNUP_FLOW_CONTROL_ABTEST_TYPE
  );
});
