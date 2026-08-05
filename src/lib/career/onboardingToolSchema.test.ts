import assert from "node:assert/strict";
import test from "node:test";

import { scopeCareerChatToolForOnboarding } from "./onboardingToolSchema";

const updateTalentProfileTool = {
  type: "function" as const,
  function: {
    name: "update_talent_profile",
    description: "Update the talent profile.",
    parameters: {
      type: "object",
      properties: {
        talentUser: { type: "object" },
        rowMemos: { type: "array" },
        talentInsights: {
          type: "object",
          properties: {
            content: { type: "object" },
            changeSummary: { type: "string" },
          },
        },
      },
    },
  },
};

test("omits talentInsights from update_talent_profile during onboarding", () => {
  const scopedTool = scopeCareerChatToolForOnboarding(
    updateTalentProfileTool,
    true
  );
  const properties = scopedTool.function.parameters.properties;

  assert.ok("talentUser" in properties);
  assert.ok("rowMemos" in properties);
  assert.equal("talentInsights" in properties, false);
  assert.doesNotMatch(
    scopedTool.function.description,
    /talentInsights|matching/i
  );
});

test("keeps talentInsights in update_talent_profile after onboarding", () => {
  const scopedTool = scopeCareerChatToolForOnboarding(
    updateTalentProfileTool,
    false
  );

  assert.equal(scopedTool, updateTalentProfileTool);
  assert.ok("talentInsights" in scopedTool.function.parameters.properties);
});
