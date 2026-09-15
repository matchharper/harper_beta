import assert from "node:assert/strict";
import test from "node:test";

import { buildCareerConversationPromptPlan } from "./conversationPlan";

test("tells the career LLM which local timezone labels use and not to echo them", () => {
  const plan = buildCareerConversationPromptPlan({
    channel: "chat",
    currentPreferences: { preferredLocale: "en" },
    isOnboardingDone: true,
    profile: null,
    structuredProfileText: "",
    talentContextSection: "",
    timeZone: "America/New_York",
  });
  const rendered = plan.promptBlocks.map((block) => block.text).join("\n");

  assert.match(rendered, /현재 접속.*America\/New_York/);
  assert.match(rendered, /Do not begin a reply with a timestamp/);
  assert.doesNotMatch(rendered, /한국 시간\(UTC\+9\) 기준/);
});
