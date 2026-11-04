import assert from "node:assert/strict";
import test from "node:test";
import { GMAIL_DISCONNECTED_TOOL_DESCRIPTION } from "./gmailToolSelection";

import {
  CAREER_REALTIME_VOICE_POST_ONBOARDING_TOOL_NAMES,
  getCareerRealtimeToolCandidates,
  resolveCareerChatTools,
} from "./llmTools";
import {
  executeTalentTool,
  TALENT_TOOL_NAMES,
} from "@/lib/talentOnboarding/tools";

test("appointments are available to post-onboarding chat, background work and voice", () => {
  for (const background of [false, true]) {
    const selection = resolveCareerChatTools({ channel: "chat", isOnboardingDone: true, background });
    for (const name of ["read_talent_schedules", "upsert_talent_schedules"])
      assert.ok(selection.toolNames.includes(name), name);
  }
  const voice = getCareerRealtimeToolCandidates("ko");
  for (const name of ["read_talent_schedules", "upsert_talent_schedules"])
    assert.ok(voice.some(tool => tool.name === name), name);
});

test("ordinary chat exposes general research and authoring regardless of legacy mode hints", () => {
  const ordinary = resolveCareerChatTools({
    isOnboardingDone: true,
    channel: "chat",
  });
  for (const name of [
    "manage_work",
    "save_job_posting",
    "upsert_document",
    "update_talent_profile",
  ])
    assert.ok(ordinary.toolNames.includes(name));
  const application = resolveCareerChatTools({
    isOnboardingDone: true,
    channel: "chat",
    simulationActive: true,
    simulationPreparation: true,
  });
  for (const name of ["web_search", "open_url", "upsert_document"])
    assert.ok(application.toolNames.includes(name));
  assert.deepEqual(application.toolNames, ordinary.toolNames);
  const bounded = resolveCareerChatTools({
    isOnboardingDone: true,
    channel: "chat",
    simulationActive: true,
    allowedToolNames: ["read_document"],
  });
  assert.deepEqual(bounded.toolNames, ["read_document"]);
});

test("one document writer is exposed across onboarding, ordinary chat and application modes", () => {
  for (const mode of [
    { isOnboardingDone: false },
    { isOnboardingDone: true },
    { isOnboardingDone: true, simulationActive: true, simulationPreparation: true },
    { isOnboardingDone: true, simulationActive: true, simulationPreparation: false },
  ]) {
    const selection = resolveCareerChatTools({ channel: "chat", ...mode });
    assert.ok(selection.toolNames.includes("upsert_document"));
    assert.ok(!selection.toolNames.includes("generate_resume"));
    const tool = selection.tools.find(tool => tool.function.name === "upsert_document")!;
    const properties = tool.function.parameters.properties as Record<string, { enum?: string[] }>;
    assert.deepEqual(properties.action.enum, ["create", "update", "copy"]);
    assert.deepEqual(properties.type.enum, ["resume", "markdown"]);
    for (const field of ["content", "changes", "markdown", "edits", "description"])
      assert.ok(field in properties, field);
  }
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

test("general application tools replace the six retired tools only after onboarding in text chat", () => {
  const retired = ["simulate_application", "manage_simulation_session", "manage_application_suggestions", "ready_for_role", "save_application", "apply_for_role"];
  for (const isOnboardingDone of [false, true]) for (const channel of ["chat", "voice"] as const) {
    const selection = resolveCareerChatTools({ channel, isOnboardingDone, hasActiveGmailIntegration: true });
    for (const name of retired) assert.ok(!selection.toolNames.includes(name), name);
    for (const name of ["use_browser", "suggest_form", "write_email"])
      assert.equal(selection.toolNames.includes(name), isOnboardingDone && channel === "chat", `${name}/${channel}/${isOnboardingDone}`);
  }
  const voice = getCareerRealtimeToolCandidates("ko");
  for (const name of [...retired, "use_browser", "suggest_form", "write_email"])
    assert.ok(!voice.some(tool => tool.name === name), name);
});

test("caller bounds preserve Gmail tools and annotate missing connections", () => {
  const base = { channel: "chat" as const, isOnboardingDone: true };
  assert.deepEqual(resolveCareerChatTools({ ...base, allowedToolNames: [] }).toolNames, []);
  assert.deepEqual(resolveCareerChatTools({ ...base, allowedToolNames: ["read_document"] }).toolNames, ["read_document"]);
  const unavailable = resolveCareerChatTools({ ...base, allowedToolNames: ["write_email"], hasActiveGmailIntegration: false });
  assert.deepEqual(unavailable.toolNames, ["write_email"]);
  assert.ok(unavailable.tools[0].function.description.endsWith(GMAIL_DISCONNECTED_TOOL_DESCRIPTION));
  const connected = resolveCareerChatTools({ ...base, allowedToolNames: ["write_email"], hasActiveGmailIntegration: true });
  assert.deepEqual(connected.toolNames, ["write_email"]);
  assert.ok(!connected.tools[0].function.description.includes(GMAIL_DISCONNECTED_TOOL_DESCRIPTION));
  assert.deepEqual(connected.stopAfterToolNames, []);
  assert.deepEqual(resolveCareerChatTools({ ...base, allowedToolNames: ["simulate_application", "apply_for_role"] }).toolNames, []);
});

test("disconnected Gmail remains discoverable and loadable with its connection requirement", async () => {
  const { resolveCareerCapabilities } = await import("./capabilities/resolver");
  for (const connected of [false, true]) {
    const tools = resolveCareerChatTools({ channel: "chat", isOnboardingDone: true, hasActiveGmailIntegration: connected }).tools;
    for (const mode of ["progressive", "full"] as const) {
      const cold = resolveCareerCapabilities({ eligibleTools: tools, loaded: new Set(), mode });
      for (const id of ["connected_inbox", "email_writing"])
        assert.ok(cold.catalogText.includes(id), `${connected}/${mode}/${id}`);
      const loaded = resolveCareerCapabilities({ eligibleTools: tools, loaded: new Set(["connected_inbox", "email_writing"]), mode });
      for (const name of ["search_connected_gmail", "write_email"]) {
        const tool = loaded.tools.find(tool => tool.function.name === name)!;
        assert.ok(tool, name);
        assert.equal(tool.function.description.endsWith(GMAIL_DISCONNECTED_TOOL_DESCRIPTION), !connected);
      }
    }
  }
});

test("browser and email load independently while forms are available immediately", async () => {
  const { resolveCareerCapabilities } = await import("./capabilities/resolver");
  const tools = resolveCareerChatTools({ channel: "chat", isOnboardingDone: true, hasActiveGmailIntegration: true }).tools;
  const cold = resolveCareerCapabilities({ eligibleTools: tools, loaded: new Set(), mode: "progressive" });
  assert.ok(cold.offeredNames.has("suggest_form"));
  for (const name of ["use_browser", "write_email"]) assert.ok(!cold.offeredNames.has(name));
  const loaded = resolveCareerCapabilities({ eligibleTools: tools, loaded: new Set(["browser", "email_writing"]), mode: "progressive" });
  for (const name of ["use_browser", "suggest_form", "write_email", "load_career_capabilities", "load_handbook"])
    assert.ok(loaded.offeredNames.has(name), name);
  assert.ok(!loaded.catalogText.includes("saved preparations"));
});

test("one document writer exposes description and metadata alongside authored content", () => {
  for (const isOnboardingDone of [false, true]) {
    const { tools, toolNames } = resolveCareerChatTools({ isOnboardingDone, channel: "chat" });
    assert.equal(toolNames.filter(name => name === "upsert_document").length, 1);
    assert.ok(!toolNames.includes("write_document"));
    assert.ok(!toolNames.includes("update_document"));
    const parameters = tools.find(tool => tool.function.name === "upsert_document")!.function.parameters as any;
    for (const key of ["description", "markdown", "edits", "document_id", "expected_revision", "is_public", "is_primary", "kind", "is_deleted"])
      assert.ok(parameters.properties[key], key);
  }
});

test("company capability and voice expose one follow tool for both listing and changes", async () => {
  const { resolveCareerCapabilities } = await import("./capabilities/resolver");
  const eligible = resolveCareerChatTools({ channel: "chat", isOnboardingDone: true }).tools;
  const loaded = resolveCareerCapabilities({ eligibleTools: eligible, loaded: new Set(["companies"]), mode: "progressive" });
  assert.ok(loaded.offeredNames.has("follow_company"));
  assert.ok(!loaded.offeredNames.has("list_company_follows"));
  assert.ok(!loaded.catalogText.includes("list_company_follows"));
  for (const tools of [eligible.map(tool => tool.function), getCareerRealtimeToolCandidates("ko")]) {
    assert.ok(!tools.some(tool => tool.name === "list_company_follows"));
    const follows = tools.filter(tool => tool.name === "follow_company");
    assert.equal(follows.length, 1);
    const schema = follows[0].parameters as { properties: Record<string, { enum?: string[] }>; required: string[] };
    assert.deepEqual(schema.properties.action.enum, ["list", "read", "follow", "update", "unfollow"]);
    assert.deepEqual(schema.required, ["action"]);
    assert.ok(schema.properties.include_unfollowed);
    assert.ok(schema.properties.offset);
  }
});
