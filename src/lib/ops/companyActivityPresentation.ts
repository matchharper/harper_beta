export type OpsCompanyProgressActivityInput = {
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

export function isHiddenOpsCompanyProgressActivity(progress: {
  kind: string;
  text: string;
}) {
  const kind = normalizeText(progress.kind).toLowerCase();
  const text = normalizeText(progress.text).toLowerCase();
  return (
    kind === "internal_fit_question_asked" ||
    text.includes("follow-up") ||
    text.includes("follow up") ||
    text.includes("follow_up")
  );
}

export function describeOpsCompanyProgressActivity(
  args: OpsCompanyProgressActivityInput
) {
  const kind = normalizeText(args.progress.kind).toLowerCase();
  const text = normalizeText(args.progress.text);
  const lowerText = text.toLowerCase();
  const metadata = asRecord(args.progress.metadata);
  const roleName = normalizeText(args.roleName) || null;
  const isPriorityReviewRequest =
    kind === "candidate_requested_connection" ||
    kind === "internal_role_priority_review_requested" ||
    lowerText.includes("priority review");

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
      subtitle: joinActivitySubtitle([roleName, text]),
      title: changedStage
        ? `${args.candidateName} [${previousStageLabel}] → [${nextStageLabel}]`
        : nextStage
          ? `${args.candidateName} [${nextStageLabel}]로 변경`
          : `${args.candidateName} 프로세스 변경`,
    };
  }

  if (isPriorityReviewRequest) {
    return {
      meta: "우선 검토 요청",
      subtitle: roleName,
      title: `${args.candidateName} 우선 검토 요청`,
    };
  }

  if (kind === "intro_to_company") {
    return {
      meta: "회사에 후보자 추천",
      subtitle: joinActivitySubtitle([roleName, text]),
      title: `${args.candidateName} 회사에 후보자 추천`,
    };
  }

  if (kind === "org_note") {
    return {
      meta: "회사 메모",
      subtitle: joinActivitySubtitle([roleName, text]),
      title: `${args.candidateName} 회사 메모 남김`,
    };
  }

  if (kind === "org_slack_profile_view") {
    return {
      meta: "후보자 프로필 열람",
      subtitle: roleName,
      title: `${args.candidateName} 후보자 프로필 열람`,
    };
  }

  if (kind === "internal_process_stopped_notified") {
    return {
      meta: "프로세스 종료 안내 발송",
      subtitle: roleName,
      title: `${args.candidateName} 프로세스 종료 안내 발송`,
    };
  }

  if (text.includes("연결 제안이 등록되었습니다")) {
    return {
      meta: "역할 추천 준비",
      subtitle: joinActivitySubtitle([roleName, text]),
      title: `${args.candidateName} 역할 추천 준비`,
    };
  }

  return {
    meta: "활동 기록",
    subtitle: joinActivitySubtitle([roleName, text]),
    title: `${args.candidateName} 활동 기록`,
  };
}

export function describeOpsCompanyRoleRecommendation(args: {
  candidateName: string;
  roleName: string | null | undefined;
}) {
  return {
    meta: "후보자에게 역할을 추천함",
    subtitle: normalizeText(args.roleName) || null,
    title: `${args.candidateName} 후보자에게 역할을 추천함`,
  };
}
