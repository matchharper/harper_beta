import { getOrgRoleStatusPresentation } from "@/lib/org/roleStatus";

export type OrgAgentPipelineBucket = "active" | "ended" | "waiting";
export const ORG_AGENT_RECOMMENDATION_ID_FILTER_MAX = 100;

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
  company_request_followup_sent: "회사 요청 팔로업 발송",
  internal_process_stopped_notified: "후보자 프로세스 종료 안내 발송",
  org_candidate_activity: "후보자 진행",
  org_note: "회사 메모",
  org_stage_change: "채용 단계 변경",
};

const CANDIDATE_ACTIVITY_LABELS: Record<string, string> = {
  company_request_followup_sent: "회사 요청 팔로업 발송",
  candidate_contact_sent: "후보자에게 요청 전달",
  candidate_response_received: "후보자 답변 수신",
  meeting_confirmed: "미팅 확정",
};

const CANDIDATE_REQUEST_KIND_LABELS: Record<string, string> = {
  question: "질문",
  resume: "이력서 요청",
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
  return getOrgRoleStatusPresentation(value).label;
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

export function humanizeOrgCandidateActivity(value: unknown) {
  const eventType = normalized(value);
  if (!eventType) return "후보자 진행";
  return CANDIDATE_ACTIVITY_LABELS[eventType] ?? "후보자 진행";
}

export function humanizeOrgCandidateRequestKind(value: unknown) {
  const requestKind = normalized(value);
  if (!requestKind) return "후보자 요청";
  return CANDIDATE_REQUEST_KIND_LABELS[requestKind] ?? "후보자 요청";
}

export function compactOrgProgressMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const compact: Record<string, unknown> = {};
  for (const key of [
    "stage",
    "fromStage",
    "acceptReason",
    "stopNote",
    "reason",
  ]) {
    if (record[key] !== undefined) {
      compact[key] =
        key === "stage" || key === "fromStage"
          ? humanizeOrgStage(record[key])
          : record[key];
    }
  }
  if (record.eventType !== undefined) {
    compact.activity = humanizeOrgCandidateActivity(record.eventType);
  }
  if (record.requestKind !== undefined) {
    compact.requestType = humanizeOrgCandidateRequestKind(record.requestKind);
  }
  for (const key of [
    "requestContext",
    "scheduledAt",
    "scheduledEndAt",
    "durationMinutes",
    "title",
    "timezone",
  ]) {
    if (record[key] !== undefined) {
      compact[key] = record[key];
    }
  }
  return Object.keys(compact).length > 0 ? compact : null;
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
