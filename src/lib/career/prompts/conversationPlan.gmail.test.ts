import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCareerConversationPromptPlan,
  buildGmailCapabilityPrompt,
  buildSavedGmailCareerHistoryPrompt,
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

test("guides chat to read saved Gmail history without claiming live inbox access", () => {
  const prompt = buildSavedGmailCareerHistoryPrompt({
    canReadDocument: true,
  });
  assert.match(prompt, /list_documents and then read_document/);
  assert.match(prompt, /saved snapshot, not proof of the current inbox state/);

  const plan = buildCareerConversationPromptPlan({
    channel: "chat",
    currentInsightContent: null,
    hasSavedGmailCareerHistory: true,
    isOnboardingDone: true,
    profile: null,
    structuredProfileText: "",
    toolNames: ["list_documents", "read_document"],
  });
  const block = plan.promptBlocks.find(
    (candidate) => candidate.key === "saved_gmail_career_history"
  );

  assert.ok(block);
  assert.equal(block.cacheable, undefined);
  assert.match(block.text, /user-editable Gmail career-history document/);
});

test("does not imply the saved Gmail document was read when tools are unavailable", () => {
  assert.match(
    buildSavedGmailCareerHistoryPrompt({ canReadDocument: false }),
    /document reading is not available in this turn/
  );
});
