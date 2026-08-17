import assert from "node:assert/strict";
import test from "node:test";
import type { DailyUserStatsReport } from "@/lib/dailyUserStats";
import { buildReferralFunnelStats } from "@/lib/dailyUserStatsReferral";
import {
  buildTalentNetworkReferralVisitLogType,
  isTalentNetworkReferralVisitLogType,
} from "@/lib/talentNetworkReferralTracking";

function makeDailyUserStatsReport(
  overrides: Partial<DailyUserStatsReport> = {}
): DailyUserStatsReport {
  return {
    activeTalentBreakdown: {
      callTranscriptTalentCount: 0,
      chatTalentCount: 0,
      clickedRecommendationTalentCount: 0,
      feedbackRecommendationTalentCount: 0,
      inboundEmailTalentCount: 0,
      loggedInTalentCount: 0,
      savedRecommendationTalentCount: 0,
      signupTalentCount: 0,
      viewedRecommendationTalentCount: 0,
    },
    activeTalentsCount: 0,
    accountDeletedCount: 0,
    callTranscriptMessageCount: 0,
    chatMessageCount: 0,
    chatUniqueTalentCount: 0,
    cumulativeTalentsCount: 0,
    date: "2026-07-28",
    dateLabel: "2026-07-28",
    endDateExclusive: "2026-07-29",
    endIso: "2026-07-28T15:00:00.000Z",
    externalNegativeFeedbackReasonStats: {
      endDate: "2026-07-28",
      reasonSelectionResponseCount: 0,
      rows: [],
      startDate: "2026-07-28",
    },
    failedToolCallCount: 0,
    harperMailReplyCount: 0,
    highIntentTalentsCount: 0,
    internalConnectionResponseStats: null,
    internalOpportunityRecommendationRows: [],
    internalOpportunityRolling7DayStats: {
      acceptedCount: 0,
      checkedCount: 0,
      recommendationCount: 0,
      rejectedCount: 0,
    },
    internalOpportunityStats: {
      acceptedCount: 0,
      checkedCount: 0,
      recommendationCount: 0,
      rejectedCount: 0,
    },
    internalRecommendationCount: 0,
    jobs: [],
    jobsSummary: {
      abtestRows: [],
      signupCount: 0,
      talkClickCount: 0,
      viewCount: 0,
      viewedJobCount: 0,
    },
    landingAbtestRows: [],
    mailReplyCount: 0,
    mailSentCount: 0,
    negativeFeedbackClickedCount: 0,
    negativeFeedbackCount: 0,
    newSignupFourPlusChatDropoffCount: 0,
    newSignupOnboardingCompletedCount: 0,
    newSignupSubmittedCount: 0,
    newVisitorCount: 0,
    onboardingCompletedCount: 0,
    onboardingCompletedNoEmailUserCount: 0,
    onboardingCompletedNoRecommendationInternalOnlyUserCount: 0,
    onboardingCompletedNoRecommendationUserCount: 0,
    opportunityDiscoveryFailedRunCount: 0,
    periodicRecommendationMailUserCount: 0,
    period: "daily",
    positiveFeedbackCount: 0,
    recommendationCount: 0,
    referralFunnelStats: {
      onboardingCompletedCount: 0,
      onboardingCompletedRateFromVisit: null,
      signupCount: 0,
      signupRateFromVisit: null,
      submittedCount: 0,
      submittedRateFromVisit: null,
      visitCount: 0,
    },
    returningOnboardingCompletedCount: 0,
    returningSubmittedCount: 0,
    signupCount: 0,
    startDate: "2026-07-28",
    startIso: "2026-07-27T15:00:00.000Z",
    submittedCount: 0,
    toolFailureRate: null,
    tools: [],
    userMessageCount: 0,
    userMessageUniqueTalentCount: 0,
    viewedRecommendationCount: 0,
    ...overrides,
  };
}

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

test("daily Slack stats compare counts by percent and rates by percentage point", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-key";
  const { formatDailyUserStatsSlackMessages } =
    await import("@/lib/dailyUserStats");

  const previousReport = makeDailyUserStatsReport({
    accountDeletedCount: 1,
    date: "2026-07-27",
    dateLabel: "2026-07-27",
    endDateExclusive: "2026-07-28",
    endIso: "2026-07-27T15:00:00.000Z",
    internalOpportunityStats: {
      acceptedCount: 8,
      checkedCount: 11,
      recommendationCount: 17,
      rejectedCount: 0,
    },
    newSignupSubmittedCount: 87,
    newVisitorCount: 370,
    onboardingCompletedNoEmailUserCount: 8,
    onboardingCompletedNoRecommendationInternalOnlyUserCount: 1,
    onboardingCompletedNoRecommendationUserCount: 16,
    opportunityDiscoveryFailedRunCount: 19,
    recommendationCount: 1399,
    signupCount: 109,
    startDate: "2026-07-27",
    startIso: "2026-07-26T15:00:00.000Z",
    viewedRecommendationCount: 352,
  });
  const report = makeDailyUserStatsReport({
    accountDeletedCount: 0,
    internalOpportunityStats: {
      acceptedCount: 2,
      checkedCount: 4,
      recommendationCount: 14,
      rejectedCount: 1,
    },
    newSignupSubmittedCount: 103,
    newVisitorCount: 446,
    onboardingCompletedNoEmailUserCount: 10,
    onboardingCompletedNoRecommendationInternalOnlyUserCount: 3,
    onboardingCompletedNoRecommendationUserCount: 20,
    opportunityDiscoveryFailedRunCount: 12,
    recommendationCount: 1578,
    signupCount: 131,
    viewedRecommendationCount: 345,
  });

  const { main } = formatDailyUserStatsSlackMessages(report, previousReport);

  assert.match(main, /신규 가입: 131명\(\+20\.2%\)/);
  assert.match(
    main,
    /신규 방문자 수: 446명\(\+20\.5%\), 회원가입 전환율: 29\.4% \(-0\.1%p\)/
  );
  assert.match(
    main,
    /신규 가입자 중 제출 완료: 103명\(\+18\.4%\), 가입 대비 78\.6% \(-1\.2%p\)/
  );
  assert.match(main, /회원 탈퇴: 0명\(-100\.0%\)/);
  assert.match(main, /열람\(확인\): 345개\(-2\.0%\), 21\.9% \(-3\.3%p\)/);
  assert.match(main, /거절: 1개\(신규\), 전체 추천 대비 7\.1% \(\+7\.1%p\)/);
  assert.match(main, /opportunity_discovery_run failed 종료: 12개\(-36\.8%\)/);
  assert.match(
    main,
    /기간 내 온보딩 완료 후 1시간\+ 추천 0개인 유저 수: 20명 \(내부 기회만 요청: 3명\), 메일을 받지 못한 유저 수: 10명/
  );
  assert.doesNotMatch(
    main,
    /기간 내 온보딩 완료 후 1시간\+ 추천 0개인 유저 수:.*\(\+25\.0%\)/
  );
});

test("daily Slack stats show the current signup-flow allocation", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-key";
  const { formatDailyUserStatsSlackMessages } =
    await import("@/lib/dailyUserStats");

  const report = makeDailyUserStatsReport({
    landingAbtestRows: [
      {
        abtestType: "career_signup_flow_v1_email_first",
        entryCount: 0,
        label: "Email first",
        onboardingCompletedCount: 0,
        onboardingCompletedRateFromEntry: null,
        signupSubmittedCount: 0,
        signupSubmittedRateFromEntry: null,
      },
      {
        abtestType: "career_signup_flow_v1_control",
        entryCount: 10,
        label: "Login first",
        onboardingCompletedCount: 1,
        onboardingCompletedRateFromEntry: 0.1,
        signupSubmittedCount: 2,
        signupSubmittedRateFromEntry: 0.2,
      },
    ],
  });

  const { details } = formatDailyUserStatsSlackMessages(report);

  assert.match(
    details,
    /현재 배정 비율: Email first 0% \/ Login first 100%/
  );
});

test("weekly Slack stats compare against the previous week", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-key";
  const { formatDailyUserStatsSlackMessages } =
    await import("@/lib/dailyUserStats");

  const previousReport = makeDailyUserStatsReport({
    date: "2026-07-13",
    dateLabel: "2026-07-13 ~ 2026-07-19",
    newVisitorCount: 400,
    onboardingCompletedNoEmailUserCount: 9,
    onboardingCompletedNoRecommendationInternalOnlyUserCount: 2,
    onboardingCompletedNoRecommendationUserCount: 12,
    period: "weekly",
    returningSubmittedCount: 10,
    signupCount: 100,
  });
  const report = makeDailyUserStatsReport({
    date: "2026-07-20",
    dateLabel: "2026-07-20 ~ 2026-07-26",
    newVisitorCount: 500,
    onboardingCompletedNoEmailUserCount: 10,
    onboardingCompletedNoRecommendationInternalOnlyUserCount: 3,
    onboardingCompletedNoRecommendationUserCount: 20,
    period: "weekly",
    returningSubmittedCount: 15,
    signupCount: 150,
  });

  const { main } = formatDailyUserStatsSlackMessages(report, previousReport);

  assert.match(main, /^🌔 \[Weekly User Stats\] 2026-07-20 ~ 2026-07-26/);
  assert.match(main, /신규 가입: 150명\(\+50\.0%\)/);
  assert.match(
    main,
    /신규 방문자 수: 500명\(\+25\.0%\), 회원가입 전환율: 30\.0% \(\+5\.0%p\)/
  );
  assert.match(
    main,
    /기간 내 신규 가입은 아니지만 다시 들어와서 제출 완료한 사람: 15명\(\+50\.0%\)/
  );
  assert.match(
    main,
    /기간 내 온보딩 완료 후 1시간\+ 추천 0개인 유저 수: 20명 \(내부 기회만 요청: 3명\), 메일을 받지 못한 유저 수: 10명/
  );
});

test("onboarding delivery gaps separate internal-only and missing-email users", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-key";
  const { buildOnboardingDeliveryGapStats } =
    await import("@/lib/dailyUserStats");

  const stats = buildOnboardingDeliveryGapStats({
    eligibleUserIds: ["a", "b", "c", "d"],
    recommendationEmailUserIds: new Set(["b", "c"]),
    recommendationUserIds: new Set(["b"]),
    settings: [
      {
        get_external_recommendation: false,
        profile_visibility: "exceptional_only",
        user_id: "a",
      },
      {
        get_external_recommendation: true,
        profile_visibility: "dont_share",
        user_id: "d",
      },
    ],
  });

  assert.deepEqual(stats, {
    internalOnlyUserCount: 2,
    noEmailUserCount: 2,
    noRecommendationUserCount: 3,
  });
});
