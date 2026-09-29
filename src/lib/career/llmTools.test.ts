import assert from "node:assert/strict";
import test from "node:test";

import {
  CAREER_REALTIME_VOICE_POST_ONBOARDING_TOOL_NAMES,
  getCareerRealtimeToolCandidates,
  resolveCareerChatTools,
} from "./llmTools";
import {
  executeTalentTool,
  TALENT_TOOL_NAMES,
} from "@/lib/talentOnboarding/tools";

test("post-onboarding voice can apply confirmed recommendation settings", () => {
  assert.ok(
    CAREER_REALTIME_VOICE_POST_ONBOARDING_TOOL_NAMES.includes(
      TALENT_TOOL_NAMES.UPDATE_SETTING
    )
  );
  assert.ok(
    CAREER_REALTIME_VOICE_POST_ONBOARDING_TOOL_NAMES.includes(
      TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE
    )
  );

  const names = getCareerRealtimeToolCandidates("ko").map((tool) => tool.name);
  assert.ok(names.includes(TALENT_TOOL_NAMES.UPDATE_SETTING));
  assert.ok(names.includes(TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE));
});

test("exposes coaching lifecycle only in the conversations that can use it", () => {
  const onboardingChat = resolveCareerChatTools({
    channel: "chat",
    isOnboardingDone: false,
    responseLocale: "ko",
  });
  const postOnboardingChat = resolveCareerChatTools({
    channel: "chat",
    isOnboardingDone: true,
    responseLocale: "ko",
  });
  const ordinaryVoice = getCareerRealtimeToolCandidates("ko");
  const coachingVoice = getCareerRealtimeToolCandidates("ko", {
    includeCareerCoachingActivity: true,
  });
  const lifecycleTool = postOnboardingChat.tools.find(
    (tool) =>
      tool.function.name === TALENT_TOOL_NAMES.MANAGE_CAREER_COACHING_ACTIVITY
  );
  const lifecycleProperties = lifecycleTool?.function.parameters.properties as
    | Record<string, { enum?: number[] }>
    | undefined;

  assert.ok(
    !onboardingChat.toolNames.includes(
      TALENT_TOOL_NAMES.MANAGE_CAREER_COACHING_ACTIVITY
    )
  );
  assert.ok(
    postOnboardingChat.toolNames.includes(
      TALENT_TOOL_NAMES.MANAGE_CAREER_COACHING_ACTIVITY
    )
  );
  assert.ok(
    !ordinaryVoice.some(
      (tool) => tool.name === TALENT_TOOL_NAMES.MANAGE_CAREER_COACHING_ACTIVITY
    )
  );
  assert.ok(
    coachingVoice.some(
      (tool) => tool.name === TALENT_TOOL_NAMES.MANAGE_CAREER_COACHING_ACTIVITY
    )
  );
  assert.deepEqual(lifecycleProperties?.suggestedMinutes?.enum, [5, 10, 20]);
  assert.deepEqual(lifecycleProperties?.plannedMinutes?.enum, [5, 10, 20]);
});

test("exposes the input-free coaching list after onboarding as plain text", async () => {
  const onboardingChat = resolveCareerChatTools({
    channel: "chat",
    isOnboardingDone: false,
    responseLocale: "ko",
  });
  const postOnboardingChat = resolveCareerChatTools({
    channel: "chat",
    isOnboardingDone: true,
    responseLocale: "ko",
  });
  const tool = postOnboardingChat.tools.find(
    (candidate) =>
      candidate.function.name === TALENT_TOOL_NAMES.READ_CAREER_COACHING_LIST
  );

  assert.ok(
    !onboardingChat.toolNames.includes(
      TALENT_TOOL_NAMES.READ_CAREER_COACHING_LIST
    )
  );
  assert.ok(tool);
  assert.deepEqual(tool.function.parameters, {
    type: "object",
    properties: {},
    additionalProperties: false,
  });

  const result = await executeTalentTool({
    channel: "chat",
    context: { responseLocale: "ko" },
    input: {},
    logging: false,
    name: TALENT_TOOL_NAMES.READ_CAREER_COACHING_LIST,
  });
  const text = String(result.modelOutput ?? "");

  assert.equal((text.match(/^- \*\*/gm) ?? []).length, 20);
  assert.match(text, /면접 연습과 스토리텔링/);
  assert.match(text, /연봉 협상 연습하기/);
});
