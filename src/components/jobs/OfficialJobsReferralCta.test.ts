import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveOfficialJobsReferralCtaLabel,
  resolveOfficialJobsReferralCtaMode,
} from "@/lib/officialJobs/referralCta";

test("links signed-out visitors to the referral page", () => {
  assert.equal(
    resolveOfficialJobsReferralCtaMode({
      authLoading: false,
      hasDirectReferralToken: false,
      hasUser: false,
    }),
    "link"
  );
});

test("copies a referral link for signed-in visitors", () => {
  assert.equal(
    resolveOfficialJobsReferralCtaMode({
      authLoading: false,
      hasDirectReferralToken: false,
      hasUser: true,
    }),
    "copy"
  );
});

test("waits for authentication before choosing an action", () => {
  assert.equal(
    resolveOfficialJobsReferralCtaMode({
      authLoading: true,
      hasDirectReferralToken: false,
      hasUser: false,
    }),
    "loading"
  );
});

test("hides the CTA only when the current URL directly contains a referral token", () => {
  assert.equal(
    resolveOfficialJobsReferralCtaMode({
      authLoading: false,
      hasDirectReferralToken: true,
      hasUser: false,
    }),
    "hidden"
  );
  assert.equal(
    resolveOfficialJobsReferralCtaMode({
      authLoading: false,
      hasDirectReferralToken: false,
      hasUser: false,
    }),
    "link"
  );
});

test("shows a temporary success label after copying", () => {
  assert.equal(resolveOfficialJobsReferralCtaLabel(false), "Refer & Earn");
  assert.equal(resolveOfficialJobsReferralCtaLabel(true), "Copied");
});
