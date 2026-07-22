import assert from "node:assert/strict";
import test from "node:test";
import { buildReferralFunnelStats } from "@/lib/dailyUserStatsReferral";
import {
  buildTalentNetworkReferralVisitLogType,
  isTalentNetworkReferralVisitLogType,
} from "@/lib/talentNetworkReferralTracking";

test("referral visit log helpers recognize recorded visits", () => {
  const type = buildTalentNetworkReferralVisitLogType("referral-token");

  assert.equal(type, "talent_network_referral_visit:referral-token");
  assert.equal(isTalentNetworkReferralVisitLogType(type), true);
  assert.equal(isTalentNetworkReferralVisitLogType("new_visit:career"), false);
});

test("referral funnel dedupes visitors and uses visit-based nested rates", () => {
  const stats = buildReferralFunnelStats({
    emailOnboardingLeads: [],
    excludedEmailSet: new Set(),
    landingLoginLogs: [
      {
        created_at: "2026-07-22T00:05:00.000Z",
        local_id: "visitor-a",
        type: "login_email:a@example.com:career",
      },
      {
        created_at: "2026-07-22T00:06:00.000Z",
        local_id: "visitor-b",
        type: "login_email:b@example.com:career",
      },
    ],
    onboardingEvents: [
      {
        created_at: "2026-07-22T00:09:00.000Z",
        event_type: "onboarding_completed",
        talent_id: "user-a",
      },
    ],
    profileSubmitMessages: [
      {
        created_at: "2026-07-22T00:08:00.000Z",
        message_type: "profile_submit",
        user_id: "user-a",
      },
    ],
    referralVisitLogs: [
      {
        created_at: "2026-07-22T00:00:00.000Z",
        local_id: "visitor-a",
        type: buildTalentNetworkReferralVisitLogType("token-a"),
      },
      {
        created_at: "2026-07-22T00:01:00.000Z",
        local_id: "visitor-a",
        type: buildTalentNetworkReferralVisitLogType("token-a"),
      },
      {
        created_at: "2026-07-22T00:02:00.000Z",
        local_id: "visitor-b",
        type: buildTalentNetworkReferralVisitLogType("token-b"),
      },
    ],
    signupAndSubmitLogs: [],
    talentUsers: [
      {
        created_at: "2026-07-22T00:05:00.000Z",
        email: "a@example.com",
        user_id: "user-a",
      },
      {
        created_at: "2026-07-22T00:06:00.000Z",
        email: "b@example.com",
        user_id: "user-b",
      },
    ],
  });

  assert.deepEqual(stats, {
    onboardingCompletedCount: 1,
    onboardingCompletedRateFromVisit: 0.5,
    signupCount: 2,
    signupRateFromVisit: 1,
    submittedCount: 1,
    submittedRateFromVisit: 0.5,
    visitCount: 2,
  });
});
