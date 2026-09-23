import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { expireCurrentCareerCoachingActivity } from "./careerCoachingActivity";
import { parseCareerCoachingActivity } from "./careerCoachingActivitySchema";
import { buildCareerConversationPromptPlan } from "./prompts/conversationPlan";
import {
  buildCareerCoachingCallOpeningInstruction,
  buildCareerCoachingPrompt,
} from "./prompts/cases/coachingPrompts";

const activity = {
  activityId: "9b466741-fce3-4e4b-8ae2-7af2b55cc273",
  agenda: ["전환 이유를 구체화한다", "검증할 다음 행동을 정한다"],
  channel: "chat" as const,
  createdAt: "2026-09-21T09:00:00.000Z",
  endedAt: null,
  messageId: 42,
  plannedMinutes: 20,
  revision: 3,
  startedAt: "2026-09-21T09:01:00.000Z",
  status: "active" as const,
  suggestedMinutes: 20,
  topic: "개발자에서 PM으로 전환할지 판단하기",
  updatedAt: "2026-09-21T09:02:00.000Z",
};

const readSource = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

test("treats a null composite expiry result as no expiry", async () => {
  const admin = {
    rpc: async () => ({
      data: {
        content: null,
        conversation_id: null,
        id: null,
        message_type: null,
        payload: null,
        role: null,
        user_id: null,
      },
      error: null,
    }),
  };

  assert.equal(
    await expireCurrentCareerCoachingActivity({
      activityMessageId: 42,
      admin: admin as never,
      conversationId: "0f33b16c-dc0e-43ce-9cde-cdd9338e7595",
      userId: "2a31f7a7-fbf8-4757-b326-46ac85b2a862",
    }),
    null
  );
});

test("parses the compact coaching activity contract and rejects incomplete active state", () => {
  assert.deepEqual(
    parseCareerCoachingActivity({
      id: 42,
      message_type: "career_coaching_activity",
      payload: { ...activity, kind: "career_coaching_activity" },
    }),
    activity
  );
  assert.equal(
    parseCareerCoachingActivity({
      id: 42,
      message_type: "career_coaching_activity",
      payload: {
        ...activity,
        agenda: [],
        kind: "career_coaching_activity",
      },
    }),
    null
  );
  assert.equal(
    parseCareerCoachingActivity({
      id: 42,
      message_type: "career_coaching_activity",
      payload: {
        ...activity,
        agenda: ["아직 시작하지 않은 agenda"],
        channel: null,
        kind: "career_coaching_activity",
        plannedMinutes: null,
        startedAt: null,
        status: "suggested",
        suggestedMinutes: 20,
      },
    }),
    null
  );
});

test("ordinary chat gets a strict semantic boundary without entering coaching mode", () => {
  const plan = buildCareerConversationPromptPlan({
    channel: "chat",
    currentPreferences: { preferredLocale: "ko" },
    isOnboardingDone: true,
    profile: null,
    structuredProfileText: "",
    talentContextSection: "",
    toolNames: ["manage_career_coaching_activity"],
  });
  const coachingBlock = plan.promptBlocks.find(
    (block) => block.key === "career_coaching_activity"
  );

  assert.equal(
    plan.promptBlocks.some(
      (block) => block.key === "post_onboarding_conversation_guide"
    ),
    true
  );
  assert.match(
    coachingBlock?.text ?? "",
    /ordinary Career conversation remains the default/
  );
  assert.match(coachingBlock?.text ?? "", /isolated emotional remark/);
  assert.match(
    coachingBlock?.text ?? "",
    /When the request is ambiguous, answer normally/
  );
  assert.match(
    coachingBlock?.text ?? "",
    /first call read_career_coaching_list/
  );
  assert.match(
    coachingBlock?.text ?? "",
    /Do not choose a topic on the user's behalf/
  );
  assert.match(
    coachingBlock?.text ?? "",
    /Every new coaching activity must be created with suggest first/
  );
  assert.match(coachingBlock?.text ?? "", /5, 10, or 20 minutes/);
  assert.match(
    coachingBlock?.text ?? "",
    /update and end are invalid and must not be called/
  );
  assert.match(coachingBlock?.text ?? "", /Never state numeric compensation/);
});

test("active coaching uses its topic, duration, and agenda while suppressing the generic guide", () => {
  const plan = buildCareerConversationPromptPlan({
    careerCoachingActivity: activity,
    channel: "chat",
    conversationMode: "career_coaching",
    currentPreferences: { preferredLocale: "ko" },
    isOnboardingDone: true,
    profile: null,
    structuredProfileText: "",
    talentContextSection: "",
    toolNames: ["manage_career_coaching_activity"],
  });
  const instruction = plan.promptBlocks.find(
    (block) => block.key === "career_coaching_activity"
  )?.text;

  assert.equal(
    plan.promptBlocks.some(
      (block) => block.key === "post_onboarding_conversation_guide"
    ),
    false
  );
  assert.match(instruction ?? "", /개발자에서 PM으로 전환할지 판단하기/);
  assert.match(instruction ?? "", /검증할 다음 행동을 정한다/);
  assert.match(instruction ?? "", /Duration guides scope/);
  assert.match(instruction ?? "", /session control rather than durable memory/);
  assert.match(instruction ?? "", /Active chat coaching quality/);
  assert.match(
    instruction ?? "",
    /A paraphrase, generic empathy, encouragement, or a question by itself is not enough/
  );
  assert.match(
    instruction ?? "",
    /Ask at most one question in a response, and only when its answer could change/
  );
  assert.match(
    instruction ?? "",
    /do not compress a consequential analysis into a brief acknowledgment and a follow-up question/
  );
  assert.match(
    instruction ?? "",
    /Keep three things separate: facts supplied by the user or tools, inferences from those facts, and external career-market generalizations/
  );
  assert.match(
    instruction ?? "",
    /Do not infer that the user has a particular level, fit, or market value from one or two achievements/
  );
  assert.match(
    instruction ?? "",
    /check it against the distinctions and corrections already established/
  );
});

test("a suggestion preserves ordinary conversation behavior until accepted", () => {
  const suggested = {
    ...activity,
    agenda: [],
    channel: null,
    plannedMinutes: null,
    startedAt: null,
    status: "suggested" as const,
  };
  const plan = buildCareerConversationPromptPlan({
    careerCoachingActivity: suggested,
    channel: "chat",
    conversationMode: "default",
    currentPreferences: { preferredLocale: "ko" },
    isOnboardingDone: true,
    profile: null,
    structuredProfileText: "",
    talentContextSection: "",
    toolNames: ["manage_career_coaching_activity"],
  });

  assert.equal(
    plan.promptBlocks.some(
      (block) => block.key === "post_onboarding_conversation_guide"
    ),
    true
  );
  assert.match(
    buildCareerCoachingPrompt({ activity: suggested, channel: "chat" }),
    /focused conversation has not started/
  );
  assert.match(
    buildCareerCoachingPrompt({ activity: suggested, channel: "chat" }),
    /Acceptance of the topic, or naturally beginning to discuss it, does not select a channel/
  );
  assert.match(
    buildCareerCoachingPrompt({ activity: suggested, channel: "chat" }),
    /contribute one useful initial frame or hypothesis/
  );
});

test("voice coaching does not receive chat-specific response-shaping rules", () => {
  const instruction = buildCareerCoachingPrompt({
    activity: { ...activity, channel: "call" },
    channel: "voice",
    preferredLocale: "ko",
  });

  assert.match(instruction, /Active focused career-coaching conversation/);
  assert.doesNotMatch(instruction, /Active chat coaching quality/);
});

test("migration enforces one open activity, revision checks, expiry, and call rollback", () => {
  const migration = readSource(
    "supabase/migrations/20260921223000_career_coaching_activities.sql"
  );
  const correctiveMigration = readSource(
    "supabase/migrations/20260922170000_career_coaching_activity_contract_v2.sql"
  );

  assert.match(migration, /career_coaching_activity_message_id bigint/);
  assert.match(migration, /payload ->> 'status' in \('suggested', 'active'\)/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /p_expected_revision integer/);
  assert.match(migration, /errcode = '40001'/);
  assert.match(migration, /expire_talent_career_coaching_activity/);
  assert.match(migration, /make_interval\(mins => v_minutes \* 3\)/);
  assert.match(migration, /rollback_talent_career_coaching_call_start/);
  assert.match(
    migration,
    /suggested career coaching activity can only update topic or suggested minutes/
  );
  assert.match(
    correctiveMigration,
    /drop function if exists public\.mutate_talent_career_coaching_activity/
  );
  assert.match(correctiveMigration, /p_suggested_minutes integer default null/);
  assert.match(correctiveMigration, /expire_talent_career_coaching_activity/);
});

test("post-onboarding chat exposes one lifecycle tool without a coaching classifier gate", () => {
  const toolSelection = readSource("src/lib/career/llmTools.ts");
  const chatRoute = readSource("src/app/api/talent/chat/route.ts");

  assert.match(
    toolSelection,
    /CAREER_CHAT_POST_ONBOARDING_TOOL_NAMES[\s\S]*MANAGE_CAREER_COACHING_ACTIVITY/
  );
  assert.doesNotMatch(toolSelection, /careerCoachingActivityAvailable/);
  assert.doesNotMatch(chatRoute, /careerCoachingEntryRequested/);
  assert.doesNotMatch(chatRoute, /TALENT_MESSAGE_TYPE_CAREER_COACHING_ENTRY/);
});

test("coaching button and card actions remain visible user messages", () => {
  const flow = readSource("src/components/career/CareerFlowProvider.tsx");
  const card = readSource(
    "src/components/career/chat/CareerCoachingActivityCard.tsx"
  );
  const messageStore = readSource("src/lib/talentOnboarding/messageStore.ts");
  const chatHook = readSource("src/hooks/career/useCareerChat.ts");

  assert.match(
    flow,
    /starter\.id === "career_coaching"[\s\S]*sendChatMessage\(\{ text: starter\.chatMessage \}\)/
  );
  assert.match(flow, /coachingActivityAction:[\s\S]*expectedRevision/);
  assert.match(flow, /"채팅으로 진행할게요\."/);
  assert.match(card, /call: "통화하기"/);
  assert.match(card, /chat: "채팅으로 이어하기"/);
  assert.match(
    card,
    /variant="primary"[\s\S]*channel: "call"[\s\S]*variant="transparent"[\s\S]*channel: "chat"/
  );
  assert.doesNotMatch(messageStore, /career_coaching_entry/);
  assert.doesNotMatch(chatHook, /hideSyntheticUserMessage/);
  assert.equal(
    existsSync(
      path.join(process.cwd(), "src/app/api/talent/coaching/activity/route.ts")
    ),
    false
  );
});

test("coaching calls use an exact bound activity and end at the call boundary", () => {
  const realtime = readSource("src/lib/career/realtimeInstructions.ts");
  const wrapup = readSource("src/app/api/talent/chat/call-wrapup/route.ts");
  const voiceHook = readSource("src/hooks/career/useCareerOnboardingVoice.ts");

  assert.match(
    realtime,
    /activityMessageId: args\.careerCoachingActivityMessageId/
  );
  assert.match(realtime, /careerCoachingActivity\.revision !==/);
  assert.match(realtime, /careerCoachingActivity\.channel !== "call"/);
  assert.match(
    wrapup,
    /activity\.status !== "active"[\s\S]*activity\.channel !== "call"[\s\S]*activity\.revision < careerCoachingActivityRevision/
  );
  assert.match(wrapup, /hasCareerCoachingActivity[\s\S]*action: "end"/);
  assert.match(voiceHook, /\/api\/talent\/coaching\/call-rollback/);
});

test("call opening is grounded in the stored topic and agenda", () => {
  const instruction = buildCareerCoachingCallOpeningInstruction({
    activity,
    preferredLocale: "ko",
  });

  assert.match(instruction, /개발자에서 PM으로 전환할지 판단하기/);
  assert.match(instruction, /전환 이유를 구체화한다/);
  assert.match(instruction, /one concrete opening move/);
  assert.match(instruction, /Korean/);
});
