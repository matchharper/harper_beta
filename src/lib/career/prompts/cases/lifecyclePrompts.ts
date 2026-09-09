import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import type { CareerReengagementPendingAction } from "@/lib/career/pendingActions";
import {
  CAREER_REENGAGEMENT_ACTIONS_END,
  CAREER_REENGAGEMENT_ACTIONS_START,
} from "@/lib/career/reengagementActions";
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
    case "internal_opportunity_call":
      return `[actionKey:${action.actionKey}] [역할 관련 통화] ${action.companyName} · ${action.roleTitle}${
        action.reason ? `: ${action.reason}` : ""
      }`;
    case "career_check_in_call":
      return `[actionKey:${action.actionKey}] [커리어 체크인 통화] 최근 상황과 이직·구직 의향을 Harper와 이야기할 수 있음`;
    case "company_request":
      return `[actionKey:${action.actionKey}] [회사 요청] ${action.companyName} · ${action.roleTitle}: ${action.request}`;
    case "internal_opportunity":
      return `[actionKey:${action.actionKey}] [internal 연결 제안] ${action.companyName} · ${action.roleTitle}: 아직 응답 없음 · 추천 시각: ${formatCareerPromptKoreanDateTime(action.recommendedAt)}${
        action.recommendationSummary ? ` · ${action.recommendationSummary}` : ""
      }`;
    case "meeting_schedule":
      return `[actionKey:${action.actionKey}] [미팅 일정 요청] ${action.companyName} · ${action.roleTitle}: 회사가 가능한 시간 선택을 기다리고 있음`;
    case "reevaluation_question":
      return `[actionKey:${action.actionKey}] [reevaluation_criteria] ${action.question}`;
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

  const pendingActions = args.pendingActions ?? [];
  const pendingActionLines = pendingActions.length
    ? [
        "현재 참고할 수 있는 pending action:",
        ...pendingActions.map(
          (action) => `- ${formatReengagementPendingAction(action)}`
        ),
      ]
    : [];
  return [
    "## Session re-engagement",
    `사용자가 새 메시지를 보내지 않은 상태에서 Career에 다시 접속했다. 지금까지의 대화와 제공된 맥락을 보고 Harper가 먼저 보낼 자연스러운 ${outputLanguage} 메시지를 작성한다. 필요하면 적당히 길게 작성해도 된다.`,
    `- currentAccessAt: ${currentAccessAtLabel}`,
    `- previousChatAt: ${previousChatAtLabel}`,
    "시각은 한국 시간 기준 24시간제이며 내부 판단용이다. 사용자에게 날짜·시각·경과 시간을 말하거나 이전 대화를 방금 일처럼 표현하지 마라.",
    ...pendingActionLines,
    `맥락에 맞는 유용한 메시지를 만들 수 없으면 정확히 ${CAREER_SESSION_START_NO_MESSAGE_MARKER}만 출력한다.`,
    "본문에서 사용자가 바로 실행할 수 있는 선택을 제안했다면 아래 raw JSON 블록에 맞는 액션을 붙인다. 실행 선택이 없으면 블록을 생략하고 일반 CAREER_CHOICE_BUTTONS는 쓰지 않는다. 마커와 JSON은 코드 펜스 없이 출력한다.",
    CAREER_REENGAGEMENT_ACTIONS_START,
    '{"actions":[{"label":"사용자에게 보일 짧은 문구","action":{"type":"send_message","message":"클릭하면 사용자가 Harper에게 보낼 완전한 메시지"}},{"label":"사용자에게 보일 짧은 문구","action":{"type":"open_path","path":"/career/profile"}},{"label":"처리할 항목에 답하기","action":{"type":"open_pending_action","actionKey":"위에 제공된 정확한 actionKey"}},{"label":"통화 시작하기","action":{"type":"start_call","actionKey":"위에 제공된 통화 action의 정확한 actionKey"}}]}',
    CAREER_REENGAGEMENT_ACTIONS_END,
    "action block을 출력할 때 시작·종료 marker는 위 문자열을 ASCII 그대로 각각 한 번씩 별도 줄에 쓰고, 종료 marker 뒤에 다른 문자나 문장부호를 붙이지 않는다.",
    "액션은 본문에 맞는 것만 최대 4개까지 만든다. label과 실제 action의 대상·범위·전달 채널을 맞춘다. pending action을 열거나 통화를 시작할 때는 위에 제공된 정확한 actionKey를 사용한다. send_message는 즉시 전송돼도 자연스러운 완전한 문장으로 쓴다. open_path는 /career, /career/profile, /career/history, /career/watchlist와 그 하위 query만 쓴다.",
  ]
    .filter(Boolean)
    .join("\n");
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
    "- During the live voice call, persistent write tools were not available. Inspect only the user's statements in the call transcript below.",
    "- If the user disclosed a clear recommendation/contact subscription action, call `update_setting` before writing the wrap-up: stop_external for external/public postings only, stop_all for all Harper matching contact, or resume for recommendation/contact restart.",
    "- If the user's wording is a generic stop/unsubscribe that could mean either external postings only or all Harper matching contact, do not call `update_setting`; ask one clarifying question only if it fits the short follow-up.",
    "- If the user disclosed a clear recommendation batch-size change, call `update_talent_profile` with recommendationBatchSize before writing the wrap-up.",
    "- If the user disclosed clear new durable context that is missing from current state, call `write_talent_context` before writing the wrap-up. Use `update_talent_profile` only for structured profile-row details or recommendation batch size.",
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
        "- If the internal opportunity was disliked, acknowledge that decision and do not use the acceptance guidance below. Follow any rejection-specific context provided for this turn.",
        "- For a dislike, keep the reply proportional to the user's stated reason and the recorded outcome. Do not explain a future process unless the user needs a concrete next step.",
        "- If the internal opportunity was liked, treat it as confirmed acceptance. Thank them briefly and do not ask whether to connect/proceed again.",
        "- Say the acceptance is recorded and Harper will share or introduce the candidate's profile and relevant experience with the company and help make the connection.",
        "- Use future tense until actual company sharing is verified, but do not volunteer a disclaimer that profile sharing or company connection is not immediate or confirmed. Never expose Harper's internal confirmation or handoff process. Say Harper will send progress updates by email without promising a fixed number of days.",
        "- Frame the process as Harper mediating a better-fit connection, not as a normal application.",
        "- If the profile context shows no resume file/link, mention that a resume usually improves review and companies often ask for it. Ask whether Harper should tell the company there is no updated resume yet, and invite them to upload one if they have it.",
        "- If the accepted opportunity visibly conflicts with known preferences or needs, ask one focused question about that mismatch. Example: current location vs role location, company/domain, role scope, or timing.",
        "예시 (실제 답변에서는 사용자 이름/회사명/역할명과 맥락에 맞게 자연스럽게 변형해라. markdown 강조와 줄바꿈을 적절히 사용해라.)",
        "[이름]님, **[회사명] [역할명]** 연결 제안 수락해주셔서 감사해요.",
        "",
        "이 건은 일반적인 공고 지원이라기보다, Harper가 양쪽의 관심이 잘 맞는지 확인하고 소개를 조율하는 연결에 가까워요.",
        "",
        "수락 의사가 반영됐어요. 이제 Harper가 [이름]님의 프로필과 관련 경험을 회사에 잘 소개하고, 실제 연결까지 도와드릴게요.",
        "",
        "진행 상황이나 추가로 확인할 내용이 생기면 이메일로 안내드릴게요. 따로 지원서를 다시 넣으실 필요는 없습니다.",
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
    "- If the user disclosed clear durable context, call write_talent_context before writing the wrap-up. Use update_talent_profile only for structured profile fields or row memos.",
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
