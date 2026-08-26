import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCareerConversationPromptPlan,
  buildGmailCapabilityPrompt,
} from "./conversationPlan";

test("renders all Gmail capability states truthfully", () => {
  assert.match(
    buildGmailCapabilityPrompt("available"),
    /until the tool returns successfully with status=ok/
  );
  assert.match(
    buildGmailCapabilityPrompt("connected_but_unavailable_this_turn"),
    /not available in this turn/
  );
  assert.match(
    buildGmailCapabilityPrompt("not_connected"),
    /Profile → Resume & Links → Gmail Connect/
  );
});

test("keeps the per-turn Gmail capability block non-cacheable", () => {
  const plan = buildCareerConversationPromptPlan({
    channel: "chat",
    currentInsightContent: null,
    gmailCapability: "available",
    isOnboardingDone: true,
    profile: null,
    structuredProfileText: "",
    toolNames: ["search_connected_gmail"],
  });
  const block = plan.promptBlocks.find(
    (candidate) => candidate.key === "gmail_capability"
  );

  assert.ok(block);
  assert.equal(block.cacheable, undefined);
  assert.match(block.text, /status=ok/);
});
