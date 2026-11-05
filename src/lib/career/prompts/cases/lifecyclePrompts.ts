import { formatInternalCallQuestionContext } from "@/lib/talentOnboarding/internalOpportunityCallProgress";
import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import type { CareerReengagementPendingAction } from "@/lib/career/pendingActions";
import { prependCareerReengagementAction } from "@/lib/career/reengagementActions";
import { careerT } from "@/lib/career/translatedCareerMessage";
import {
  formatCareerPromptKoreanDateTime,
  normalizeCareerPromptTimeZone,
  type CareerPromptDateTimeOptions,
} from "@/lib/career/prompts/promptUtils";
import {
  CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER,
  type CareerOpportunityFeedbackFollowUpTrigger,
  type CareerTranscriptEntry,
} from "@/lib/career/prompts/types";
import type { InternalOpportunityCallRequest } from "@/lib/talentOnboarding/internalOpportunityCallRequest";
import type { CareerConversationStarterId } from "@/lib/career/prompts/conversationStarters";
import { logger } from "@/utils/logger";

import { CAREER_SESSION_START_NO_MESSAGE_MARKER } from "@/lib/career/noMessageContent";
export { CAREER_SESSION_START_NO_MESSAGE_MARKER } from "@/lib/career/noMessageContent";
export const CAREER_SESSION_START_CALL_ACTION_MARKER = "[[CALL]]";

function formatReengagementPendingAction(
  action: CareerReengagementPendingAction,
  dateTimeOptions?: CareerPromptDateTimeOptions
) {
  switch (action.kind) {
    case "internal_opportunity_call":
      return `[actionKey:${action.actionKey}] [역할 관련 통화] ${action.companyName} · ${action.roleTitle}${
        action.reason ? `: ${action.reason}` : ""
      }`;
    case "career_check_in_call":
      return `[actionKey:${action.actionKey}] [최근 변화를 듣기 위한 통화 제안] Harper가 최근 일·커리어 상황에서 달라진 점이 있는지 통화로 편하게 듣고 싶어 함`;
    case "company_request":
      return `[actionKey:${action.actionKey}] [회사 요청] ${action.companyName} · ${action.roleTitle}: ${action.request}`;
    case "internal_opportunity":
      return `[actionKey:${action.actionKey}] [internal 연결 제안] ${action.companyName} · ${action.roleTitle}: 아직 응답 없음 · 추천 시각: ${formatCareerPromptKoreanDateTime(action.recommendedAt, dateTimeOptions)}${
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
  recentReengagementHistory?: string[];
  timeZone?: string | null;
}) {
  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  const timeZone = normalizeCareerPromptTimeZone(args.timeZone);
  const dateTimeOptions = {
    preferredLocale: args.preferredLocale,
    timeZone,
  };
  const currentAccessAtLabel = formatCareerPromptKoreanDateTime(
    args.currentAccessAt,
    dateTimeOptions
  );
  const previousChatAtLabel = formatCareerPromptKoreanDateTime(
    args.previousChatAt,
    dateTimeOptions
  );

  logger.log("buildCareerSessionStartTurnInstruction", {
    currentAccessAt: currentAccessAtLabel,
    previousChatAt: previousChatAtLabel,
  });

  if (!args.isOnboardingDone) {
    return [
      "## Session-start assistant turn",
      `응답 언어는 사용자가 저장한 언어인 ${outputLanguage}이다. 이전 대화에서 그 답 하나만 다른 언어로 부탁한 것은 이번 발화에 이어가지 않는다.`,
      "사용자가 방금 Career 화면에 다시 접속했다. 사용자가 아직 새 메시지를 보내지 않았지만, Harper가 먼저 짧게 말을 건넬 수 있는 차례다.",
      `- currentAccessAt: ${currentAccessAtLabel}`,
      `- previousChatAt: ${previousChatAtLabel}`,
      `위 시각 값은 모두 사용자의 현재 접속 지역 타임존(${timeZone}) 기준 24시간제다. 예를 들어 22:46을 10:46으로 변환하지 마라.`,
      "'방금'은 현재 화면 접속만 뜻한다. 이전 대화 시각과 혼동하지 말고, 이전 대화가 오늘이 아니면 그 대화를 '방금' 또는 '조금 전'이라고 표현하지 마라.",
      "중요: 위의 정확한 날짜/시각과 경과 시간은 내부 판단용 정보다. 사용자에게 정확한 날짜, 시각, 경과 시간, 시각 비교를 직접 또는 괄호로 절대 말하지 마라. '몇 시간/며칠 만에'처럼 경과 시간을 유추해서도 말하지 마라.",
      "이번 발화는 다시 방문한 사용자를 자연스러운 인사로 맞이하며 새로 대화를 여는 차례다. 이전 대화는 과거 맥락이며, 마지막 답변의 뒷부분을 이어 쓰거나 과거 사용자 발화를 새 요청으로 취급하지 않는다.",
      "이어갈 실제 질문이 있으면 인사 뒤에 자연스럽게 연결한다. 질문할 필요가 없다면 no-message 규칙을 따른다. 온보딩, 인터뷰, 미완료 상태는 사용자에게 설명하지 마라.",
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
          (action) =>
            `- ${formatReengagementPendingAction(action, dateTimeOptions)}`
        ),
      ]
    : [];
  const recentReengagementHistory = (args.recentReengagementHistory ?? [])
    .map((message) => message.replace(/\s+/g, " ").trim().slice(0, 2000))
    .filter(Boolean)
    .slice(-3);
  const reengagementHistoryLines = recentReengagementHistory.length
    ? [
        "최근 re-engagement history (오래된 순):",
        ...recentReengagementHistory.map((message) => `- ${message}`),
      ]
    : [];
  return [
    "## Session re-engagement",
    `사용자가 새 메시지를 보내지 않은 상태에서 Career에 다시 접속했다. 재접속 자체는 새 요청이나 추가 동의가 아니다. 대화와 기록에 남은 사용자 목적·선호·제약과 이미 위임한 일을 현재 상태에 이어서 적용하고, 지금 알아두거나 행동할 것이 있는지 판단한다. 대화가 도움이 되면 ${outputLanguage}로 자연스럽게 말을 건넬 수 있다.`,
    "사용자의 목적·관심사·현재 맥락을 바탕으로 지금 도움이 될 만한 할 일 혹은 미완료 작업을 스스로 제안하고, manage_action_items로 실제 할 일 목록에 남긴다. 사용자가 새 메시지를 보내지 않아도 홈에서 제안을 발견하고 시작할 수 있어야 한다. 현재 목록을 함께 살펴 해결되거나 달라진 항목은 삭제·수정하고 같은 목적을 중복 생성하지 않는다. 유용한 항목이 없으면 빈 목록을 유지해도 된다. 목록 정리와 채팅 발화 여부는 별개이며, 목록만 갱신하고 no-message로 끝낼 수 있다.",
    "제공된 매칭 결과와 현재 관심사·추천 이력을 보고 소개할 가치가 있는 포지션이 있다면, 말로만 기회를 언급하기보다 가능하면 upsert_opportunities로 실제 추천 목록에 반영한다. 기존 결과가 부족하거나 현재 방향과 맞지 않으면 추가 결과를 읽거나 새로 검색할 수 있다. 마지막 검색과 평가 시점, 진행 중인 작업, 최근 대화와 미결정 사항을 참고해 지금 도움이 되는 행동을 판단한다.",
    `- currentAccessAt: ${currentAccessAtLabel}`,
    `- previousChatAt: ${previousChatAtLabel}`,
    "위 접속·대화 시각은 24시간제이며 내부 판단용이다. 접속 간격을 사용자에게 설명하거나 이전 대화를 방금 일처럼 표현하지 마라. 실제 마감·약속 시각은 행동 판단에 필요한 원본 사실이다.",
    ...reengagementHistoryLines,
    ...pendingActionLines,
    `맥락에 맞는 유용한 메시지를 만들 수 없으면 정확히 ${CAREER_SESSION_START_NO_MESSAGE_MARKER}만 출력한다.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCareerCallWrapupTurnInstruction(args: {
  callNoteCreated?: boolean;
  callNoteUpdated?: boolean;
  conversationStarterId?: CareerConversationStarterId | null;
  durationLabel: string | null;
  isOnboardingDone?: boolean;
  preferredLocale?: string | null;
  transcript: CareerTranscriptEntry[];
}) {
  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  const isCareerCoaching = args.conversationStarterId === "career_coaching";
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
    "",
    "Important tool instruction:",
    "- Persistent tools may already have been used during the live call. Compare the user's statements below with current state and never repeat a write that is already reflected.",
    "- If the user disclosed a clear recommendation/contact subscription action, call `update_setting` before writing the wrap-up: stop_external for external/public postings only, stop_all for all Harper matching contact, or resume for recommendation/contact restart.",
    "- If the user's wording is a generic stop/unsubscribe that could mean either external postings only or all Harper matching contact, do not call `update_setting`; ask one clarifying question only if it fits the short follow-up.",
    "- Use current schedules and the user’s actual request for future timing. Do not write a fixed recommendation quota into the profile.",
    "- If the user disclosed clear new durable context that is missing from current state, call `write_talent_context` before writing the wrap-up. Use `update_talent_profile` only for structured profile-row details or recommendation batch size.",
    ...(isCareerCoaching
      ? [
          "- In this career-coaching call, write only durable user facts or decision criteria the user explicitly confirmed. Apply an explicit batch-size or subscription change through its designated tool. Do not store Harper's support plan itself as Memory, and do not save a hypothesis, an interpretation awaiting approval, or a merely proposed plan as settled context.",
        ]
      : []),
    "- These tool calls are optional. Skip them when there is no clear new writable information, the information is already saved, or the statement was only casual/uncertain.",
    "- Do not call search, recommendation, company research, service-help, open-role, or activity-reading tools in this wrap-up turn.",
    "",
    "Response instruction:",
    `- Write one short natural ${outputLanguage} follow-up message for the chat after the call ends.`,
    `- ${isCareerCoaching ? "1-3" : "1-2"} sentences, no heading, no bullets, no markdown card.`,
    isCareerCoaching
      ? "- Preserve the useful ending of the call: restate the concrete Harper support plan the user approved, or the genuinely consequential user action they agreed to. If Harper proposed a support plan but the call ended before the user approved it, clearly keep it as a proposal and ask only for that confirmation in chat. Do not invent a new task, agreement, criterion, or action."
      : "- Do not ask a new interview-style question. The call has ended.",
    ...(isCareerCoaching
      ? [
          "- Never turn journaling, reflection, arbitrary list-making, writing questions for oneself, undirected job browsing, or generic networking into the next action.",
          "- If there was no approved plan or genuinely consequential action, briefly preserve the clarified decision or tradeoff without manufacturing homework.",
        ]
      : []),
    isCareerCoaching
      ? "- Do not append a generic promise about future matching or a warm closing task. Say only what the transcript and current state support."
      : args.isOnboardingDone
        ? "- If the call had useful substance, thank them and say Harper will reflect what they shared in future matching/search."
        : "- Say briefly that Harper still needs a little more basic profile or preference context, and invite the user to continue from here in this chat. Do not imply the user must start another call.",
    "- Mention a call note only when the verified call-note fact below is present.",
    ...(args.callNoteCreated || args.callNoteUpdated
      ? [
          "",
          "Verified call-note fact:",
          args.callNoteUpdated
            ? "- The user's existing call note was successfully updated with this conversation. Naturally tell the user that Harper added this conversation to that call note and that they can find it under Documents in their profile."
            : "- A call note for this conversation was successfully saved. Naturally tell the user that Harper organized this conversation into a call note and that they can find it under Documents in their profile.",
        ]
      : []),
    "- Do not claim you updated settings, profile, Brief, or Memory unless the relevant tool was actually called and returned a successful change.",
    "",
    "[Call transcript for this wrap-up]",
    lines || "(no transcript text)",
  ].join("\n");
}

export function appendCareerCallNoteCreatedNotice(args: {
  callNoteCreated?: boolean;
  callNoteUpdated?: boolean;
  content: string;
  preferredLocale?: string | null;
}) {
  if (!args.callNoteCreated && !args.callNoteUpdated) return args.content;

  const notice = args.callNoteUpdated
    ? careerT(
        args.preferredLocale,
        "career.call.wrapup_fallback.call_note_updated",
        "기존 콜노트에 이번 대화도 이어서 정리해뒀어요. 프로필의 문서에서 확인하실 수 있어요."
      )
    : careerT(
        args.preferredLocale,
        "career.call.wrapup_fallback.call_note_created",
        "이번 대화는 콜노트로 정리해뒀어요. 프로필의 문서에서 확인하실 수 있어요."
      );
  return [args.content.trim(), notice].filter(Boolean).join(" ");
}

export function appendCareerCallNoteOpenAction(args: {
  content: string;
  documentId?: string | null;
  preferredLocale?: string | null;
  title?: string | null;
}) {
  const documentId = String(args.documentId ?? "").trim();
  const title = String(args.title ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!documentId || !title) return args.content;

  return prependCareerReengagementAction(args.content, {
    label: careerT(
      args.preferredLocale,
      "career.call.wrapup.call_note_action",
      "콜노트 보기 · {title}",
      { values: { title } }
    ),
    action: {
      type: "open_path",
      path: `/career/profile?profileSection=links&callNoteId=${encodeURIComponent(documentId)}`,
    },
  });
}

export function buildCareerCallWrapupFallbackFollowUp(args: {
  callNoteCreated?: boolean;
  callNoteUpdated?: boolean;
  conversationStarterId?: CareerConversationStarterId | null;
  isOnboardingDone?: boolean;
  preferredLocale?: string | null;
}) {
  let content: string;
  if (!args.isOnboardingDone) {
    content = careerT(
      args.preferredLocale,
      "career.call.wrapup_fallback.onboarding_remaining",
      "아직 온보딩이 조금 남아 있어요. 통화가 끊긴 지점부터 이 채팅에서 이어서 마무리하면, 그 기준으로 좋은 기회를 찾아드릴게요."
    );
  } else if (args.conversationStarterId === "career_coaching") {
    content = careerT(
      args.preferredLocale,
      "career.call.wrapup_fallback.career_coaching",
      "오늘 이야기에서 선명해진 고민과 다음 방향은 이어서 참고할게요. 확인하지 않은 결론이나 할 일을 임의로 덧붙이지 않을게요."
    );
  } else {
    content = careerT(
      args.preferredLocale,
      "career.call.wrapup_fallback.completed",
      "좋은 이야기 들려주셔서 감사합니다. 말씀해주신 내용을 바탕으로 만족하실 만한 기회를 잘 골라서 가져와볼게요."
    );
  }

  return appendCareerCallNoteCreatedNotice({
    callNoteCreated: args.callNoteCreated,
    callNoteUpdated: args.callNoteUpdated,
    content,
    preferredLocale: args.preferredLocale,
  });
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
  return [
    "## Career turn after a saved opportunity decision",
    `Event source: ${args.trigger}. Respond in ${outputLanguage}. The candidate responded through an opportunity button; the saved decision is their latest action in this conversation.`,
    "Continue helping with the opportunity from the saved decision and conversation, using the shared opportunity guidance. The saved decision is already executed.",
    "If there is nothing to say, return only [[CAREER_FEEDBACK_SILENT]].",
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
  return [
    "## Accepted internal opportunity call",
    "This optional, non-evaluative call helps Harper introduce the caller to the company below. The connection continues independently of this call.",
    `Speak in ${getCareerPromptLanguageName(callRequest.preferredLocale)} unless the caller switches languages.`,
    "Use this company and role as the call's subject. Start naturally with this purpose and one useful unanswered question, rather than a generic career conversation.",
    "Use the question plan and the actual conversation to choose the next move. Ask one question at a time, clarify when useful, and accept a caller's uncertainty, lack of experience, refusal, or choice to skip without pressing for a different answer.",
    "Call record_call_answers when the caller responds, before moving on. Record their meaning faithfully, including 'I don't know' or declining. A response may cover several questions; record each relevant number. Corrections update the same question number. Do not invent a response for an untouched question.",
    "Recorded questions do not need to be asked again. Saving can lag behind speech: use the latest conversation and tool results, and never repeat a question just because an older snapshot is missing its response. If the tool failed, the response is not yet saved.",
    "When the planned questions have been addressed, allow room for any company/process questions the caller has, then close naturally with end_call(complete_onboarding=false). Use the conversation to avoid repeating a closing invitation. An explicit request to stop takes priority over further questions; end_call is always available even with unanswered questions.",
    "Answer company/process questions from verified facts only. The connection is already proceeding, so no new permission to introduce the caller is needed. Do not equate recorded refusals with substantive answers or claim the company has read or accepted anything.",
    "",
    formatInternalCallQuestionContext(callRequest),
  ].join("\n\n");
}

/**
 * Internal 포지션 수락시 추가적인 정보 질문을 위해 voice call을 진행할 때 사용되는 프롬프트
 */
export function buildInternalOpportunityCallWrapupInstruction(args: {
  callNoteCreated?: boolean;
  callNoteUpdated?: boolean;
  callRequest: InternalOpportunityCallRequest;
  questionsComplete: boolean;
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
  const completionGuidance = args.questionsComplete
    ? "All planned questions have a recorded response (including any uncertainty or refusal); the optional request is complete."
    : "Some questions have no recorded response. The optional request stays open; preserve recorded responses for any later continuation. Do not describe unfinished questions as answered or infer that the user chose to stop rather than losing the connection.";

  return [
    "## Internal opportunity call wrap-up",
    "The user just ended a voice call for an accepted internal opportunity.",
    `- companyName: ${args.callRequest.companyName}`,
    `- roleTitle: ${args.callRequest.roleTitle}`,
    `- callDuration: ${args.durationLabel ?? "(unknown)"}`,
    completionGuidance,
    formatInternalCallQuestionContext(args.callRequest),
    "",
    "Tool instruction:",
    "- If the user disclosed clear durable context, call write_talent_context before writing the wrap-up. Use update_talent_profile only for structured profile fields or row memos.",
    "- Do not call search, recommendation, company research, or activity-reading tools.",
    "",
    "Response instruction:",
    `- Write one short natural ${outputLanguage} follow-up message for the chat after the call ends.`,
    "- Say the connection is continuing.",
    "- Mention a call note only when the verified call-note fact below is present.",
    ...(args.callNoteCreated || args.callNoteUpdated
      ? [
          "",
          "Verified call-note fact:",
          args.callNoteUpdated
            ? "- The user's existing call note was successfully updated with this conversation. Naturally tell the user that Harper added this conversation to that call note and that they can find it under Documents in their profile."
            : "- A call note for this conversation was successfully saved. Naturally tell the user that Harper organized this conversation into a call note and that they can find it under Documents in their profile.",
        ]
      : []),
    "- No heading, no bullets, 1-3 sentences.",
    "",
    "[Call transcript]",
    transcriptText || "(no transcript text)",
  ].join("\n");
}
