import assert from "node:assert/strict";
import test from "node:test";
import {
  getAccountSubscriptionConfirmationKind,
  requiresAccountPauseConfirmation,
  resolveAccountSubscriptionUpdate,
  toAccountSubscriptionSettings,
} from "./accountSubscriptions";

test("confirmation copy follows the recommendation scope being turned off", () => {
  assert.equal(
    getAccountSubscriptionConfirmationKind({
      current: {
        getExternalRecommendation: true,
        harperEnabled: true,
      },
      next: {
        getExternalRecommendation: false,
        harperEnabled: true,
      },
    }),
    "stop_external"
  );
  assert.equal(
    getAccountSubscriptionConfirmationKind({
      current: {
        getExternalRecommendation: true,
        harperEnabled: true,
      },
      next: {
        getExternalRecommendation: false,
        harperEnabled: false,
      },
    }),
    "pause_all"
  );
  assert.equal(
    getAccountSubscriptionConfirmationKind({
      current: {
        getExternalRecommendation: false,
        harperEnabled: true,
      },
      next: {
        getExternalRecommendation: true,
        harperEnabled: true,
      },
    }),
    null
  );
});

test("confirmation is required only when both account settings are off", () => {
  assert.equal(
    requiresAccountPauseConfirmation({
      getExternalRecommendation: false,
      harperEnabled: false,
    }),
    true
  );
  assert.equal(
    requiresAccountPauseConfirmation({
      getExternalRecommendation: true,
      harperEnabled: false,
    }),
    false
  );
  assert.equal(
    requiresAccountPauseConfirmation({
      getExternalRecommendation: false,
      harperEnabled: true,
    }),
    false
  );
});

test("disabling Harper also disables external recommendations", () => {
  assert.deepEqual(
    resolveAccountSubscriptionUpdate({
      currentGetExternalRecommendation: true,
      currentProfileVisibility: "open_to_matches",
      getExternalRecommendation: true,
      harperEnabled: false,
    }),
    {
      getExternalRecommendation: false,
      profileVisibility: "dont_share",
    }
  );
});

test("re-enabling Harper resumes consent-first sharing and external recommendations", () => {
  assert.deepEqual(
    resolveAccountSubscriptionUpdate({
      currentGetExternalRecommendation: false,
      currentProfileVisibility: "dont_share",
      getExternalRecommendation: false,
      harperEnabled: true,
    }),
    {
      getExternalRecommendation: true,
      profileVisibility: "exceptional_only",
    }
  );
});

test("external recommendations can stay off while Harper remains enabled", () => {
  assert.deepEqual(
    resolveAccountSubscriptionUpdate({
      currentGetExternalRecommendation: true,
      currentProfileVisibility: "exceptional_only",
      getExternalRecommendation: false,
      harperEnabled: true,
    }),
    {
      getExternalRecommendation: false,
      profileVisibility: "exceptional_only",
    }
  );
});

test("the existing preferences flow can change external recommendations without changing profile visibility", () => {
  assert.deepEqual(
    resolveAccountSubscriptionUpdate({
      currentGetExternalRecommendation: true,
      currentProfileVisibility: "open_to_matches",
      getExternalRecommendation: false,
    }),
    {
      getExternalRecommendation: false,
      profileVisibility: "open_to_matches",
    }
  );
});

test("external recommendations can be enabled without changing dont-share visibility", () => {
  assert.deepEqual(
    resolveAccountSubscriptionUpdate({
      currentGetExternalRecommendation: false,
      currentProfileVisibility: "dont_share",
      getExternalRecommendation: true,
    }),
    {
      getExternalRecommendation: true,
      profileVisibility: "dont_share",
    }
  );
});

test("account settings present both stored values without masking either one", () => {
  assert.deepEqual(
    toAccountSubscriptionSettings({
      getExternalRecommendation: true,
      profileVisibility: "dont_share",
    }),
    {
      getExternalRecommendation: true,
      harperEnabled: false,
    }
  );
});
