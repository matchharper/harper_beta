export const UPDATE_NOTES_FEATURE_VOTE_OPTIONS = [
  {
    id: "apply_on_my_behalf",
    en: "Plan my application strategy",
    ko: "지원 전략 세워주기",
  },
  {
    id: "resume_writing",
    en: "Write my resume",
    ko: "이력서 작성",
  },
  // {
  //   id: "interview_preparation",
  //   en: "Help me prepare for interviews",
  //   ko: "인터뷰 준비 도와주기",
  // },
  {
    id: "hiring_market_analysis",
    en: "Analyze hiring market trends",
    ko: "채용시장 분석해주기",
  },
  {
    id: "company_following",
    en: "Follow companies I'm interested in",
    ko: "원하는 회사를 팔로우하기",
  },
] as const;

export type UpdateNotesFeatureVoteOptionId =
  (typeof UPDATE_NOTES_FEATURE_VOTE_OPTIONS)[number]["id"];

const OPTION_ID_SET = new Set<UpdateNotesFeatureVoteOptionId>(
  UPDATE_NOTES_FEATURE_VOTE_OPTIONS.map((option) => option.id)
);

export const UPDATE_NOTES_FEATURE_VOTE_CONTEXT_MAX_LENGTH = 1500;
export const UPDATE_NOTES_FEATURE_VOTE_CUSTOM_RESPONSE_MAX_LENGTH = 1500;

export function isUpdateNotesFeatureVoteOptionId(
  value: unknown
): value is UpdateNotesFeatureVoteOptionId {
  return (
    typeof value === "string" &&
    OPTION_ID_SET.has(value as UpdateNotesFeatureVoteOptionId)
  );
}

export function normalizeUpdateNotesFeatureVoteOptionIds(
  value: unknown
): UpdateNotesFeatureVoteOptionId[] {
  if (!Array.isArray(value)) return [];

  const selected = new Set(value.filter(isUpdateNotesFeatureVoteOptionId));
  return UPDATE_NOTES_FEATURE_VOTE_OPTIONS.flatMap((option) =>
    selected.has(option.id) ? [option.id] : []
  );
}

export function normalizeUpdateNotesFeatureVoteContext(value: unknown) {
  return typeof value === "string"
    ? value.trim().slice(0, UPDATE_NOTES_FEATURE_VOTE_CONTEXT_MAX_LENGTH)
    : "";
}

export function normalizeUpdateNotesFeatureVoteCustomResponse(value: unknown) {
  return typeof value === "string"
    ? value
        .trim()
        .slice(0, UPDATE_NOTES_FEATURE_VOTE_CUSTOM_RESPONSE_MAX_LENGTH)
    : "";
}

export function shouldSubmitUpdateNotesFeatureVoteDirectly({
  customResponse,
  optionIds,
}: {
  customResponse: string;
  optionIds: readonly UpdateNotesFeatureVoteOptionId[];
}) {
  return (
    normalizeUpdateNotesFeatureVoteOptionIds(optionIds).length === 0 &&
    normalizeUpdateNotesFeatureVoteCustomResponse(customResponse).length > 0
  );
}

export function areUpdateNotesFeatureVotesEqual(
  first: {
    context: string;
    customResponse: string;
    optionIds: readonly UpdateNotesFeatureVoteOptionId[];
  },
  second: {
    context: string;
    customResponse: string;
    optionIds: readonly UpdateNotesFeatureVoteOptionId[];
  }
) {
  const firstIds = normalizeUpdateNotesFeatureVoteOptionIds(first.optionIds);
  const secondIds = normalizeUpdateNotesFeatureVoteOptionIds(second.optionIds);

  return (
    normalizeUpdateNotesFeatureVoteContext(first.context) ===
      normalizeUpdateNotesFeatureVoteContext(second.context) &&
    normalizeUpdateNotesFeatureVoteCustomResponse(first.customResponse) ===
      normalizeUpdateNotesFeatureVoteCustomResponse(second.customResponse) &&
    firstIds.length === secondIds.length &&
    firstIds.every((id, index) => id === secondIds[index])
  );
}

function escapeSlackText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatUpdateNotesFeatureVoteSlackText({
  context,
  customResponse,
  email,
  optionIds,
  revision,
}: {
  context: string;
  customResponse: string;
  email: string | null | undefined;
  optionIds: readonly UpdateNotesFeatureVoteOptionId[];
  revision: boolean;
}) {
  const selectedLabels = UPDATE_NOTES_FEATURE_VOTE_OPTIONS.filter((option) =>
    optionIds.includes(option.id)
  ).map((option) => option.ko);

  return [
    revision ? "Harper 피드백 수정" : "Harper 피드백",
    `사용자: ${escapeSlackText(email?.trim() || "이메일 없음")}`,
    `선택한 기능: ${selectedLabels.join(", ") || "선택하지 않음"}`,
    `주관식 답변: ${escapeSlackText(customResponse || "작성하지 않음")}`,
    `선택 이유와 맥락: ${escapeSlackText(context || "작성하지 않음")}`,
  ].join("\n");
}
