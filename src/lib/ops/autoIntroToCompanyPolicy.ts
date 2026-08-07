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

export const AUTO_INTRO_RESPONSE_GUIDANCE = [
  "어떤 후보자를 연결받고 싶으시거나, 혹은 연결을 원하지 않으시나요?",
  "추천드린 후보자들이 회사와 잘 맞지 않는다면 다음부터 어떤 기준을 적용해 연결드리면 좋을지도 알려주세요.",
  "그 기준을 바탕으로 다음 추천에 반영해볼게요.",
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
  return day === 1 || day === 4;
}

export function buildAutoIntroFollowUpPostscript(question: unknown) {
  const normalized = normalizeText(question);
  if (!normalized) return null;
  const questionText = /[?？]$/.test(normalized)
    ? normalized
    : `${normalized.replace(/[.!。！]+$/, "")}?`;
  return [
    "P.S. 더 좋은 매칭을 위해 한 가지만 여쭤볼게요.",
    questionText,
    "답변해주시면 더 적합한 분을 찾는 데 반영하겠습니다.",
    "아직 정하지 않으셨다면 “상관없어요”라고 알려주시겠어요?",
  ].join(" ");
}
