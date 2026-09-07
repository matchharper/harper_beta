import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExtractionInsightChecklistSection,
  buildOnboardingRuntimeStateSection,
  buildOptionalFollowUpOpportunitiesSection,
} from "./conversationSections";

test("offers optional waiting-period guidance while the conversation-completed run is active", () => {
  const section = buildOptionalFollowUpOpportunitiesSection({
    activeInternalFitHoldQuestion: null,
    canRecordInternalFitHoldQuestion: false,
    isConversationCompletedOpportunityRunActive: true,
    isOnboardingActive: false,
    profile: { resume_file_name: "resume.pdf" },
  });

  assert.match(
    section,
    /initial post-onboarding opportunity search is running/
  );
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
    isConversationCompletedOpportunityRunActive: true,
    isOnboardingActive: true,
    profile: null,
  });

  assert.equal(section, "");
});

test("does not turn missing legacy insight slots into post-onboarding questions", () => {
  const section = buildOptionalFollowUpOpportunitiesSection({
    activeInternalFitHoldQuestion: null,
    canRecordInternalFitHoldQuestion: false,
    isConversationCompletedOpportunityRunActive: false,
    isOnboardingActive: false,
    profile: { resume_file_name: "resume.pdf" },
  });

  assert.doesNotMatch(
    section,
    /Common Search Brief topics|english proficiency/
  );
});

test("keeps saved Brief content out of onboarding checklist metadata", () => {
  const runtimeSection = buildOnboardingRuntimeStateSection({
    checklistCoverage: { location: "covered" },
  });
  const extractionSection = buildExtractionInsightChecklistSection({
    checklistCoverage: { location: "covered" },
  });

  assert.match(runtimeSection, /location[\s\S]*status: covered/);
  assert.doesNotMatch(runtimeSection, /current .* insight value/);
  assert.match(extractionSection, /Canonical insight fields/);
  assert.doesNotMatch(
    extractionSection,
    /current_value|current_location_value/
  );
});
