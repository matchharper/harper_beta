export type OrgAgentPipelineBucket = "active" | "ended" | "waiting";
export const ORG_AGENT_RECOMMENDATION_ID_FILTER_MAX = 100;

const ROLE_STATUS_LABELS: Record<string, string> = {
  active: "채용 중",
  deleted: "삭제됨",
  ended: "종료",
  open: "채용 중",
  paused: "일시 중지",
  top_priority: "최우선 채용",
};

const STAGE_LABELS: Record<string, string> = {
  accepted: "내부 수락",
  archived: "아카이브",
  connected: "연결됨",
  final_offer: "최종 오퍼 단계",
  pending_connection: "연결 대기",
  process_stopped: "프로세스 종료",
};

const WORK_MODE_LABELS: Record<string, string> = {
  hybrid: "하이브리드 근무",
  onsite: "오피스 근무",
  on_site: "오피스 근무",
  remote: "원격 근무",
};

const MEMBERSHIP_ROLE_LABELS: Record<string, string> = {
  admin: "관리자",
  member: "구성원",
  owner: "소유자",
  viewer: "조회자",
};

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  contract: "계약직",
  contractor: "계약직",
  full_time: "정규직",
  internship: "인턴",
  part_time: "파트타임",
  temporary: "임시직",
};

const FEEDBACK_LABELS: Record<string, string> = {
  dislike: "진행하지 않음",
  liked: "긍정 평가",
  like: "긍정 평가",
  negative: "진행하지 않음",
  positive: "긍정 평가",
};

const PROGRESS_KIND_LABELS: Record<string, string> = {
  internal_process_stopped_notified: "후보자 프로세스 종료 안내 발송",
  org_note: "회사 메모",
  org_stage_change: "채용 단계 변경",
};

function normalized(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function fallbackLabel(value: unknown) {
  const source = String(value ?? "").trim();
  return source ? source.replaceAll("_", " ") : "정보 없음";
}

export function humanizeOrgRoleStatus(value: unknown) {
  return ROLE_STATUS_LABELS[normalized(value)] ?? fallbackLabel(value);
}

export function humanizeOrgStage(value: unknown, customLabel?: string | null) {
  const stage = normalized(value);
  if (stage.startsWith("custom:")) {
    return String(customLabel ?? "").trim() || "회사 지정 단계";
  }
  return STAGE_LABELS[stage] ?? fallbackLabel(value);
}

export function humanizeOrgWorkMode(value: unknown) {
  return WORK_MODE_LABELS[normalized(value)] ?? fallbackLabel(value);
}

export function humanizeOrgMembershipRole(value: unknown) {
  return MEMBERSHIP_ROLE_LABELS[normalized(value)] ?? "조회자";
}

export function humanizeOrgEmploymentType(value: unknown) {
  return EMPLOYMENT_TYPE_LABELS[normalized(value)] ?? fallbackLabel(value);
}

export function humanizeOrgFeedback(value: unknown) {
  const feedback = normalized(value);
  if (!feedback) return "정보 없음";
  return FEEDBACK_LABELS[feedback] ?? "후보자 평가";
}

export function humanizeOrgProgressKind(value: unknown) {
  const kind = normalized(value);
  if (!kind) return "활동 기록";
  return PROGRESS_KIND_LABELS[kind] ?? "활동 기록";
}

export function getOrgAgentPipelineBucket(
  stage: string | null | undefined
): OrgAgentPipelineBucket | null {
  const normalizedStage = normalized(stage);
  if (normalizedStage === "pending_connection") return "waiting";
  if (normalizedStage === "process_stopped") return "ended";
  if (
    normalizedStage === "accepted" ||
    normalizedStage === "connected" ||
    normalizedStage === "final_offer" ||
    normalizedStage.startsWith("custom:")
  ) {
    return "active";
  }

  // accepted is counted only when the caller's visibility path returned it;
  // ordinary company users never receive that internal-only stage. Archived
  // history remains outside the three current-pipeline buckets.
  return null;
}

export function normalizeOrgAgentRecommendationIdFilter(
  value: readonly string[] | null | undefined
) {
  if (value === undefined || value === null) return null;
  const ids = Array.from(
    new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))
  );
  if (ids.length > ORG_AGENT_RECOMMENDATION_ID_FILTER_MAX) {
    throw new RangeError(
      `recommendationIds accepts at most ${ORG_AGENT_RECOMMENDATION_ID_FILTER_MAX} IDs`
    );
  }
  return ids;
}

export function isOrgRoleActivelyHiring(value: unknown) {
  const status = normalized(value);
  return status === "active" || status === "open" || status === "top_priority";
}
