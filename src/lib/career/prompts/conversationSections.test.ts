import assert from "node:assert/strict";
import test from "node:test";

import {
  buildKnownFutureMatchingInsightsSection,
  buildOptionalFollowUpOpportunitiesSection,
} from "./conversationSections";

test("renders only saved keyed Brief compatibility values", () => {
  const section = buildKnownFutureMatchingInsightsSection({
    content: {
      external_delivery_selectivity:
        "확실히 잘 맞는 외부 기회만 선별해서 추천받고 싶어합니다.",
      next_scope: "다음 역할로 제품 리더십 범위를 넓히고 싶어합니다.",
    },
    quoteKeys: true,
  });

  assert.doesNotMatch(section, /external_delivery_selectivity : empty/);
  assert.doesNotMatch(section, /matching_preference : empty/);
  assert.match(section, /Search Brief/);
});

test("does not add schema-specific suggestion slots", () => {
  const section = buildKnownFutureMatchingInsightsSection({
    content: {
      external_delivery_selectivity:
        "확실히 잘 맞는 외부 기회만 선별해서 추천받고 싶어합니다.",
      matching_preference:
        "제품 책임 범위가 넓은 역할을 추천에 반영해주길 원합니다.",
    },
  });

  assert.doesNotMatch(section, /## Good to remember insights|: empty/);
});

test("offers optional waiting-period guidance while the conversation-completed run is active", () => {
  const section = buildOptionalFollowUpOpportunitiesSection({
    activeInternalFitHoldQuestion: null,
    canRecordInternalFitHoldQuestion: false,
    currentInsightContent: {},
    isConversationCompletedOpportunityRunActive: true,
    isOnboardingActive: false,
    profile: { resume_file_name: "resume.pdf" },
  });

  assert.match(section, /initial post-onboarding opportunity search is running/);
  assert.match(section, /even if it produces no opportunity/);
  assert.match(section, /sends no recommendation email/);
  assert.match(section, /Settings tab/);
  assert.match(section, /KRW 5,000,000–15,000,000/);
  assert.doesNotMatch(section, /Gmail/i);
});

test("removes waiting-period and referral guidance when the conversation-completed run ends", () => {
  const section = buildOptionalFollowUpOpportunitiesSection({
    activeInternalFitHoldQuestion: null,
    canRecordInternalFitHoldQuestion: false,
    currentInsightContent: {},
    isConversationCompletedOpportunityRunActive: false,
    isOnboardingActive: false,
    profile: { resume_file_name: "resume.pdf" },
  });

  assert.doesNotMatch(
    section,
    /initial post-onboarding opportunity search is running/
  );
  assert.doesNotMatch(section, /referral-program|KRW 5,000,000/i);
});

test("does not expose waiting-period guidance during onboarding", () => {
  const section = buildOptionalFollowUpOpportunitiesSection({
    activeInternalFitHoldQuestion: null,
    canRecordInternalFitHoldQuestion: false,
    currentInsightContent: {},
    isConversationCompletedOpportunityRunActive: true,
    isOnboardingActive: true,
    profile: null,
  });

  assert.equal(section, "");
});
