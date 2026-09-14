import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchMockInterviewContext,
  readMockInterviewOpportunityId,
} from "./mockInterview";
import { buildCareerConversationPromptPlan } from "./prompts/conversationPlan";
import { MOCK_INTERVIEW_OPENING_PROMPT } from "./prompts/cases/mockInterviewPrompts";
import { shouldUseCareerRealtimeOnboarding } from "./realtimeCallScope";

const id = "11111111-1111-4111-8111-111111111111";
test("mock interview rejects malformed IDs and mixed purposes", () => {
  assert.equal(readMockInterviewOpportunityId({}), null);
  assert.equal(
    readMockInterviewOpportunityId({ mockInterviewOpportunityId: id }),
    id
  );
  for (const value of [42, "not-an-id", {}])
    assert.throws(() =>
      readMockInterviewOpportunityId({ mockInterviewOpportunityId: value })
    );
  for (const key of [
    "conversationStarterId",
    "internalCallRequestId",
    "resumeCallNoteId",
    "forceCompleteOnboarding",
  ]) {
    assert.throws(() =>
      readMockInterviewOpportunityId({
        mockInterviewOpportunityId: id,
        [key]: "other",
      })
    );
  }
});

test("server lookup scopes to the user and only returns public position fields", async () => {
  for (const source of ["internal", "external", "user_link_import"]) {
    const context = await fetchMockInterviewContext(
      { admin: {} as never, userId: "user-a", opportunityId: id },
      async (args) => {
        assert.equal(args.userId, "user-a");
        assert.deepEqual(args.ids, [id]);
        return [
          {
            companyName: "Example",
            title: "Engineer",
            description: null,
            companyDescription: "Public description",
            sourceType: source,
            talentMemo: "PRIVATE",
            recommendationReasons: ["PRIVATE"],
          },
        ] as never;
      }
    );
    assert.deepEqual(context, {
      companyName: "Example",
      roleTitle: "Engineer",
      jd: null,
      companyDescription: "Public description",
    });
  }
  await assert.rejects(
    fetchMockInterviewContext(
      { admin: {} as never, userId: "other-user", opportunityId: id },
      async () => []
    ),
    /not found/
  );
});

test("target and mock policy persist when rebuilding the prompt after an answer", () => {
  for (const recentConversationSection of [
    "",
    "사용자: 네",
    "사용자: 고객에게 배치 방식을 제안했습니다.",
  ]) {
    const plan = buildCareerConversationPromptPlan({
      channel: "voice",
      conversationMode: "mock_interview",
      mockInterviewContext: {
        companyName: "Example",
        roleTitle: "FDE",
        jd: "Customer integration",
        companyDescription: "Public",
      },
      isOnboardingDone: true,
      profile: null,
      structuredProfileText: "Backend experience",
      talentContextSection: "",
      recentConversationSection,
      toolNames: ["web_search", "end_call"],
    });
    const text = plan.promptBlocks.map((block) => block.text).join("\n");
    assert.match(text, /Example/);
    assert.match(text, /Customer integration/);
    assert.match(text, /첫 면접 질문 전에 반드시 web_search/);
    assert.ok(
      !plan.promptBlocks.some(
        (block) =>
          block.key === "post_onboarding_conversation_guide" ||
          block.key === "post_onboarding_voice_response_guidance"
      )
    );
    assert.ok(plan.enabledToolNames.includes("web_search"));
    assert.ok(!text.includes(MOCK_INTERVIEW_OPENING_PROMPT));
  }
  assert.equal(
    shouldUseCareerRealtimeOnboarding({
      hasMockInterview: true,
      hasConversationStarter: false,
      hasInternalOpportunityCall: false,
      isOnboardingDone: false,
    }),
    false
  );
  assert.match(
    MOCK_INTERVIEW_OPENING_PROMPT,
    /확인을 기다리지 않고 web_search/
  );
});

test("ordinary calls do not carry the detailed mock policy", () => {
  const plan = buildCareerConversationPromptPlan({
    channel: "voice",
    isOnboardingDone: true,
    profile: null,
    structuredProfileText: "",
    talentContextSection: "",
    toolNames: ["web_search", "end_call"],
  });
  const text = plan.promptBlocks.map((block) => block.text).join("\n");
  assert.doesNotMatch(text, /## 질문 근거 확보/);
  assert.ok(
    plan.promptBlocks.some(
      (block) => block.key === "post_onboarding_voice_response_guidance"
    )
  );
});
