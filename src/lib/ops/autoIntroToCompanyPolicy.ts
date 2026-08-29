export const AUTO_INTRO_PENDING_TAG = "내부:연결대기";
export const AUTO_INTRO_MAX_PENDING_AGE_DAYS = 14;
const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

export const AUTO_INTRO_INTERNAL_STAGE_TAGS = new Set([
  "내부:수락",
  "내부:아카이브",
  "내부:최종오퍼",
  "내부:보류",
  AUTO_INTRO_PENDING_TAG,
  "내부:프로세스중단",
  "내부:거절",
  "내부:추천",
  "내부:연결됨",
]);

export const AUTO_INTRO_CUSTOM_STAGE_TAG_PREFIX = "내부단계:";

export const AUTO_INTRO_WORKSPACE_OPENING = [
  "*연결을 제안드리고 싶은 후보자가 있습니다.*",
];

export const AUTO_INTRO_RESPONSE_GUIDANCE = [
  "프로필과 Harper의 추천 이유를 천천히 확인한 뒤 연결을 받으실지, 거절하실지 선택해 주세요.",
  "\n- 연결을 수락하면 후보자와의 대화를 직접 이어나가실 수 있게 연결해드려요.",
  "\n- 거절시 연결이 진행되지 않는다는 내용을 Harper가 후보자에게 적절한 타이밍에 가볍게 안내해요.",
  "\n이번 추천에서 좋았던 점이나 맞지 않았던 점을 알려주시면 다음에는 팀이 원하는 분을 더 정확하게 찾아볼게요.",
].join(" ");

export type AutoIntroStageTag = {
  created_at: string;
  id: string;
  tag: string;
  updated_at: string;
};

export type AutoIntroReasonMode = "codex" | "author" | "skip";

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedTag(value: unknown) {
  return normalizeText(value).toLowerCase();
}

export function isAutoIntroInternalStageTag(value: unknown) {
  const tag = normalizedTag(value);
  return (
    AUTO_INTRO_INTERNAL_STAGE_TAGS.has(tag) ||
    tag.startsWith(normalizedTag(AUTO_INTRO_CUSTOM_STAGE_TAG_PREFIX))
  );
}

export function getLatestAutoIntroInternalStage(tags: AutoIntroStageTag[]) {
  return tags
    .filter((tag) => isAutoIntroInternalStageTag(tag.tag))
    .sort((left, right) => {
      const leftKey = `${left.updated_at}|${left.created_at}|${left.id}`;
      const rightKey = `${right.updated_at}|${right.created_at}|${right.id}`;
      return rightKey.localeCompare(leftKey);
    })[0];
}

export function getFreshPendingConnectionSince(
  tags: AutoIntroStageTag[],
  now: Date,
  maxAgeDays = AUTO_INTRO_MAX_PENDING_AGE_DAYS
) {
  const latest = getLatestAutoIntroInternalStage(tags);
  if (normalizedTag(latest?.tag) !== normalizedTag(AUTO_INTRO_PENDING_TAG)) {
    return null;
  }

  const pendingSince = new Date(latest.updated_at || latest.created_at);
  if (!Number.isFinite(pendingSince.getTime())) return null;
  const ageMs = now.getTime() - pendingSince.getTime();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1_000;
  if (ageMs < 0 || ageMs >= maxAgeMs) return null;
  return pendingSince.toISOString();
}

export function getAutoIntroReasonMode(kind: unknown): AutoIntroReasonMode {
  const normalized = normalizeText(kind).toLowerCase();
  if (!normalized) return "author";
  return normalized === "codex" ? "codex" : "skip";
}

export function wasAutoIntroSlackSent(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  const record = metadata as Record<string, unknown>;
  return record.slackSent === true || record.deliveryStatus === "sent";
}

function kstShiftedDate(value: Date) {
  return new Date(value.getTime() + KST_OFFSET_MS);
}

export function getAutoIntroRoleSummaryDateKey(now = new Date()) {
  return kstShiftedDate(now).toISOString().slice(0, 10);
}

export function isAutoIntroRoleSummaryDay(now = new Date()) {
  const day = kstShiftedDate(now).getUTCDay();
  return day === 1 || day === 3 || day === 5;
}

export function buildAutoIntroFollowUpPostscript(question: unknown) {
  const normalized = normalizeText(question);
  if (!normalized) return null;
  const questionText = /[?？]$/.test(normalized)
    ? normalized
    : `${normalized.replace(/[.!。！]+$/, "")}?`;
  return ["*알려주시면 좋은 질문*", questionText].join(" ");
}
