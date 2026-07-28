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

test("internal opportunity checked count includes viewed or feedback once", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-key";
  const { buildInternalOpportunityStats } =
    await import("@/lib/dailyUserStats");

  const stats = buildInternalOpportunityStats([
    { feedback: null, viewed_at: "2026-07-26T00:00:00.000Z" },
    { feedback: "like", viewed_at: null },
    { feedback: "dislike", viewed_at: "2026-07-26T00:01:00.000Z" },
    { feedback: null, viewed_at: null },
    { feedback: "unknown", viewed_at: null },
  ]);

  assert.deepEqual(stats, {
    acceptedCount: 1,
    checkedCount: 3,
    recommendationCount: 5,
    rejectedCount: 1,
  });
});

test("external dislike reason stats count objective choices per response", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-key";
  const {
    buildExternalNegativeFeedbackReasonStats,
    formatExternalNegativeFeedbackReasonStats,
  } = await import("@/lib/dailyUserStats");

  const stats = buildExternalNegativeFeedbackReasonStats({
    endDate: "2026-07-26",
    rows: [
      {
        feedback_reason: JSON.stringify({
          customReason: null,
          selectedOptions: [
            "역할이나 직무가 맞지 않아요",
            "회사 혹은 조건이 기준을 충족하지 못해요.",
          ],
        }),
      },
      {
        feedback_reason: JSON.stringify({
          customReason: "직접 입력",
          selectedOptions: [
            "역할이나 직무가 맞지 않아요",
            "역할이나 직무가 맞지 않아요",
            "other",
          ],
        }),
      },
      {
        feedback_reason:
          "만료된 공고에요. | 근무 조건이 맞지않아요(리모트, 위치 등)",
      },
      { feedback_reason: "직접 입력만 남긴 이전 데이터" },
      {
        feedback_reason: JSON.stringify({
          customReason: null,
          selectedOptions: [],
        }),
      },
    ],
    startDate: "2026-07-20",
  });

  assert.deepEqual(stats, {
    endDate: "2026-07-26",
    reasonSelectionResponseCount: 3,
    rows: [
      {
        count: 2,
        label: "역할이나 직무가 맞지 않아요",
        rate: 2 / 3,
      },
      {
        count: 1,
        label: "회사 혹은 조건이 기준을 충족하지 못해요",
        rate: 1 / 3,
      },
      {
        count: 0,
        label: "이미 지원했던 회사/역할입니다",
        rate: 0,
      },
      {
        count: 1,
        label: "만료된 공고에요",
        rate: 1 / 3,
      },
      {
        count: 1,
        label: "근무 조건이 맞지않아요(리모트, 위치 등)",
        rate: 1 / 3,
      },
      {
        count: 1,
        label: "기타 직접 입력",
        rate: 1 / 3,
      },
    ],
    startDate: "2026-07-20",
  });

  assert.equal(
    formatExternalNegativeFeedbackReasonStats(stats),
    [
      "*거절 사유*",
      "2026-07-20 ~ 2026-07-26 external 공고 dislike 중 객관식 선택 3건 기준 (복수 선택)",
      "- 역할이나 직무가 맞지 않아요: 2건 (66.7%)",
      "- 회사 혹은 조건이 기준을 충족하지 못해요: 1건 (33.3%)",
      "- 이미 지원했던 회사/역할입니다: 0건 (0.0%)",
      "- 만료된 공고에요: 1건 (33.3%)",
      "- 근무 조건이 맞지않아요(리모트, 위치 등): 1건 (33.3%)",
      "- 기타 직접 입력: 1건 (33.3%)",
    ].join("\n")
  );
});

test("external dislike reason stats format a one-day daily report window", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-key";
  const {
    buildExternalNegativeFeedbackReasonStats,
    formatExternalNegativeFeedbackReasonStats,
  } = await import("@/lib/dailyUserStats");

  const stats = buildExternalNegativeFeedbackReasonStats({
    endDate: "2026-07-27",
    rows: [],
    startDate: "2026-07-27",
  });

  assert.match(
    formatExternalNegativeFeedbackReasonStats(stats),
    /2026-07-27 ~ 2026-07-27 external 공고 dislike/
  );
});
