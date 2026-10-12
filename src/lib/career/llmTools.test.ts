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

test("analysis tool is excluded from ordinary chat and voice", () => {
  for (const isOnboardingDone of [false, true]) {
    const chat = resolveCareerChatTools({ channel: "chat", isOnboardingDone, responseLocale: "ko" });
    assert.ok(!chat.toolNames.includes(TALENT_TOOL_NAMES.SIMULATE_APPLICATION));
  }
  assert.ok(!getCareerRealtimeToolCandidates("ko").some(tool => tool.name === TALENT_TOOL_NAMES.SIMULATE_APPLICATION));
});

test("application questions are mode-only and are an explicit yield boundary",()=>{
  const ordinary=resolveCareerChatTools({isOnboardingDone:true,channel:"chat"});
  assert.ok(!ordinary.toolNames.includes("ask_application_input"));
  assert.ok(!ordinary.toolNames.includes("apply_to_role"));
  const active=resolveCareerChatTools({isOnboardingDone:true,channel:"chat",simulationActive:true});
  assert.ok(active.toolNames.includes("ask_application_input"));
  assert.ok(active.toolNames.includes("apply_to_role"));
  assert.ok(active.stopAfterToolNames.includes("apply_to_role"));
  assert.ok(active.stopAfterToolNames.includes("ask_application_input"));
  assert.ok(!active.toolNames.includes("update_document"));
  assert.ok(!active.toolNames.includes("contact_company"));
});

test("Apply with Harper exposes resume generation alongside its dedicated question and apply tools", () => {
  const names = resolveCareerChatTools({isOnboardingDone:true, channel:"chat", simulationActive:true}).tools.map(t => t.function.name);
  for (const name of ["generate_resume", "read_document", "ask_application_input", "apply_to_role"]) assert.ok(names.includes(name), name);
});

test("application tools stay inside caller bounds and shared context tools remain available", () => {
  const base = {channel: "chat" as const, isOnboardingDone: true, simulationActive: true};
  assert.deepEqual(resolveCareerChatTools({...base, allowedToolNames: []}).toolNames, []);
  assert.deepEqual(resolveCareerChatTools({...base, allowedToolNames: ["read_document"]}).toolNames, ["read_document"]);
  const active = resolveCareerChatTools(base);
  for (const name of ["read_talent_context", "write_talent_context", "update_talent_profile"])
    assert.ok(active.toolNames.includes(name), name);
  assert.deepEqual(resolveCareerChatTools({...base,allowedToolNames:["ask_application_input"]}).stopAfterToolNames,["ask_application_input"]);
  for (const args of [{...base,channel:"voice" as const}, {...base,isOnboardingDone:false}]) {
    const names=resolveCareerChatTools(args).toolNames;
    for(const name of ["apply_to_role","ask_application_input","manage_simulation_session","simulate_application"]) assert.ok(!names.includes(name),name);
  }
});
