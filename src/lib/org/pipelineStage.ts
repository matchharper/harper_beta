import { getOrgRoleStatusPresentation } from "@/lib/org/roleStatus";

export type OrgAgentPipelineBucket =
  | "active"
  | "ended"
  | "intro"
  | "requested"
  | "waiting";
export const ORG_AGENT_RECOMMENDATION_ID_FILTER_MAX = 100;

export const ORG_STAGE_DESCRIPTIONS: Record<string, string> = {
  company_intro:
    "이 역할을 아직 수락하지 않은 후보에게 회사가 제안할 수 있습니다. Harper의 이전 추천이나 거절 이력이 있을 수 있습니다. Intro를 요청하면 Harper가 후보자에게 제안을 전달합니다.",
  intro_requested:
    "회사가 먼저 Intro를 요청한 후보입니다. Harper가 제안을 준비·전달하고 후보자의 답변을 기다립니다. 후보자가 수락하면 연결됨으로 표시하며 소개 이메일로 연결을 진행합니다.",
  pending_connection:
    "Harper가 이 역할을 추천했고, 그걸 수락한 후보자입니다. 회사가 연결을 수락하거나 인터뷰를 요청하면 Harper가 연결하고 다음 과정을 시작할 수 있습니다.",
  accepted:
    "후보자가 역할을 수락했지만 아직 회사가 연결 여부를 결정하는 단계로 넘어가지 않았습니다. Harper의 후속 처리를 기다리는 내부 운영용 상태이며, 별도의 팀원 승인 단계는 아닙니다.",
  connected:
    "후보자가 회사의 Intro를 수락했거나, 후보자 수락 후 회사가 연결을 수락한 상태입니다. 소개 이메일이나 다음 단계의 연결 절차가 진행 중일 수 있습니다. 구체적인 전형 진행 상황은 Pipeline에서 확인할 수 있습니다.",
  intro_declined:
    "후보자가 회사의 Intro 제안을 거절해 이번 제안이 종료됐습니다. 후보자가 답하지 않은 상태와는 다릅니다.",
  process_stopped:
    "이번 역할의 진행이 종료된 상태입니다. 회사가 연결을 거절한 경우도 포함됩니다. 종료 사유와 이전 진행 이력은 후보자 상세에서 확인할 수 있습니다.",
  decision_made:
    "이번 후보자에 대한 결정이 기록됐습니다. 구체적인 결정과 진행 이력은 후보자 상세에서 확인할 수 있습니다.",
};

export function isOrgInboxStage(stageId: string) {
  return stageId === "company_intro" || stageId === "pending_connection";
}

export function getOrgCompanyIntroBoardStage(
  status: "ready" | "awaiting_talent" | "connecting" | "closed" | "passed",
  intro?: {
    closeReason: string | null;
    requestedAt: string | null;
    candidateSentAt: string | null;
    talentDecisionAt: string | null;
  }
) {
  // Role closure prevents delivery, but does not erase the company's shortlist.
  // Keep the durable closed state; only the company-facing placement changes.
  if (status === "closed" && intro?.closeReason === "role_closed" &&
      intro.requestedAt === null && intro.candidateSentAt === null &&
      intro.talentDecisionAt === null) return "company_intro";
  if (status === "closed" || status === "passed") return "process_stopped";
  return status === "ready" ? "company_intro" : "intro_requested";
}

export function humanizeOrgCompanyIntroStatus(intro: {
  status: string;
  candidateSentAt?: string | null;
  closeReason?: string | null;
  requestedAt?: string | null;
  talentDecisionAt?: string | null;
}) {
  if (intro.status === "closed" && intro.closeReason === "role_closed" &&
      intro.requestedAt === null && intro.candidateSentAt === null &&
      intro.talentDecisionAt === null) return "채용 종료";
  if (intro.status === "closed" || intro.status === "passed")
    return "제안 종료";
  if (intro.status === "ready") return "";
  if (intro.status === "connecting") return "후보자 수락 · 연결 준비 중";
  if (intro.status === "awaiting_talent") {
    return intro.candidateSentAt ? "후보자 답변 대기" : "제안 준비 중";
  }
  return "제안 상태 확인 필요";
}

const STAGE_LABELS: Record<string, string> = {
  accepted: "내부 수락",
  archived: "아카이브",
  company_intro: "연결 제안할 후보",
  connected: "연결됨",
  final_offer: "최종 오퍼 단계",
  intro_requested: "연결 제안한 후보",
  pending_connection: "연결 수락한 후보",
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
  candidate_contact_preferences_changed: "후보자 추천·연락 설정 변경",
  company_intro_decision: "후보자 제안 결정",
  internal_followup_sent: "Harper 자동 팔로업 발송",
  company_followup: "회사 요청 후속 연락 기록",
  company_request_followup_sent: "회사 요청 팔로업 발송",
  internal_process_reactivated: "후보자 프로세스 재개",
  internal_process_reengagement_required: "후보자 재진행 의사 확인 필요",
  internal_process_reengagement_requested: "후보자 재진행 의사 확인 요청",
  internal_process_reengagement_response: "후보자 재진행 답변 수신",
  internal_process_stopped_notified: "후보자 프로세스 종료 안내 발송",
  org_candidate_activity: "후보자 진행",
  org_note: "회사 메모",
  org_stage_change: "채용 단계 변경",
};

const CANDIDATE_ACTIVITY_LABELS: Record<string, string> = {
  company_request_followup_sent: "회사 요청 팔로업 발송",
  candidate_contact_scheduled: "후보자 연락 발송 예약",
  candidate_contact_failed: "후보자 연락 발송 처리 오류",
  candidate_contact_cancelled: "후보자 연락 발송 취소",
  candidate_contact_sent: "후보자에게 요청 전달",
  candidate_message_delivered: "후보자 메시지 전달",
  candidate_response_received: "후보자 답변 수신",
  meeting_confirmed: "미팅 확정",
};

const CANDIDATE_REQUEST_KIND_LABELS: Record<string, string> = {
  contact: "연락",
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
    "currentStage",
    "requestedStage",
    "acceptReason",
    "stopNote",
    "reason",
  ]) {
    if (record[key] !== undefined) {
      compact[key] = [
        "stage",
        "fromStage",
        "currentStage",
        "requestedStage",
      ].includes(key)
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
    "requestedStageLabel",
    "status",
    "consentSource",
    "responseDisposition",
    "stageFallbackToPendingConnection",
    "deliveryState",
    "sentChannel",
    "lastFollowupAt",
    "followupIndex",
    "requestId",
    "confirmationContext",
    "confirmedAt",
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
  if (normalizedStage === "company_intro") return "intro";
  if (normalizedStage === "intro_requested") return "requested";
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
  // history remains outside the current-pipeline buckets.
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
