import assert from "node:assert/strict";
import test from "node:test";

import { buildCareerConversationPromptPlan } from "./conversationPlan";
import { buildCareerToolPolicyPrompt } from "./toolPolicyPrompt";

function renderPlan(channel: "chat" | "voice", toolNames: string[]) {
  return buildCareerConversationPromptPlan({
    channel,
    currentPreferences: { preferredLocale: "ko" },
    isOnboardingDone: true,
    profile: null,
    structuredProfileText: "",
    talentContextSection: "",
    toolNames,
  })
    .promptBlocks.map((block) => block.text)
    .join("\n");
}

test("chat saves a lasting language request and follows a one-off request", () => {
  const rendered = renderPlan("chat", ["update_language_setting", "web_search"]);

  assert.match(rendered, /The language rule under "What Harper does" is the only exception/);
  assert.match(rendered, /앞으로 영어로 해줘.*update_language_setting으로 저장한다/);
  assert.match(rendered, /이번 답만 원하면 저장하지 않고 이번 답만 그 언어로 쓴다/);
  assert.match(rendered, /자신의 언어 실력을 말한 것.*요청이 아니다/);
  assert.doesNotMatch(rendered, /Language Settings에서 유저가 직접 수정해야한다/);
  assert.doesNotMatch(rendered, /\{language_setting_rule\}/);
});

test("voice has no language tool and keeps the settings-screen guidance", () => {
  const rendered = renderPlan("voice", ["update_talent_profile"]);

  assert.match(rendered, /Language Settings에서 유저가 직접 수정해야한다/);
  assert.doesNotMatch(rendered, /update_language_setting으로 저장한다/);
});

test("chat tool policy lets only an explicit request change the reply language", () => {
  const policy = buildCareerToolPolicyPrompt({
    channel: "chat",
    preferredLocale: "ko",
    toolNames: ["update_language_setting", "web_search"],
  });

  assert.match(policy, /Write the entire final response consistently in Korean/);
  assert.match(policy, /Only an explicit language request from the user changes this/);
});
