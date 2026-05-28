import { TALENT_ONBOARDING_ADDITIONAL_QUESTION_MAX } from "@/lib/talentOnboarding/onboarding";
import {
  getOpenAIChatTools,
  getRealtimeTools,
  getStopAfterTalentToolNames,
  getTalentToolVoicePreambles,
  TALENT_TOOL_NAMES,
  type TalentToolChannel,
} from "@/lib/talentOnboarding/tools";

export type CareerOpenAIChatTool = ReturnType<
  typeof getOpenAIChatTools
>[number];
export type CareerRealtimeTool = ReturnType<typeof getRealtimeTools>[number];

export type CareerChatToolSelectionArgs = {
  additionalQuestionSelectionCount?: number | null;
  allowedToolNames?: readonly string[] | null;
  channel?: TalentToolChannel | null;
  isOnboardingDone?: boolean | null;
};

export type CareerRealtimeToolSelectionArgs = {
  candidateTools?: readonly CareerRealtimeTool[] | null;
  enabledToolNames?: readonly string[] | null;
};

// /career LLM에 실제로 넘길 tool 목록을 고르는 곳.
//
// 주의:
// - tool의 schema와 실행 함수는 talentOnboarding/tools.ts에 있다.
// - 이 파일은 "어떤 상황의 LLM 호출에 어떤 tool을 노출할지"만 정한다.
// - 아래 목록에서 tool을 빼면 그 상황의 LLM tools에는 들어가지 않는다.
// - 단, registry 쪽에서 disabled 된 tool은 여기에 넣어도 최종 노출되지 않는다.
export const CAREER_CHAT_ONBOARDING_TOOL_NAMES = [
  // 온보딩 중 사용자가 말한 프로필 row memo / 추천 주기 같은 저장 가능한 정보 기록.
  TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE,
  // 온보딩 텍스트 채팅에서 사용자가 URL을 줬을 때만 페이지 본문 확인.
  TALENT_TOOL_NAMES.OPEN_URL,
  // 온보딩 Additional questions 단계에서 다음 질문을 고르는 내부 selector.
  // 아래 canSelectAdditionalOnboardingQuestion 조건도 통과해야 들어간다.
  TALENT_TOOL_NAMES.SELECT_ADDITIONAL_ONBOARDING_QUESTION,
] as const;

export const CAREER_CHAT_VOICE_ONBOARDING_TOOL_NAMES = [
  // /api/talent/chat 이 voice channel로 호출될 때의 온보딩 tool.
  // voice 온보딩에서는 URL 열기나 additional-question selector를 노출하지 않는다.
  TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE,
] as const;

// 온보딩 완료 후 텍스트 채팅에서 노출할 tool allowlist.
// recommend_companies는 registry에는 있지만 Watchlist 추천 UI가 숨겨진 동안 의도적으로 제외한다.
export const CAREER_CHAT_POST_ONBOARDING_TOOL_NAMES = [
  // 최신/외부 웹 정보가 필요한 질문용. 예: 최근 투자, 최신 뉴스.
  TALENT_TOOL_NAMES.WEB_SEARCH,
  // 사용자가 특정 URL을 주고 읽어달라고 할 때.
  TALENT_TOOL_NAMES.OPEN_URL,
  // 새 추천 공고를 찾아 저장할 때. 예: "미국 AI PM 공고 찾아줘".
  TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS,
  // 이미 추천/저장된 opportunity 이력을 읽을 때.
  // 예: "지난번 추천한 토스 공고 링크 뭐였지?"
  TALENT_TOOL_NAMES.READ_RECOMMENDED_OPPORTUNITIES,
  // 추천된 특정 포지션을 저장함/선호하지 않음으로 보낼 때.
  TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK,
  // 특정 회사 자체를 조사할 때. 예: "A 회사 어떤 회사야?"
  TALENT_TOOL_NAMES.RESEARCH_COMPANY,
  // Ops가 관리하는 "유저 질문 -> 좋은 답변 예시" 검색용.
  TALENT_TOOL_NAMES.LOOKUP_ANSWER_EXAMPLES,
  // 현재 열려 있는 role 목록을 조회할 때.
  // 회사명을 주면 그 회사의 open roles, 회사명이 없으면 추천된 role 중심으로 조회한다.
  TALENT_TOOL_NAMES.GET_OPEN_ROLES,
  // 최근 프로필/선호 변경, follow/unfollow 등 Career activity를 읽을 때.
  TALENT_TOOL_NAMES.READ_TALENT_ACTIVITY_EVENTS,
  // 온보딩 후에도 사용자가 "앞으로 리모트만", "추천 그만"처럼 저장할 선호를 말할 때.
  TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE,
] as const;

export const CAREER_REALTIME_VOICE_ONBOARDING_TOOL_NAMES: readonly string[] =
  [];

// 실시간 voice call에서 온보딩 완료 후 노출 가능한 tool.
// 음성에서는 긴 페이지 본문이나 카드 UI가 필요한 tool은 빼고,
// 짧게 말로 답할 수 있는 tool만 둔다.
export const CAREER_REALTIME_VOICE_POST_ONBOARDING_TOOL_NAMES = [
  // 통화 중 최신 외부 정보가 꼭 필요할 때.
  TALENT_TOOL_NAMES.WEB_SEARCH,
  // 통화 중 이미 추천된 opportunity를 짧게 확인할 때.
  TALENT_TOOL_NAMES.READ_RECOMMENDED_OPPORTUNITIES,
] as const;

function normalizeToolNames(toolNames?: readonly string[] | null) {
  if (!Array.isArray(toolNames)) return [];
  return toolNames
    .map((name) => String(name ?? "").trim())
    .filter((name) => name.length > 0);
}

function getOpenAIChatToolName(tool: CareerOpenAIChatTool) {
  return tool.function.name;
}

function isListedToolName(toolNames: readonly string[], toolName: string) {
  return toolNames.includes(toolName);
}

function applyAllowedToolNames<T>(
  tools: readonly T[],
  getName: (tool: T) => string,
  allowedToolNames?: readonly string[] | null
) {
  const allowedNames = normalizeToolNames(allowedToolNames);
  if (allowedNames.length === 0 && Array.isArray(allowedToolNames)) return [];
  if (allowedNames.length === 0) return [...tools];

  const allowedNameSet = new Set(allowedNames);
  return tools.filter((tool) => allowedNameSet.has(getName(tool)));
}

function canSelectAdditionalOnboardingQuestion(
  additionalQuestionSelectionCount: number | null | undefined
) {
  return (
    typeof additionalQuestionSelectionCount === "number" &&
    Number.isFinite(additionalQuestionSelectionCount) &&
    additionalQuestionSelectionCount < TALENT_ONBOARDING_ADDITIONAL_QUESTION_MAX
  );
}

function shouldExposeCareerChatTool(
  toolName: string,
  args: CareerChatToolSelectionArgs
) {
  const channel = args.channel === "voice" ? "voice" : "chat";
  const isOnboardingActive = !Boolean(args.isOnboardingDone);

  if (isOnboardingActive) {
    if (channel === "voice") {
      return isListedToolName(
        CAREER_CHAT_VOICE_ONBOARDING_TOOL_NAMES,
        toolName
      );
    }

    if (toolName === TALENT_TOOL_NAMES.SELECT_ADDITIONAL_ONBOARDING_QUESTION) {
      return canSelectAdditionalOnboardingQuestion(
        args.additionalQuestionSelectionCount
      );
    }

    return isListedToolName(CAREER_CHAT_ONBOARDING_TOOL_NAMES, toolName);
  }

  return isListedToolName(CAREER_CHAT_POST_ONBOARDING_TOOL_NAMES, toolName);
}

export function resolveCareerChatTools(args: CareerChatToolSelectionArgs) {
  const selectedTools = applyAllowedToolNames(
    getOpenAIChatTools("chat").filter((tool) =>
      shouldExposeCareerChatTool(getOpenAIChatToolName(tool), args)
    ),
    getOpenAIChatToolName,
    args.allowedToolNames
  );
  const toolNames = selectedTools.map(getOpenAIChatToolName);
  const toolNameSet = new Set(toolNames);
  const stopAfterToolNames = getStopAfterTalentToolNames("chat").filter(
    (name) => toolNameSet.has(name)
  );

  return {
    stopAfterToolNames,
    toolNames,
    tools: selectedTools,
  };
}

export function getCareerRealtimeToolCandidates() {
  const enabledVoiceToolNames = new Set<string>(
    CAREER_REALTIME_VOICE_POST_ONBOARDING_TOOL_NAMES
  );
  return getRealtimeTools("voice").filter((tool) =>
    enabledVoiceToolNames.has(tool.name)
  );
}

export function getCareerRealtimeCandidateToolNames() {
  return getCareerRealtimeToolCandidates().map((tool) => tool.name);
}

export function getCareerRealtimeToolVoicePreambles(
  toolNames: readonly string[]
) {
  const toolNameSet = new Set(toolNames);
  return Object.fromEntries(
    Object.entries(getTalentToolVoicePreambles("voice")).filter(([name]) =>
      toolNameSet.has(name)
    )
  );
}

export function resolveCareerRealtimeTools(
  args: CareerRealtimeToolSelectionArgs
) {
  const enabledToolNames = normalizeToolNames(args.enabledToolNames);
  const enabledToolNameSet = new Set(enabledToolNames);
  const candidateTools = [
    ...(args.candidateTools ?? getCareerRealtimeToolCandidates()),
  ];
  const tools =
    enabledToolNames.length > 0
      ? candidateTools.filter((tool) => enabledToolNameSet.has(tool.name))
      : [];
  const toolNames = tools.map((tool) => tool.name);

  return {
    toolNames,
    tools,
    toolVoicePreambles: getCareerRealtimeToolVoicePreambles(toolNames),
  };
}
