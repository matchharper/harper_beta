import assert from "node:assert/strict";
import test from "node:test";

import { buildCareerConversationPromptPlan } from "./conversationPlan";
import {
  buildCareerPostOnboardingContextSection,
  buildCareerPostOnboardingConversationGuide,
  buildOnboardingCompletionHandoffInstruction,
} from "./postOnboardingGuide";

test("adds one shared post-onboarding guide only after onboarding", () => {
  const completedPlan = buildCareerConversationPromptPlan({
    channel: "chat",
    currentInsightContent: null,
    isOnboardingDone: true,
    profile: null,
    structuredProfileText: "",
    toolNames: [],
  });
  const activePlan = buildCareerConversationPromptPlan({
    channel: "chat",
    currentInsightContent: null,
    isOnboardingDone: false,
    profile: null,
    structuredProfileText: "",
    toolNames: [],
  });

  assert.ok(
    completedPlan.promptBlocks.some(
      (block) => block.key === "post_onboarding_conversation_guide"
    )
  );
  assert.equal(
    activePlan.promptBlocks.some(
      (block) => block.key === "post_onboarding_conversation_guide"
    ),
    false
  );
});

test("allows non-conversational completion artifacts to omit the guide", () => {
  const plan = buildCareerConversationPromptPlan({
    channel: "chat",
    currentInsightContent: null,
    includePostOnboardingConversationGuide: false,
    isOnboardingDone: true,
    profile: null,
    structuredProfileText: "",
    toolNames: [],
  });

  assert.equal(
    plan.promptBlocks.some(
      (block) => block.key === "post_onboarding_conversation_guide"
    ),
    false
  );
});

test("treats transition topics as choices rather than a required checklist", () => {
  const guide = buildCareerPostOnboardingConversationGuide({
    channel: "chat",
    preferredLocale: "ko",
  });

  assert.match(guide, /decision guide, not a checklist/i);
  assert.match(
    guide,
    /before the first opportunity run completes.*avoid calling recommend_job_postings/i
  );
  assert.match(guide, /choose at most one unresolved direction/i);
  assert.match(
    guide,
    /saved enabled\/default boolean.*not the candidate's answer/i
  );
  assert.match(
    guide,
    /assistant-authored statement.*not the candidate's answer/i
  );
  assert.match(guide, /never combine application-history.*profile-visibility/i);
  assert.match(guide, /Name both the supplied company and role/i);
  assert.match(guide, /\/career\/profile\?profileSection=links/);
  assert.match(guide, /recruiting\/application emails/);
});

test("binds an explicitly interested user to the verified active entry role", () => {
  const section = buildCareerPostOnboardingContextSection({
    context: {
      entryOpportunity: {
        companyName: "Acme",
        roleTitle: "Product Engineer",
        verifiedActiveRoleId: "role-123",
      },
    },
    toolNames: ["get_internal_roles", "internal_role_priority_review"],
  });

  assert.match(section, /Product Engineer/);
  assert.match(section, /role-123/);
  assert.match(section, /internal_role_priority_review/);
  assert.match(section, /Do not call get_internal_roles first/);
});

test("does not promise an exact direct connection without a verified role", () => {
  const section = buildCareerPostOnboardingContextSection({
    context: {
      entryOpportunity: {
        companyName: "Acme",
        roleTitle: "Product Engineer",
        verifiedActiveRoleId: null,
      },
    },
    toolNames: [],
  });

  assert.match(
    section,
    /do not promise that this exact role is directly connectable/i
  );
  assert.doesNotMatch(section, /action=register/);
});

test("completion handoff asks for one context-selected continuation", () => {
  const instruction = buildOnboardingCompletionHandoffInstruction("ko");

  assert.match(instruction, /Apply the Post-onboarding conversation guide now/);
  assert.match(instruction, /Ask at most one primary question/);
  assert.match(instruction, /entry opportunity normally takes priority/);
});
