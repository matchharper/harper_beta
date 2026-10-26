import assert from "node:assert/strict";
import test from "node:test";

import {
  CAREER_REALTIME_VOICE_POST_ONBOARDING_TOOL_NAMES,
  getCareerRealtimeToolCandidates,
  resolveCareerChatTools,
  canStartApplication,
} from "./llmTools";
import {
  executeTalentTool,
  TALENT_TOOL_NAMES,
} from "@/lib/talentOnboarding/tools";

test("authoring tools are eligible in ordinary chat and application research stays inside the mode", () => {
  const ordinary = resolveCareerChatTools({
    isOnboardingDone: true,
    channel: "chat",
  });
  for (const name of [
    "save_job_posting",
    "write_document",
    "update_talent_profile",
  ])
    assert.ok(ordinary.toolNames.includes(name));
  const application = resolveCareerChatTools({
    isOnboardingDone: true,
    channel: "chat",
    simulationActive: true,
    simulationPreparation: true,
  });
  for (const name of ["web_search", "open_url", "write_document"])
    assert.ok(application.toolNames.includes(name));
  assert.ok(!application.toolNames.includes("save_job_posting"));
  const bounded = resolveCareerChatTools({
    isOnboardingDone: true,
    channel: "chat",
    simulationActive: true,
    allowedToolNames: ["read_document"],
  });
  assert.deepEqual(bounded.toolNames, ["read_document"]);
});

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

test("start-card tool is available after onboarding in text chat only", () => {
  for (const isOnboardingDone of [false, true]) {
    const chat = resolveCareerChatTools({ channel: "chat", isOnboardingDone, responseLocale: "ko" });
    assert.equal(chat.toolNames.includes(TALENT_TOOL_NAMES.SIMULATE_APPLICATION),isOnboardingDone);
  }
  assert.ok(!getCareerRealtimeToolCandidates("ko").some(tool => tool.name === TALENT_TOOL_NAMES.SIMULATE_APPLICATION));
});

test("application questions are mode-only and are an explicit yield boundary",()=>{
  const ordinary=resolveCareerChatTools({isOnboardingDone:true,channel:"chat"});
  assert.ok(!ordinary.toolNames.includes("manage_application_suggestions"));
  assert.ok(!ordinary.toolNames.includes("apply_for_role"));
  const active=resolveCareerChatTools({isOnboardingDone:true,channel:"chat",simulationActive:true});
  assert.ok(active.toolNames.includes("manage_application_suggestions"));
  assert.ok(active.toolNames.includes("apply_for_role"));
  assert.ok(active.stopAfterToolNames.includes("apply_for_role"));
  assert.ok(!active.stopAfterToolNames.includes("manage_application_suggestions"));
  assert.ok(active.toolNames.includes("ready_for_role"));
  assert.ok(ordinary.toolNames.includes("simulate_application"));
  assert.ok(!active.toolNames.includes("simulate_application"));
  assert.ok(!active.toolNames.includes("update_document"));
  assert.ok(!active.toolNames.includes("contact_company"));
});

test("Apply with Harper uses one guarded resume writer and a compact lifecycle tool", () => {
  const names = resolveCareerChatTools({isOnboardingDone:true, channel:"chat", simulationActive:true}).tools.map(t => t.function.name);
  for (const name of ["ready_for_role", "read_document", "manage_application_suggestions", "apply_for_role"]) assert.ok(names.includes(name), name);
  assert.ok(!names.includes("generate_resume"));
  assert.ok(resolveCareerChatTools({isOnboardingDone:true,simulationActive:true,simulationPreparation:false}).toolNames.includes("generate_resume"));
});

test("application tools stay inside caller bounds and shared context tools remain available", () => {
  const base = {channel: "chat" as const, isOnboardingDone: true, simulationActive: true};
  assert.deepEqual(resolveCareerChatTools({...base, allowedToolNames: []}).toolNames, []);
  assert.deepEqual(resolveCareerChatTools({...base, allowedToolNames: ["read_document"]}).toolNames, ["read_document"]);
  const active = resolveCareerChatTools(base);
  for (const name of ["read_talent_context", "write_talent_context", "update_talent_profile"])
    assert.ok(active.toolNames.includes(name), name);
  assert.deepEqual(resolveCareerChatTools({...base,allowedToolNames:["manage_application_suggestions"]}).stopAfterToolNames,[]);
  for (const args of [{...base,channel:"voice" as const}, {...base,isOnboardingDone:false}]) {
    const names=resolveCareerChatTools(args).toolNames;
    for(const name of ["apply_for_role","manage_application_suggestions","manage_simulation_session","simulate_application"]) assert.ok(!names.includes(name),name);
  }
});

test("Start uses ordinary-chat authorization before switching into preparation tools",()=>{
  const allowed={isOnboardingDone:true,channel:"chat" as const};
  assert.equal(canStartApplication(allowed),true);
  assert.equal(canStartApplication({...allowed,simulationActive:true}),true);
  assert.equal(canStartApplication({...allowed,isOnboardingDone:false}),false);
  assert.equal(canStartApplication({...allowed,channel:"voice"}),false);
  assert.equal(canStartApplication({...allowed,allowedToolNames:[]}),false);
  assert.equal(canStartApplication({...allowed,allowedToolNames:["simulate_application"]}),true);
  assert.equal(canStartApplication({...allowed,allowedToolNames:["ready_for_role"]}),false);
});

test("saved application lifecycle is deferred in ordinary chat and uses the same tool name while active", async () => {
  const { resolveCareerCapabilities } = await import("./capabilities/resolver");
  const tools = resolveCareerChatTools({ channel: "chat", isOnboardingDone: true }).tools;
  const cold = resolveCareerCapabilities({ eligibleTools: tools, loaded: new Set(), mode: "progressive" });
  assert.ok(cold.catalogText.includes("list/resume saved preparations"));
  assert.ok(!cold.offeredNames.has("manage_simulation_session"));
  const loaded = resolveCareerCapabilities({ eligibleTools: tools, loaded: new Set(["application_support"]), mode: "progressive" });
  assert.ok(loaded.offeredNames.has("manage_simulation_session"));
  assert.ok(!loaded.offeredNames.has("apply_for_role"));
  const active = resolveCareerChatTools({ channel: "chat", isOnboardingDone: true, simulationActive: true }).tools;
  assert.equal(active.filter(t => t.function.name === "manage_simulation_session").length, 1);
});
