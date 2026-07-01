import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import { careerT } from "@/lib/career/translatedCareerMessage";
import {
  formatCareerPromptKoreanDateTime,
  parseCareerPromptTimestampMs,
} from "@/lib/career/prompts/promptUtils";
import type {
  CareerOpportunityFeedbackFollowUpTrigger,
  CareerTranscriptEntry,
} from "@/lib/career/prompts/types";

export const CAREER_SESSION_START_NO_MESSAGE_MARKER = "__NO_SESSION_GREETING__";
export const CAREER_SESSION_START_CALL_ACTION_MARKER = "[[CALL]]";

/**
 * N시간 이후 재접속시 자동으로 먼저 인사하도록 하는 것
 */
export function buildCareerSessionStartTurnInstruction(args: {
  currentAccessAt: string;
  idleMs: number;
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
    `hoursSincePreviousChat이 1344 이상이고, 최근 활동/추천/프로필 변경에서 바로 이어갈 만한 명확한 업데이트가 없다면 "오랜만이라 최근 업데이트나 재밌게 하는 일이 있는지 통화로 한번 듣고 싶다"는 취지로 자연스럽게 말한 뒤 응답 맨 끝에 ${CAREER_SESSION_START_CALL_ACTION_MARKER} 를 붙여라.`,
    `${CAREER_SESSION_START_CALL_ACTION_MARKER} 는 UI가 전화하기 버튼을 표시하는 데 쓰는 마커다. 이 마커를 설명하거나 따옴표로 감싸지 마라.`,
    "텍스트 채팅에 표시되므로 필요하면 회사명, 역할명, 방향성 같은 핵심 단어에 가벼운 inline markdown 강조(**...**)를 사용해라.",
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
    `- onboardingStatus: ${args.isOnboardingDone ? "completed" : "not_completed"}`,
    "",
    "Important tool instruction:",
    "- During the live voice call, `update_setting` and `update_talent_profile` were not available. Inspect only the user's statements in the call transcript below.",
    "- If the user disclosed clear recommendation delivery setting changes, call `update_setting` before writing the wrap-up.",
    "- If the user disclosed clear new durable preferences, constraints, recommendation memory, or profile-row details that are missing from current state, call `update_talent_profile` before writing the wrap-up.",
    "- These tool calls are optional. Skip them when there is no clear new writable information, the information is already saved, or the statement was only casual/uncertain.",
    "- Do not call search, recommendation, company research, service-help, open-role, or activity-reading tools in this wrap-up turn.",
    "",
    "Response instruction:",
    `- Write one short natural ${outputLanguage} follow-up message for the chat after the call ends.`,
    "- 1-2 sentences, no heading, no bullets, no markdown card.",
    "- Do not ask a new onboarding/interview question. The call has ended.",
    "- If onboarding is not completed, say briefly that there is a little more to finish and invite the user to continue from here in this chat.",
    "- For incomplete onboarding, do not imply the user must start another call. The primary next step is continuing by chat.",
    "- If onboarding is completed and the call had useful substance, thank them and say Harper will reflect what they shared in future matching/search.",
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

export function buildCareerOpportunityFeedbackFollowUpTurnInstruction(args: {
  preferredLocale?: string | null;
  trigger: CareerOpportunityFeedbackFollowUpTrigger;
}) {
  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  const clearedOpportunityGuidance =
    args.trigger === "all_recommended_opportunities_cleared"
      ? [
          "",
          "Cleared-position-tab trigger:",
          "- The user has just accepted or rejected the last remaining item in the New Positions tab. There are now zero remaining newly recommended opportunities.",
          `- Say, in natural ${outputLanguage}, that there are no remaining recommended opportunities to review right now.`,
          "- Action guide: if the previous conversation and feedback history provide enough signal, call `recommend_job_postings` to find a fresh batch based on that history; if a required preference is missing or you wanna get confirmation about what you guessed based on the feedbacks before recommending, ask exactly one necessary question instead.",
          "- This should feel like Harper is using the user's prior feedback, not like a hard-coded automatic refresh.",
        ]
      : [];

  return [
    "## Opportunity feedback proactive assistant turn",
    `Always write the user-visible reply in ${outputLanguage}, using markdown`,
    "The user clicked like/dislike on one or more recommended opportunities. They did not send a new chat message. It is Harper's turn to proactively respond using the normal career/chat behavior and tool policy.",
    `TRIGGER: ${args.trigger}`,
    ...clearedOpportunityGuidance,
    "",
    "Use the pending opportunity feedback context in this system prompt. It contains role/company details; do not reduce it to only counts.",
    "Do not overreact to one click. For multiple clicks, summarize the visible pattern once.",
    "It's good to ask a question to get to know more about the user's preferences or background experience. ex) PM 역할인데 저장하셨네요. 현재는 개발자이신데 PM으로의 전환도 관심이 있으신가요 혹은 이전에 PM으로 일하셨던 경험이 있으신가요?",
    "ex. internal accept시 아래 기준으로 안내문구가 나간 이후 Agent Engineer를 저장하셨는데 이력에 현재 Agentic Engineering을 하고계시다고 되어있네요. 하지만 구체적으로 어떤걸 하시는지를 더 알면 좋을 것 같아요. 알려주실 수 있나요?",
    "or if the liked/disliked opportunities share a visible company/domain/role/work-mode pattern, mention that pattern carefully as a hypothesis, not a fact and say that Harper will keep sending similar matches. Example tone: '이 방향이 잘 맞으시는 것 같네요. 비슷한 분위기 매칭 계속 보내드릴게요.'",
    "",
    "Feedback-specific rules:",
    "- If several opportunities were disliked and no specific reasons were provided, acknowledge the count and ask what did not fit. Offer concrete choices such as role scope, company/domain, team style, seniority, location/work mode, or timing.",
    "- If internal connection/request opportunities were liked, treat that as confirmed acceptance. Thank them briefly, say Harper will proceed with the company-side introduction, and do not ask whether to connect/proceed again. explain that Harper will time the introduction thoughtfully and company-side schedules can take a little time. Frame it as Harper mediating a better-fit connection, not as a normal application.",
    "- For internal accepted feedback, Keep the company-side process update separate from any follow-up question. Do not say the process continues 'regardless of what I am saying now'; say plainly that the connection process will proceed independently.",
    "- and if the profile context shows no resume file/link, mention that a resume usually improves review and companies often ask for it. Ask whether Harper should tell the company there is no updated resume yet, and invite them to upload one if they have it.",
    "",
    "- For accepted feedback, 너가 아는 유저의 선호/니즈와 다른 부분이 있다면 그 부분에 대해서 물어봐라. ex. current location - role location mismatch, company/domain, etc.",
  ].join("\n");
}
