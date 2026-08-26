import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import type { CareerReengagementPendingAction } from "@/lib/career/pendingActions";
import { careerT } from "@/lib/career/translatedCareerMessage";
import { formatCareerPromptKoreanDateTime } from "@/lib/career/prompts/promptUtils";
import {
  CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER,
  type CareerOpportunityFeedbackFollowUpTrigger,
  type CareerTranscriptEntry,
} from "@/lib/career/prompts/types";
import type { InternalOpportunityCallRequest } from "@/lib/talentOnboarding/internalOpportunityCallRequest";
import { logger } from "@/utils/logger";

export const CAREER_SESSION_START_NO_MESSAGE_MARKER = "__NO_SESSION_GREETING__";
export const CAREER_SESSION_START_CALL_ACTION_MARKER = "[[CALL]]";

function formatReengagementPendingAction(
  action: CareerReengagementPendingAction
) {
  switch (action.kind) {
    case "company_request":
      return `[회사 요청] ${action.companyName} · ${action.roleTitle}: ${action.request}`;
    case "talent_call":
      return `[call](callId:${action.callId}) ${action.companyName} · ${action.roleTitle}: ${
        action.reason ||
        "이 기회를 주제로 이야기할 수 있는 통화 요청이 열려 있음"
      }`;
    case "internal_opportunity":
      return `[internal 연결 제안] ${action.companyName} · ${action.roleTitle}: 아직 사용자의 피드백이 없음${
        action.recommendationSummary ? ` · ${action.recommendationSummary}` : ""
      }`;
    case "reevaluation_question":
      return `[reevaluation_criteria] ${action.question}`;
  }
}

/**
 * N시간 이후 재접속시 자동으로 먼저 인사하도록 하는 것
 */
export function buildCareerSessionStartTurnInstruction(args: {
  currentAccessAt: string;
  idleMs: number;
  isOnboardingDone: boolean;
  pendingActions?: CareerReengagementPendingAction[];
  preferredLocale?: string | null;
  previousChatAt: string | null;
}) {
  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  const currentAccessAtLabel = formatCareerPromptKoreanDateTime(
    args.currentAccessAt
  );
  const previousChatAtLabel = formatCareerPromptKoreanDateTime(
    args.previousChatAt
  );

  logger.log("buildCareerSessionStartTurnInstruction", {
    currentAccessAt: currentAccessAtLabel,
    previousChatAt: previousChatAtLabel,
  });

  if (!args.isOnboardingDone) {
    return [
      "## Session-start assistant turn",
      `기본 응답 언어는 ${outputLanguage}이다. 단, 최근 visible 대화에서 사용자가 다른 언어로 전환해 달라고 명시했고 assistant가 그 전환을 수락했다면 계정 기본 언어보다 그 대화의 최신 언어를 우선해 그대로 이어가라.`,
      "사용자가 방금 Career 화면에 다시 접속했다. 사용자가 아직 새 메시지를 보내지 않았지만, Harper가 먼저 짧게 말을 건넬 수 있는 차례다.",
      `- currentAccessAt: ${currentAccessAtLabel}`,
      `- previousChatAt: ${previousChatAtLabel}`,
      "위 시각 값은 모두 한국 시간 기준 24시간제다. 예를 들어 22:46을 10:46으로 변환하지 마라.",
      "'방금'은 현재 화면 접속만 뜻한다. 이전 대화 시각과 혼동하지 말고, 이전 대화가 오늘이 아니면 그 대화를 '방금' 또는 '조금 전'이라고 표현하지 마라.",
      "중요: 위의 정확한 날짜/시각과 경과 시간은 내부 판단용 정보다. 사용자에게 정확한 날짜, 시각, 경과 시간, 시각 비교를 직접 또는 괄호로 절대 말하지 마라. '몇 시간/며칠 만에'처럼 경과 시간을 유추해서도 말하지 마라.",
      "이번 발화의 목적은 끊긴 커리어 온보딩을 자연스럽게 이어가는 것이다.",
      "'다시 돌아오셔서 반갑습니다', '다시 오셨네요'처럼 짧고 가벼운 재접속 인사나 아이스브레이킹은 사용해도 된다. 다만 그런 인사만 하고 발화를 끝내지 마라. 이어갈 실제 질문이 있으면 인사 뒤에 그 질문을 자연스럽게 연결하고, 질문할 필요가 없다면 인사만 보내는 대신 no-message 규칙을 따른다. 온보딩, 인터뷰, 미완료 상태는 사용자에게 설명하지 마라.",
      "기존 onboarding_rules, checklist/runtime state, 최근 대화의 마지막 흐름을 함께 본다. 반드시 필요한 정보가 실제로 하나 남아 있을 때만, 이미 파악한 맥락을 짧게 이어 받은 뒤 가장 중요한 질문 하나를 자연스럽게 물어라. 프로필 전체를 다시 요약하거나 이전 질문을 기계적으로 반복하지 마라.",
      `종료 기준을 이미 충족했거나, 최근 대화가 내용 확인·마무리 단계이고 지금 다시 물을 구체적인 필수 정보가 없다면 인사만 만들지 말고 정확히 ${CAREER_SESSION_START_NO_MESSAGE_MARKER}만 출력해라.`,
      "추천 공고를 새로 찾거나, 이전 추천 중 무엇이 끌리는지 묻거나, 지원 여부를 확인하는 방향으로 가지 마라.",
      "질문은 한 번에 하나만 한다. 온보딩 완료를 단정하거나, Harper가 이미 충분히 다 알았다고 말하지 마라.",
    ].join("\n");
  }

  const pendingActions = (args.pendingActions ?? []).slice(0, 1);
  const pendingActionContext =
    pendingActions.length > 0
      ? [
          "현재 사용자가 처리하면 좋은 작업:",
          ...pendingActions.map(
            (action) => `- ${formatReengagementPendingAction(action)}`
          ),
          "",
          "위 목록이 있으면 이번 답변에서 해당 작업 1개를 자연스럽게 언급한다. 시스템 목록을 그대로 읽듯 말하지 말고 현재 대화에 이어지는 말로 작성한다.",
          ...(pendingActions.some((action) => action.kind === "talent_call")
            ? [
                "talent_call은 답변의 마지막 문장에서 언급하되 재촉하지 않는다. 통화 요청만 단독 알림처럼 말하지 말고, 항상 자연스러운 인사나 이전 대화를 잇는 다른 내용과 함께 말한다. 마지막 문장 끝에 목록의 [call](callId:...)를 정확히 한 번 그대로 붙인다.",
              ]
            : []),
          ...(pendingActions.some(
            (action) => action.kind === "reevaluation_question"
          )
            ? [
                "reevaluation_criteria 질문을 꺼낼 때는 '알려주시면 앞으로의 연결에 도움이 되는 질문이 있어요'와 같은 맥락을 자연스럽게 붙인다.",
              ]
            : []),
        ].join("\n")
      : "";
  const openingGuidance =
    pendingActions.length > 0
      ? "가벼운 인사로 시작해도 좋지만, 위 작업을 현재 대화에 자연스럽게 연결하는 것을 우선한다."
      : "가벼운 인사와 자연스럽게 질문을 하면 좋다. 아무 말도 하지 않는게 좋다고 판단되면 하지 않아도 된다.";

  return `
## Session-start assistant turn
Write in ${outputLanguage}, using markdown.
사용자가 방금 사이트에 다시 접속했다. 아직 아무런 말이 없지만, Harper가 먼저 짧게 말을 건넬 수 있는 차례다.
- currentAccessAt: ${currentAccessAtLabel}
- previousChatAt: ${previousChatAtLabel}

위 시각과 최근 메시지 내역은 모두 한국 시간 기준 24시간제다.
'방금'은 현재 화면 접속만 뜻한다. 이전 대화 시각과 혼동하지 말고, 이전 대화가 오늘이 아니면 그 대화를 '방금' 또는 '조금 전'이라고 표현하지 마라.

중요: 위의 정확한 날짜/시각과 경과 시간은 내부 판단용 정보다. 사용자에게 정확한 날짜, 시각, 경과 시간, 시각 비교를 구체적으로 말하지 마라.
${pendingActionContext}
${openingGuidance}
질문 예시:
ex. 안녕하세요 {{name}}님, 다시 오셨네요! 지난 대화 이후 상황이 달라진 게 있으신가요?
ex. mismatch case) Cursor 포지션을 저장해주셨는데 근무위치가 미국이에요. 한국과 일본 근무를 선호한다고 해주셨는데, 좋은 기회라면 미국에도 열려있으신걸까요?
혹은 피드백 요청, 부족한 정보(profile gap 등) 질문, 다음 추천에 반영할만한 사항이 있는지 질문 등을 해도 좋다.
안좋은 예시: 이 중에 특히 더 끌리는 회사 있으세요? - 이유: 더 끌리는 회사를 받아도 추천이나 연결에 도움이 되는 정보가 아니다.
이전에 저장/좋아요한 추천들을 묶어 '그중 뭐가 제일 끌리냐', '어느 회사가 더 좋냐', '실제로 지원 중인 곳이 있냐'처럼 묻지 마라. 이런 질문은 추천/연결 품질을 어짜피 거의 개선하지 못한다.
User feedback:none이면 Harper가 추천을 했지만 유저가 좋아요/싫어요 반응을 하지 않은 경우이다.
이전 저장/좋아요/제외됨 신호를 사용해야 한다면, 특정 선택의 이유나 명확한 mismatch 하나만 물어라. 그런 구체성이 없으면 추천 이력 질문 대신 프로필 gap, 최근 변화, 통화 제안 중 하나로 이어가라.
이미 명확한 다음 액션이 진행 중이라 사용자의 답이 필요 없거나, 질문이 오히려 어색하면 질문 없이 짧은 상태 공유로 닫아도 된다.`;
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
        "- If the internal opportunity was liked, treat it as confirmed acceptance. Thank them briefly and do not ask whether to connect/proceed again.",
        "- Say Harper will deliver the introduction to the company with the appropriate context at a thoughtful time. It may not be immediate, so ask the user to wait; follow-up will arrive by email and can take up to 5-10 days.",
        "- Never mention an internal human review, approval, final-confirmation, or manual handoff step. Do not imply that accepting the opportunity instantly sends the user's information to the company.",
        "- Frame the process as Harper mediating a better-fit connection, not as a normal application.",
        "- If the profile context shows no resume file/link, mention that a resume usually improves review and companies often ask for it. Ask whether Harper should tell the company there is no updated resume yet, and invite them to upload one if they have it.",
        "- If the accepted opportunity visibly conflicts with known preferences or needs, ask one focused question about that mismatch. Example: current location vs role location, company/domain, role scope, or timing.",
        "예시 (실제 답변에서는 사용자 이름/회사명/역할명과 맥락에 맞게 자연스럽게 변형해라. markdown 강조와 줄바꿈을 적절히 사용해라.)",
        "[이름]님, **[회사명] [역할명]** 연결 제안 수락해주셔서 감사해요.",
        "",
        "이 건은 일반적인 공고 지원이라기보다, Harper가 [이름]님의 경험과 역할 핏을 정리해서 회사 쪽에 전달하고, 양쪽의 관심이 잘 맞는지 조율하는 연결에 가까워요.",
        "",
        "이제 Harper가 적절한 타이밍에 [이름]님의 경험과 역할 핏을 잘 정리해 회사 쪽에 전달할게요. 바로 전달되거나 답변이 오지는 않을 수 있으니 조금만 기다려주세요. 보통 **5~10일 정도** 걸릴 수 있어요.",
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
    "- You may say Harper will use this feedback as one signal when choosing future recommendations. Do not volunteer technical explanations about what was or was not saved.",
    "- A role fit summary is context describing the opportunity. Do not infer that the user likes or dislikes its contents unless the click reason or other user evidence supports that inference.",
    "- Exact timestamps in the feedback context are internal ordering metadata. Never repeat them to the user.",
    "- Do not overreact to one batch of clicks. Even when two or three opportunities appear to share a company, domain, role, seniority, location, or work-mode pattern, that pattern is still only an inferred hypothesis unless the user explicitly stated it or it is already confirmed in persisted context.",
    "- Whenever you mention an insight inferred from clicks, opportunity metadata, or role fit summaries, ask exactly one focused question in the same reply to confirm whether that interpretation is right. Until the user confirms it, do not say Harper will prioritize, deprioritize, filter, or avoid opportunities based on that inferred insight.",
    "- An explicit feedback reason or user-written comment is direct evidence. You may say Harper will lower the priority of exactly the factor the user explicitly rejected without asking a confirmation question. Do not broaden the factor beyond what the user actually said.",
    "- Opportunity-level feedback normally applies only to the reviewed posting or role. Exclude an entire company, or name it as a company-wide exclusion in a recommendation-tool request, only when the user's own reason/comment explicitly and unambiguously targets that company itself, its business, or its culture, or when persisted blocked-company context already contains it. An unexplained dislike, role mismatch, location/work-mode mismatch, already-applied status, expired-posting status, or an ambiguous combined label such as '회사 혹은 조건' does not authorize company-wide exclusion.",
    "- When the user did not provide a reason, it is good to ask one concrete question that will improve matching. Example: PM 역할인데 저장하셨네요. 현재는 개발자이신데 PM으로의 전환도 관심이 있으신가요 혹은 이전에 PM으로 일하셨던 경험이 있으신가요?",
    "- If several opportunities were disliked and no specific reasons were provided, acknowledge the count and ask what did not fit. Offer concrete choices such as role scope, company/domain, team style, seniority, location/work mode, or timing.",
    "Important: 유저를 너무 귀찮게 만들지 마라. 새로운 추론을 답변에 포함하지 않는다면 확인 질문도 생략할 수 있고, 감사 인사와 함께 이번 피드백을 하나의 신호로 참고하겠다고만 짧게 안내해도 된다. 새로운 추론을 답변에 포함한다면 위 규칙대로 확인 질문 하나가 반드시 따라와야 한다. 질문은 한 번에 하나만 한다.",
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
  const questionCount = callRequest.questions.length;
  const nextQuestionIndex = Math.min(
    Math.max(callRequest.questionProgress.nextQuestionIndex, 0),
    questionCount
  );
  const currentQuestion = callRequest.questions[nextQuestionIndex] ?? null;
  const followingQuestion =
    callRequest.questions[nextQuestionIndex + 1] ?? null;
  const candidateQuestionsAsked =
    callRequest.questionProgress.candidateQuestionsAsked;

  return [
    "## Highest-priority focused call objective",
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
    "- Ignore generic topic suggestions from recent chat, recommendations, onboarding, or ordinary career check-ins. They are background only and must never replace this call objective or its stored questions.",
    "- Do not directly say 'I will pass this to the company exactly like this.' Say something more natural, such as that the details are helpful, and if needed say Harper will reflect them.",
    "- For language questions, do not simply ask 'Is your English good?' Ask about a concrete situation where fluent communication may matter, or ask about specific language use or international experience.",
    "- Ask exactly one stored question at a time. Do not improvise a generic substitute or an optional follow-up. If the user did not understand, rephrase the same current question instead of advancing.",
    "",
    "Required opening:",
    "- Start by referencing the company and role.",
    "- Say the connection is already progressing.",
    "- Say the call is optional/non-evaluative and only helps Harper present them better.",
    currentQuestion
      ? "- Then ask the current required question immediately."
      : candidateQuestionsAsked
        ? "- The planned questions and candidate-question check are already complete; do not restart the opening."
        : "- The planned questions are complete; ask whether the user has questions about the company or next process.",
    "",
    "Persisted question progress:",
    `- nextQuestionIndex: ${nextQuestionIndex}`,
    `- questionCount: ${questionCount}`,
    `- candidateQuestionsAsked: ${candidateQuestionsAsked ? "yes" : "no"}`,
    `- currentRequiredQuestion: ${currentQuestion ?? "(all planned questions complete)"}`,
    `- followingRequiredQuestion: ${followingQuestion ?? "(none)"}`,
    "",
    "Strict turn progression:",
    ...(currentQuestion
      ? [
          `- If the current required question has not yet been asked or answered in the live conversation, ask it now: ${currentQuestion}`,
          followingQuestion
            ? `- If the latest user turn answers the current required question, acknowledge briefly and ask the following required question: ${followingQuestion}`
            : `- If the latest user turn answers the current required question, acknowledge briefly and ask whether they have questions about ${callRequest.companyName} or the next process.`,
          "- A user answer advances at most one planned question. Never skip ahead, reorder the plan, repeat an answered question, or switch to a generic career topic.",
        ]
      : candidateQuestionsAsked
        ? [
            "- The planned questions are complete and the candidate has already been invited to ask questions.",
            "- Answer any company/process question only from known context; do not invent facts. If they have no more questions, close naturally and call end_call.",
          ]
        : [
            `- Ask once whether the user has questions about ${callRequest.companyName} or the next process.`,
          ]),
    "",
    "Full question plan for reference. The persisted progress above decides which item is active:",
    ...callRequest.questions.map(
      (question, index) => `${index + 1}. ${question}`
    ),
    "",
    "Before ending:",
    `- You must ask exactly once, in ${outputLanguage}, whether the user has questions about ${callRequest.companyName} or the next process.`,
    "- End when you think the call is over or the user accepts or require to stop.",
    `- End with a natural short closing in ${outputLanguage}, then call the end_call tool. Do not hesitate to end the call with end_call.`,
  ].join("\n");
}

/**
 * Internal 포지션 수락시 추가적인 정보 질문을 위해 voice call을 진행할 때 사용되는 프롬프트
 */
export function buildInternalOpportunityCallWrapupInstruction(args: {
  callRequest: InternalOpportunityCallRequest;
  completionDisposition: "full" | "partial_answered" | "unanswered";
  durationLabel: string | null;
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
  const completionGuidance =
    args.completionDisposition === "full"
      ? [
          "- Say Harper will reflect the shared details when presenting them to the company.",
        ]
      : args.completionDisposition === "partial_answered"
        ? [
            "- Say the user ended the call partway through, but Harper will treat the necessary questions as sufficiently answered and close this call request.",
            "- Thank them for participating. Do not invite them to resume later or explain how to restart the call.",
          ]
        : [
            "- Say the call request remains open and they can resume by selecting Call from the + button in the chat when convenient.",
          ];

  return [
    "## Internal opportunity call wrap-up",
    "The user just ended a voice call for an accepted internal opportunity.",
    `- companyName: ${args.callRequest.companyName}`,
    `- roleTitle: ${args.callRequest.roleTitle}`,
    `- callDuration: ${args.durationLabel ?? "(unknown)"}`,
    `- completionDisposition: ${args.completionDisposition}`,
    "",
    "Tool instruction:",
    "- If the user disclosed clear profile facts, role-specific achievements, constraints, preferences, or resume/CV positioning context, call update_talent_profile before writing the wrap-up.",
    "- Do not call search, recommendation, company research, or activity-reading tools.",
    "",
    "Response instruction:",
    `- Write one short natural ${outputLanguage} follow-up message for the chat after the call ends.`,
    "- Say the connection is continuing.",
    ...completionGuidance,
    "- No heading, no bullets, 1-3 sentences.",
    "",
    "[Call transcript]",
    transcriptText || "(no transcript text)",
  ].join("\n");
}
