import {
  ORG_ACTION_LABELS,
  type OrgActionType,
  type OrgActionMetadata,
} from "@/lib/org/actionLogs";
export type OpsCompanyProgressActivityInput = {
  actorName?: string | null;
  candidateName: string;
  customStageLabelByKey: ReadonlyMap<string, string>;
  progress: {
    kind: string;
    metadata: unknown;
    roleId: string;
    text: string;
  };
  roleName: string | null | undefined;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

const PROGRESS_STAGE_LABELS: Record<string, string> = {
  accepted: "수락",
  archived: "아카이브",
  connected: "연결됨",
  final_offer: "최종 오퍼",
  hold: "보류",
  pending_connection: "연결 대기",
  process_stopped: "프로세스 중단",
  recommended: "추천",
  rejected: "거절",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function getOpsCompanyStageLabelKey(roleId: string, stageId: string) {
  return `${normalizeText(roleId).toLowerCase()}:${normalizeText(stageId).toLowerCase()}`;
}

function getProgressStageLabel(args: {
  customStageLabelByKey: ReadonlyMap<string, string>;
  roleId: string;
  stage: unknown;
}) {
  const stage = normalizeText(args.stage).toLowerCase();
  if (!stage) return "단계 없음";

  if (stage.startsWith("custom:")) {
    return (
      args.customStageLabelByKey.get(
        getOpsCompanyStageLabelKey(args.roleId, stage.slice("custom:".length))
      ) ?? "회사 지정 단계"
    );
  }

  return PROGRESS_STAGE_LABELS[stage] ?? stage.replaceAll("_", " ");
}

function joinActivitySubtitle(parts: Array<string | null | undefined>) {
  const text = parts.map(normalizeText).filter(Boolean).join(" · ");
  return text || null;
}

// Filter at the database before limiting rows so internal noise cannot hide real activity.
export const OPS_COMPANY_PROGRESS_KINDS = [
  "company_candidate_presented",
  "candidate_role_recommendation_accepted",
  "candidate_role_recommendation_rejected",
  "org_stage_change",
  "intro_to_company",
  "org_note",
  "org_candidate_profile_first_view",
  "org_company_intro_requested",
  "org_company_intro_passed",
  "internal_process_stopped_notified",
  "org_candidate_activity",
  "org_candidate_role_move",
];

// Directory summaries show decisions and pipeline changes, not delivery/view noise.
export const OPS_COMPANY_DIRECTORY_PROGRESS_KINDS = [
  "candidate_role_recommendation_accepted",
  "candidate_role_recommendation_rejected",
  "org_stage_change",
  "org_company_intro_requested",
  "org_company_intro_passed",
  "org_candidate_role_move",
];

export function isHiddenOpsCompanyProgressActivity(progress: {
  kind: string;
  text: string;
}) {
  return !OPS_COMPANY_PROGRESS_KINDS.includes(progress.kind);
}

export function describeOpsCompanyProgressActivity(
  args: OpsCompanyProgressActivityInput
) {
  const kind = normalizeText(args.progress.kind).toLowerCase();
  const text = normalizeText(args.progress.text);
  const metadata = asRecord(args.progress.metadata);
  const roleName = normalizeText(args.roleName) || "이름 없는 포지션";
  const candidateName = `${args.candidateName} · ${roleName}`;

  if (
    kind === "org_company_intro_requested" ||
    kind === "org_company_intro_passed"
  ) {
    const label =
      kind === "org_company_intro_requested"
        ? "Intro 요청"
        : "후보자 제안 패스";
    return {
      meta: label,
      title: `${args.actorName || "팀원"} · ${candidateName} ${label}`,
      subtitle: null,
    };
  }

  if (kind === "org_stage_change") {
    const previousStage = normalizeText(metadata.previousStage);
    const nextStage = normalizeText(metadata.stage);
    const previousStageLabel = getProgressStageLabel({
      customStageLabelByKey: args.customStageLabelByKey,
      roleId: args.progress.roleId,
      stage: previousStage,
    });
    const nextStageLabel = getProgressStageLabel({
      customStageLabelByKey: args.customStageLabelByKey,
      roleId: args.progress.roleId,
      stage: nextStage,
    });
    const changedStage =
      Boolean(previousStage && nextStage) && previousStage !== nextStage;

    return {
      meta: "프로세스 변경",
      subtitle: text || null,
      title: changedStage
        ? `${candidateName} [${previousStageLabel}] → [${nextStageLabel}]`
        : nextStage
          ? `${candidateName} [${nextStageLabel}]로 변경`
          : `${candidateName} 프로세스 변경`,
    };
  }

  if (
    kind === "candidate_role_recommendation_accepted" ||
    kind === "candidate_role_recommendation_rejected"
  ) {
    const label =
      kind === "candidate_role_recommendation_accepted"
        ? "추천 수락"
        : "추천 거절";
    return {
      meta: label,
      title: `${candidateName} ${label}`,
      subtitle: text || null,
    };
  }
  if (kind === "company_candidate_presented" || kind === "intro_to_company") {
    return {
      meta: "회사에 후보자 추천",
      subtitle: text || null,
      title: `${candidateName} 회사에 후보자 추천`,
    };
  }

  if (kind === "org_note") {
    return {
      meta: "회사 메모",
      subtitle: text || null,
      title: `${candidateName} 회사 메모 남김`,
    };
  }

  if (kind === "org_candidate_profile_first_view") {
    return {
      meta: "후보자 최초 열람",
      subtitle: joinActivitySubtitle([
        metadata.source === "slack" ? "Slack" : "웹",
      ]),
      title: `${args.actorName || "팀원"}님이 ${candidateName} 후보자 최초 열람`,
    };
  }

  if (kind === "internal_process_stopped_notified") {
    return {
      meta: "프로세스 종료 안내 발송",
      subtitle: null,
      title: `${candidateName} 프로세스 종료 안내 발송`,
    };
  }

  if (kind === "org_candidate_activity") {
    const labels: Record<string, string> = {
      candidate_contact_sent: "후보자에게 연락 전달",
      candidate_response_received: "후보자 답변 도착",
      candidate_message_delivered: "후보자 메시지 회사에 전달",
      meeting_confirmed: "미팅 확정",
    };
    const label = labels[String(metadata.eventType ?? "")] ?? "후보자 연락";
    return {
      meta: label,
      title: `${candidateName} ${label}`,
      subtitle: text || null,
    };
  }

  return {
    meta: kind === "org_candidate_role_move" ? "역할 이동" : "후보자 연락",
    subtitle: text || null,
    title: `${candidateName} ${kind === "org_candidate_role_move" ? "역할 이동" : "연락 기록"}`,
  };
}

export function describeOpsCompanyRoleRecommendation(args: {
  candidateName: string;
  roleName: string | null | undefined;
}) {
  return {
    meta: "후보자에게 추천",
    subtitle: null,
    title: `${args.candidateName} · ${normalizeText(args.roleName) || "이름 없는 포지션"} 추천`,
  };
}

export function describeOpsCompanyAction(args: {
  type: OrgActionType;
  actorName: string;
  targetName?: string | null;
  metadata: OrgActionMetadata;
}) {
  const authorityLabels: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    viewer: "Viewer",
    organization: "Organization 전체",
    team: "배정된 팀",
  };
  const before = args.metadata.before;
  const after = args.metadata.after;
  const transition =
    before && after
      ? `${authorityLabels[before] ?? before} → ${authorityLabels[after] ?? after}`
      : after
        ? (authorityLabels[after] ?? after)
        : undefined;
  return {
    meta: ORG_ACTION_LABELS[args.type],
    title: joinActivitySubtitle([
      args.actorName,
      args.targetName,
      ORG_ACTION_LABELS[args.type],
    ])!,
    subtitle: joinActivitySubtitle([
      transition,
      args.metadata.resumeFileName,
      args.metadata.interval === "year"
        ? "연간"
        : args.metadata.interval === "month"
          ? "월간"
          : null,
      args.metadata.quantity != null ? `${args.metadata.quantity} 슬롯` : null,
      args.metadata.result === "cancelled"
        ? "결제 취소 후 복귀"
        : args.metadata.result === "success"
          ? "결제 완료 화면에서 복귀 · 실제 결제는 서버 기록 확인"
          : null,
      args.metadata.invoiceId,
      args.metadata.errorCode,
    ]),
  };
}
