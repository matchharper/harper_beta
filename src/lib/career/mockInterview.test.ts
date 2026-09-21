import { buildMockInterviewCandidateContext } from "./mockInterviewCandidateContext";
import {
  buildLiveFrontendInstructions,
  buildVoiceInputTranscription,
} from "./voiceSessionInstructions";
import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchMockInterviewContext,
  readMockInterviewOpportunityId,
} from "./mockInterview";
import { buildCareerConversationPromptPlan } from "./prompts/conversationPlan";
import {
  buildMockInterviewPositionContext,
  MOCK_INTERVIEW_OPENING_PROMPT,
} from "./prompts/cases/mockInterviewPrompts";
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
      location: null,
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
    /언어를 선택하라고 묻거나 영어로 할지 확인하지 말고/
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

test("mock prompt projects only interview blocks despite unrelated assembly inputs", () => {
  for (const locale of ["ko", "en"]) {
    const plan = buildCareerConversationPromptPlan({
      channel: "voice",
      conversationMode: "mock_interview",
      mockInterviewContext: {
        companyName: "Acme",
        roleTitle: "Engineer",
        jd: "English collaboration",
        companyDescription: null,
        location: "London",
      },
      currentPreferences: {
        preferredLocale: locale,
        recommendationBatchSize: 9,
      },
      profile: null,
      structuredProfileText: "Built a billing product",
      talentContextSection: "UNRELATED_MEMORY",
      recentConversationSection: "UNRELATED_HISTORY",
      recentRecommendedOpportunitiesText: "UNRELATED_RECOMMENDATIONS",
      gmailCapability: "available",
      toolNames: [
        "web_search",
        "get_role_context",
        "read_recommended_opportunities",
        "read_talent_context",
        "write_talent_context",
        "end_call",
      ],
    });
    assert.deepEqual(
      plan.promptBlocks.map((b) => b.key),
      [
        "mock_interview_core",
        "voice_call_rules",
        "interview_language",
        "candidate_context",
        "position_context",
        "tool_policy",
        "interview_flow",
      ]
    );
    const text = plan.promptBlocks.map((b) => b.text).join("\n");
    assert.doesNotMatch(
      text,
      /UNRELATED_|not an interviewer|Interviewer-like|Always speak|Language Settings|Gmail/
    );
    assert.match(text, /London/);
    assert.match(text, /Built a billing product/);
    assert.match(text, /정한 언어로 바로 연습을 시작/);
    assert.match(text, /면접 언어를 사용자에게 묻지 말고/);
    assert.match(text, /이 질문만 한국어로/);
    assert.equal(plan.enabledToolNames.length, 6);
  }
});

test("mock mode requires a voice channel and position context", () => {
  const args = {
    profile: null,
    structuredProfileText: "",
    talentContextSection: "",
    conversationMode: "mock_interview" as const,
  };
  assert.throws(
    () => buildCareerConversationPromptPlan({ ...args, channel: "voice" }),
    /requires voice/
  );
  assert.throws(
    () =>
      buildCareerConversationPromptPlan({
        ...args,
        channel: "chat",
        mockInterviewContext: {
          companyName: "A",
          roleTitle: "B",
          jd: null,
          companyDescription: null,
        },
      }),
    /requires voice/
  );
});

test("candidate projection omits identifiers and settings while retaining experience evidence", () => {
  const text = buildMockInterviewCandidateContext({
    talentUser: {
      name: "Candidate",
      headline: "Engineer",
      bio: "Builds products",
      email: "PRIVATE_EMAIL",
      user_id: "PRIVATE_ID",
      phone_number: "PRIVATE_PHONE",
    },
    talentExperiences: [
      {
        id: "PRIVATE_ROW",
        role: "Engineer",
        company_name: "Acme",
        description: "Built billing",
        memo: "Reduced errors",
      },
    ],
    talentEducations: [{ school: "School", degree: "BS", field: "CS" }],
    talentExtras: [{ title: "Open source", description: "Maintainer" }],
    settings: { blocked_companies: ["PRIVATE_COMPANY"] },
  } as never);
  assert.doesNotMatch(text, /PRIVATE/);
  for (const value of [
    "Candidate",
    "Built billing",
    "Reduced errors",
    "School",
    "Maintainer",
  ])
    assert.ok(text.includes(value));
});

test("voice transcription can retain a model without forcing a language", () => {
  assert.deepEqual(buildVoiceInputTranscription({ model: "test-model" }), {
    model: "test-model",
  });
  for (const language of ["ko", "en"]) {
    assert.deepEqual(
      buildVoiceInputTranscription({ model: "test-model", language }),
      { model: "test-model", language }
    );
  }
});

test("Live frontend delegates automatic language choice and preserves explicit switches", () => {
  const text = buildLiveFrontendInstructions({
    initialResponseInstruction: MOCK_INTERVIEW_OPENING_PROMPT,
    responseLocale: "ko",
    isMockInterview: true,
  });
  assert.match(text, /Delegate before choosing the opening language/);
  assert.match(text, /면접 언어를 사용자에게 묻지 말고/);
  assert.doesNotMatch(text, /unless the caller clearly switches languages/);
  const ordinary = buildLiveFrontendInstructions({
    initialResponseInstruction: "",
    responseLocale: "en",
  });
  assert.match(
    ordinary,
    /Speak naturally in English, unless the caller clearly switches languages/
  );
  assert.doesNotMatch(ordinary, /mock interview|이번 통화의 언어/);
});

test("mock transcription hints Korean and English without fixing either language", () => {
  for (const language of [undefined, "ko", "en"]) {
    const config = buildVoiceInputTranscription({
      model: "gpt-4o-transcribe",
      language,
      isMockInterview: true,
    });
    assert.equal(config.model, "gpt-4o-transcribe");
    assert.ok(!("language" in config));
    assert.ok("prompt" in config);
    assert.match(config.prompt ?? "", /Korean and English/);
    assert.match(config.prompt ?? "", /Do not translate/);
    assert.match(config.prompt ?? "", /Coughs/);
  }
  assert.deepEqual(
    buildVoiceInputTranscription({
      model: "gpt-4o-transcribe",
      language: "ko",
      isMockInterview: false,
    }),
    { model: "gpt-4o-transcribe", language: "ko" }
  );
});

test("opening chooses from saved language and role location without asking", () => {
  assert.match(MOCK_INTERVIEW_OPENING_PROMPT, /설정 언어/);
  assert.match(MOCK_INTERVIEW_OPENING_PROMPT, /Role location/);
  assert.match(MOCK_INTERVIEW_OPENING_PROMPT, /영어로 할지 확인하지 말고/);
});

test("position context labels company data and keeps the complete role description", () => {
  const fullDescription = `First responsibility\n\n${"Detailed requirement. ".repeat(600)}\nFinal responsibility`;
  const text = buildMockInterviewPositionContext({
    companyName: "Example",
    companyDescription: "Builds developer tools.",
    roleTitle: "Staff Engineer",
    location: "Seoul",
    jd: fullDescription,
  });

  assert.match(text, /### Role/);
  assert.match(text, /### Company/);
  assert.match(text, /Full role description:/);
  assert.ok(text.includes(fullDescription));
  assert.match(text, /Builds developer tools\./);
});
