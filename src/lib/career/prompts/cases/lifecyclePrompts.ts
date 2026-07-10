import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import { careerT } from "@/lib/career/translatedCareerMessage";
import {
  formatCareerPromptKoreanDateTime,
  parseCareerPromptTimestampMs,
} from "@/lib/career/prompts/promptUtils";
import {
  CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER,
  type CareerOpportunityFeedbackFollowUpTrigger,
  type CareerTranscriptEntry,
} from "@/lib/career/prompts/types";
import type { InternalOpportunityCallRequest } from "@/lib/talentOnboarding/internalOpportunityCallRequest";

export const CAREER_SESSION_START_NO_MESSAGE_MARKER = "__NO_SESSION_GREETING__";
export const CAREER_SESSION_START_CALL_ACTION_MARKER = "[[CALL]]";

/**
 * N시간 이후 재접속시 자동으로 먼저 인사하도록 하는 것
 */
export function buildCareerSessionStartTurnInstruction(args: {
  currentAccessAt: string;
  idleMs: number;
  isOnboardingDone: boolean;
  preferredLocale?: string | null;
  previousChatAt: string | null;
}) {
  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  const currentAccessMs = parseCareerPromptTimestampMs(args.currentAccessAt);
  const previousChatMs = parseCareerPromptTimestampMs(args.previousChatAt);
  const previousChatIdleHours =
    currentAccessMs > 0 && previousChatMs > 0
      ? Math.max(
          0,
          Math.floor((currentAccessMs - previousChatMs) / (60 * 60 * 1000))
        )
      : null;
  const currentAccessAtLabel = formatCareerPromptKoreanDateTime(
    args.currentAccessAt
  );
  const previousChatAtLabel = formatCareerPromptKoreanDateTime(
    args.previousChatAt
  );

  if (!args.isOnboardingDone) {
    return [
      "## Session-start assistant turn",
      `Always write the user-visible reply in ${outputLanguage}.`,
      "사용자가 방금 Career 화면에 다시 접속했다. 사용자가 아직 새 메시지를 보내지 않았지만, Harper가 먼저 짧게 말을 건넬 수 있는 차례다.",
      `- currentAccessAt: ${currentAccessAtLabel}`,
      `- previousChatAt: ${previousChatAtLabel}`,
      `- hoursSincePreviousChat: ${previousChatIdleHours ?? "(계산 불가)"}`,
      "이번 발화의 목적은 끊긴 커리어 온보딩을 자연스럽게 이어가는 것이다.",
      "돌아온 것을 환영합니다 혹은 이전의 대화를 자연스럽게 이어가는 식으로 시작하면 좋다.",
      "기존 onboarding_rules와 checklist/runtime state를 참고해서 아직 부족한 정보 중 가장 중요한 것을 물으면서 말을 마쳐라.",
      "혹은 종료 기준을 충족했다면 다시 돌아오셔서 반갑습니다.라고 가볍게 말한 뒤 바로 종료해라.",
      "추천 공고를 새로 찾거나, 이전 추천 중 무엇이 끌리는지 묻거나, 지원 여부를 확인하는 방향으로 가지 마라.",
      "질문은 한 번에 하나만 한다. 온보딩 완료를 단정하거나, Harper가 이미 충분히 다 알았다고 말하지 마라.",
    ].join("\n");
  }

  return [
    "## Session-start assistant turn",
    `Always write the user-visible reply in ${outputLanguage}.`,
    "사용자가 방금 Career 화면에 다시 접속했다. 사용자가 아직 새 메시지를 보내지 않았지만, Harper가 먼저 짧게 말을 건넬 수 있는 차례다.",
    `- currentAccessAt: ${currentAccessAtLabel}`,
    `- previousChatAt: ${previousChatAtLabel}`,
    `- hoursSincePreviousChat: ${previousChatIdleHours ?? "(계산 불가)"}`,
    "최근 Career 활동이나 프로필 변경 혹은 이전 추천 등이 필요하면 기존 career/chat에서 쓰는 tool 정책에 따라 적절한 tool을 사용해라.",
    "가벼운 인사와 자연스럽게 질문을 하면 좋다. 아무 말도 하지 않는게 좋다고 판단되면 하지 않아도 된다.",
    "질문 예시:",
    "ex. 저번에 저장 or 제외됨을 선택해주셨는데, 그렇게 선택하신 이유에 대해서 말씀해주실 수 있나요? 다음 연결 혹은 추천에 반영할 수 있어요!",
    "ex. mismatch case) Cursor 포지션을 저장해주셨는데 근무위치가 미국이에요. 한국과 일본 근무를 선호한다고 해주셨는데, 좋은 기회라면 미국에도 열려있으신걸까요?",
    "ex. profile information case) 하퍼가 더 정확한 외부 기회 추천 혹은 내부 기회 연결을 해드리기 위해서는 B님의 맥락에 대해서 더 알수록 좋아요. 프로필을 보면 A 회사에서 딥러닝 인턴을 했다고만 되어있는데, 구체적으로 어떤걸 하셨었는지 알려주실 수 있나요?",
    "ex. profile information case) 프로필에 표현되지 않은 정보 중 자랑스럽거나 소개하고 싶은 경험이 있으시다면 알려주세요.",
    "안좋은 예시: 이 중에 특히 더 끌리는 회사 있으세요? - 이유: 더 끌리는 회사를 받아도 추천이나 연결에 도움이 되는 정보가 아니다.",
    "안좋은 예시: 혹시 이 중에서 실제로 지원을 진행하고 계신 곳이 있으신가요?",
    "세션 시작 인사에서는 이전에 저장/좋아요한 추천들을 카드처럼 다시 묶어 '그중 뭐가 제일 끌리냐', '어느 회사가 더 좋냐', '실제로 지원 중인 곳이 있냐'처럼 묻지 마라. 이런 질문은 추천/연결 품질을 거의 개선하지 못한다.",
    "이전 저장/좋아요/제외됨 신호를 사용해야 한다면, 특정 선택의 이유나 명확한 mismatch 하나만 물어라. 그런 구체성이 없으면 추천 이력 질문 대신 프로필 gap, 최근 변화, 통화 제안 중 하나로 이어가라.",
    "이미 명확한 다음 액션이 진행 중이라 사용자의 답이 필요 없거나, 질문이 오히려 어색하면 질문 없이 짧은 상태 공유로 닫아도 된다.",
    previousChatIdleHours && previousChatIdleHours > 1344
      ? `hoursSincePreviousChat이 1344 이상이고, 최근 활동/추천/프로필 변경에서 바로 이어갈 만한 명확한 업데이트가 없다면 "오랜만이라 최근 업데이트나 재밌게 하는 일이 있는지 통화로 한번 듣고 싶다"는 취지로 자연스럽게 말한 뒤 응답 맨 끝에 ${CAREER_SESSION_START_CALL_ACTION_MARKER} 를 붙여라. ${CAREER_SESSION_START_CALL_ACTION_MARKER} 는 UI가 전화하기 버튼을 표시하는 데 쓰는 마커다. 이 마커를 설명하거나 따옴표로 감싸지 마라.`
      : "",
  ].join("\n");
}

export function buildCareerCallWrapupTurnInstruction(args: {
  durationLabel: string | null;
  isBrief: boolean;
  isOnboardingDone?: boolean;
  preferredLocale?: string | null;
  transcript: CareerTranscriptEntry[];
}) {
  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  const lines = args.transcript
    .map((entry) => {
      const role = entry.role === "user" ? "User" : "Harper";
      return `${role}: ${entry.text.replace(/\s+/g, " ").trim()}`;
    })
    .filter((line) => line.trim().length > 0)
    .join("\n");

  return [
    "## Call wrap-up turn",
    "The user just ended a voice call. This is an assistant-initiated follow-up in the existing career chat, using the normal chat logic and tool policy.",
    `- callDuration: ${args.durationLabel ?? "(unknown)"}`,
    `- callLengthAssessment: ${args.isBrief ? "brief" : "substantial"}`,
    "",
    "Important tool instruction:",
    "- During the live voice call, `update_setting` and `update_talent_profile` were not available. Inspect only the user's statements in the call transcript below.",
    "- If the user disclosed a clear recommendation/contact subscription action, call `update_setting` before writing the wrap-up: stop_external for external/public postings only, stop_all for all Harper matching contact, or resume for recommendation/contact restart.",
    "- If the user's wording is a generic stop/unsubscribe that could mean either external postings only or all Harper matching contact, do not call `update_setting`; ask one clarifying question only if it fits the short follow-up.",
    "- If the user disclosed a clear recommendation batch-size change, call `update_talent_profile` with recommendationBatchSize before writing the wrap-up.",
    "- If the user disclosed clear new durable preferences, constraints, recommendation memory, or profile-row details that are missing from current state, call `update_talent_profile` before writing the wrap-up.",
    "- These tool calls are optional. Skip them when there is no clear new writable information, the information is already saved, or the statement was only casual/uncertain.",
    "- Do not call search, recommendation, company research, service-help, open-role, or activity-reading tools in this wrap-up turn.",
    "",
    "Response instruction:",
    `- Write one short natural ${outputLanguage} follow-up message for the chat after the call ends.`,
    "- 1-2 sentences, no heading, no bullets, no markdown card.",
    "- Do not ask a new interview-style question. The call has ended.",
    args.isOnboardingDone
      ? "- If the call had useful substance, thank them and say Harper will reflect what they shared in future matching/search."
      : "- Say briefly that Harper still needs a little more basic profile or preference context, and invite the user to continue from here in this chat. Do not imply the user must start another call.",
    "- Do not claim you updated settings/profile state unless the relevant tool was actually called and returned a successful change.",
    "",
    "[Call transcript for this wrap-up]",
    lines || "(no transcript text)",
  ].join("\n");
}

export function buildCareerCallWrapupFallbackFollowUp(args: {
  isBrief: boolean;
  isOnboardingDone?: boolean;
  preferredLocale?: string | null;
}) {
  if (!args.isOnboardingDone) {
    return careerT(
      args.preferredLocale,
      "career.call.wrapup_fallback.onboarding_remaining",
      "아직 온보딩이 조금 남아 있어요. 통화가 끊긴 지점부터 이 채팅에서 이어서 마무리하면, 그 기준으로 좋은 기회를 찾아드릴게요."
    );
  }

  if (args.isBrief) {
    return careerT(
      args.preferredLocale,
      "career.call.wrapup_fallback.brief",
      "오늘은 짧게 이야기 나눴네요. 다음에 편하실 때 조금만 더 들려주시면 그에 맞춰 더 잘 도와드릴게요."
    );
  }

  return careerT(
    args.preferredLocale,
    "career.call.wrapup_fallback.completed",
    "좋은 이야기 들려주셔서 감사합니다. 말씀해주신 내용을 바탕으로 만족하실 만한 기회를 잘 골라서 가져와볼게요."
  );
}

type OpportunityFeedbackFollowUpPromptArgs = {
  preferredLocale?: string | null;
  trigger: CareerOpportunityFeedbackFollowUpTrigger;
};

/**
 * 포지션 좋아요/싫어요 후 자동 답변에 사용되는 프롬프트
 */
export function buildCareerOpportunityFeedbackFollowUpTurnInstruction(
  args: OpportunityFeedbackFollowUpPromptArgs
) {
  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  let triggerGuidance: string[];

  switch (args.trigger) {
    case CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER.DelayedExternalFeedback:
      triggerGuidance = [
        "External opportunity feedback:",
        "- The user clicked like/dislike on an external opportunities.",
        `- Write a natural ${outputLanguage} follow-up that reflects the feedback without making it feel like a system notification.`,
        "- If there is a visible pattern in the feedback, mention it carefully as a hypothesis, not a fact.",
        "- If the useful next step is unclear, ask exactly one preference question that would improve future external recommendations.",
      ];
      break;
    case CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER.AllRecommendedOpportunitiesCleared:
      triggerGuidance = [
        "All recommended opportunities cleared trigger:",
        "- The user has just accepted or rejected the last remaining item in the New Positions tab. There are now zero remaining newly recommended opportunities.",
        `- Say, in natural ${outputLanguage}, that there are no remaining recommended opportunities to review right now.`,
        "- Action guide: if the previous conversation and feedback history provide enough signal, call `recommend_job_postings` to find a fresh batch based on that history; if a required preference is missing or you want confirmation about what you inferred from feedback, ask exactly one necessary question instead.",
        "- This should feel like Harper is using the user's prior feedback, not like a hard-coded automatic refresh.",
      ];
      break;
    case CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER.ImmediateInternalFeedback:
      triggerGuidance = [
        "Immediate internal feedback trigger:",
        "- The user liked or disliked an internal connection/request opportunity.",
        "다음에 어떤 과정이 진행되는지 최대한 자세히 안내해라.",
        "- If the internal opportunity was liked, treat it as confirmed acceptance. Thank them briefly, say Harper will proceed with the company-side introduction, and do not ask whether to connect/proceed again.",
        "- Explain that Harper will time the introduction thoughtfully and company-side schedules can take a little time. Frame it as Harper mediating a better-fit connection, not as a normal application. 기다려주시면 이메일로 안내가 갈 예정이다. 최대 5 ~ 10일 정도 소요될 수 있다.",
        "- If the profile context shows no resume file/link, mention that a resume usually improves review and companies often ask for it. Ask whether Harper should tell the company there is no updated resume yet, and invite them to upload one if they have it.",
        "- If the accepted opportunity visibly conflicts with known preferences or needs, ask one focused question about that mismatch. Example: current location vs role location, company/domain, role scope, or timing.",
        "예시 (실제 답변에서는 사용자 이름/회사명/역할명과 맥락에 맞게 자연스럽게 변형해라. markdown 강조와 줄바꿈을 적절히 사용해라.)",
        "[이름]님, **[회사명] [역할명]** 연결 제안 수락해주셔서 감사해요.",
        "",
        "이 건은 일반적인 공고 지원이라기보다, Harper가 [이름]님의 경험과 역할 핏을 정리해서 회사 쪽에 전달하고, 양쪽의 관심이 잘 맞는지 조율하는 연결에 가까워요.",
        "",
        "이제 Harper가 [이름]님을 회사 쪽에 소개드리는 방향으로 진행할게요. 회사 쪽 검토와 일정 확인이 필요해서 바로 답변이 오지 않을 수 있고, 보통 **5~10일 정도** 걸릴 수 있어요.",
        "",
        "다음 과정이나 추가로 확인할 내용이 생기면 이메일로 안내드릴게요. 그동안은 따로 지원서를 다시 넣으실 필요는 없고, Harper가 이 연결 건을 이어서 챙길게요.",
      ];
      break;
  }

  return [
    "## Opportunity feedback proactive assistant turn",
    `Return in ${outputLanguage}, using markdown.`,
    "The user clicked like/dislike on one or more recommended opportunities. They did not send a new message. It is Harper's turn to proactively respond.",
    "",
    ...triggerGuidance,
    "",
    "Rules:",
    "- Use the pending opportunity feedback context.",
    "- Do not overreact to one click. For multiple clicks, summarize the visible pattern once.",
    "- It is good to ask a question to learn more about the user's preferences or background when the answer will improve matching. Example: PM 역할인데 저장하셨네요. 현재는 개발자이신데 PM으로의 전환도 관심이 있으신가요 혹은 이전에 PM으로 일하셨던 경험이 있으신가요?",
    "- If the liked/disliked opportunities share a visible company/domain/role/work-mode pattern, mention that pattern carefully as a hypothesis, not a fact. Example tone: '이 방향이 잘 맞으시는 것 같네요. 비슷한 분위기 매칭 계속 보내드릴게요.'",
    "- If several opportunities were disliked and no specific reasons were provided, acknowledge the count and ask what did not fit. Offer concrete choices such as role scope, company/domain, team style, seniority, location/work mode, or timing.",
    "Important: 유저를 너무 귀찮게 만들지 마라. 이전에 이미 질문을 몇번 했는데 유저의 답이 없었거나, 꼭 필요한 질문이 없다면 다면 또 질문하기 보다는 감사합니다. 다음 번에 기회를 찾을 때 반영하겠습니다. 정도로만 안내해라.",
  ].join("\n");
}

/**
 * Internal 수락시 추가적인 정보 질문을 위해 voice call을 진행할 때 사용되는 프롬프트
 */
export function buildInternalOpportunityRealtimeInstruction(
  callRequest: InternalOpportunityCallRequest & {
    preferredLocale?: string | null;
  }
) {
  const outputLanguage = getCareerPromptLanguageName(
    callRequest.preferredLocale
  );

  return [
    "This live voice call is specifically for an accepted internal opportunity connection.",
    `- companyName: ${callRequest.companyName}`,
    `- roleTitle: ${callRequest.roleTitle}`,
    `- roleId: ${callRequest.roleId}`,
    `- Speak in ${outputLanguage}.`,
    "",
    "Call purpose:",
    "- This is not an interview or evaluation.",
    "- The company-side connection is already proceeding by Harper.",
    "- Ask short questions to collect better context for Harper to present the candidate to the company.",
    "- The user may also ask questions about the company or process.",
    "- Do not directly say 'I will pass this to the company exactly like this.' Say something more natural, such as that the details are helpful, and if needed say Harper will reflect them.",
    "- For language questions, do not simply ask 'Is your English good?' Ask about a concrete situation where fluent communication may matter, or ask about specific language use or international experience.",
    "- For each question, at most once, if the user's answer is shorter than two sentences, you may ask one short follow-up question.",
    "",
    "Required opening:",
    "- Start by referencing the company and role.",
    "- Say the connection is already progressing.",
    "- Say the call is optional/non-evaluative and only helps Harper present them better.",
    "- Then ask the first question immediately.",
    "",
    "Question plan. Ask one at a time, adapting naturally to answers:",
    ...callRequest.questions.map(
      (question, index) => `${index + 1}. ${question}`
    ),
    "",
    "Before ending:",
    `- You must ask at least once, in ${outputLanguage}, whether the user has questions about ${callRequest.companyName} or the next process.`,
    "- End when you think the call is over or the user accepts or require to stop.",
    `- End with a natural short closing in ${outputLanguage}, then call the end_call tool. Do not hesitate to end the call with end_call.`,
  ].join("\n");
}

/**
 * Internal 포지션 수락시 추가적인 정보 질문을 위해 voice call을 진행할 때 사용되는 프롬프트
 */
export function buildInternalOpportunityCallWrapupInstruction(args: {
  callRequest: InternalOpportunityCallRequest;
  durationLabel: string | null;
  isBrief: boolean;
  preferredLocale?: string | null;
  transcript: Array<{ role: "user" | "assistant"; text: string }>;
}) {
  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  const transcriptText = args.transcript
    .map((entry) => {
      const role = entry.role === "user" ? "User" : "Harper";
      return `${role}: ${entry.text.replace(/\s+/g, " ").trim()}`;
    })
    .filter((line) => line.trim().length > 0)
    .join("\n");

  return [
    "## Internal opportunity call wrap-up",
    "The user just ended a voice call for an accepted internal opportunity.",
    `- companyName: ${args.callRequest.companyName}`,
    `- roleTitle: ${args.callRequest.roleTitle}`,
    `- callDuration: ${args.durationLabel ?? "(unknown)"}`,
    `- callLengthAssessment: ${args.isBrief ? "brief_or_incomplete" : "substantial"}`,
    "",
    "Tool instruction:",
    "- If the user disclosed clear profile facts, role-specific achievements, constraints, preferences, or resume/CV positioning context, call update_talent_profile before writing the wrap-up.",
    "- Do not call search, recommendation, company research, or activity-reading tools.",
    "",
    "Response instruction:",
    `- Write one short natural ${outputLanguage} follow-up message for the chat after the call ends.`,
    "- Say the connection is continuing.",
    "- If the call was substantial, say Harper will reflect the shared details when presenting them to the company.",
    "- If the call was brief/incomplete, do not ask them to continue in chat; tell them they can continue from the Home call card when convenient.",
    "- No heading, no bullets, 1-3 sentences.",
    "",
    "[Call transcript]",
    transcriptText || "(no transcript text)",
  ].join("\n");
}
