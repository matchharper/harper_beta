const DEFAULT_PUBLIC_SITE_URL = "https://matchharper.com";

export type OrgSlackWorkspace = {
  companyName: string;
  workspaceId: string;
};

export type OrgSlackUser = {
  email?: string | null;
  name?: string | null;
  userId?: string | null;
};

export type OrgSlackCandidate = {
  email?: string | null;
  name?: string | null;
  talentId: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export function escapeSlackText(value: unknown) {
  return normalizeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeSlackLinkUrl(value: unknown) {
  return normalizeText(value)
    .replace(/\s/g, "%20")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/\|/g, "%7C");
}

export function formatSlackLink(url: string, label: string) {
  const safeUrl = escapeSlackLinkUrl(url);
  const safeLabel = escapeSlackText(label);
  return safeUrl && safeLabel ? `<${safeUrl}|${safeLabel}>` : safeLabel;
}

export function convertMarkdownLinksToSlackMrkdwn(value: string) {
  return String(value ?? "").replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi,
    (_match, label: string, url: string) => formatSlackLink(url, label)
  );
}

function getPublicSiteUrl() {
  const value =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    DEFAULT_PUBLIC_SITE_URL;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    return new URL(withProtocol).origin.replace(/\/+$/, "");
  } catch {
    return DEFAULT_PUBLIC_SITE_URL;
  }
}

export function buildOrgRoleUrl(workspaceId: string, roleId?: string | null) {
  const params = new URLSearchParams({ orgId: workspaceId });
  if (roleId) params.set("roleId", roleId);
  return `${getPublicSiteUrl()}/org/jobs?${params.toString()}`;
}

export function buildOrgMeetingAvailabilityUrl(workspaceId: string) {
  const params = new URLSearchParams({
    dialog: "interview-availability",
    orgId: workspaceId,
  });
  return `${getPublicSiteUrl()}/org/settings?${params.toString()}`;
}

export function buildOrgMeetingScheduleUrl(
  workspaceId: string,
  scheduleId: string
) {
  const params = new URLSearchParams({
    dialog: "interview-schedule",
    orgId: workspaceId,
    scheduleId,
  });
  return `${getPublicSiteUrl()}/org/inbox?${params.toString()}`;
}

export function formatPerson(user: OrgSlackUser) {
  const name = normalizeText(user.name);
  const email = normalizeText(user.email);
  if (name && email) {
    return `${escapeSlackText(name)} (${escapeSlackText(email)})`;
  }
  return escapeSlackText(name || email || user.userId || "Unknown");
}

export function formatCandidate(candidate: OrgSlackCandidate) {
  const name = normalizeText(candidate.name);
  const email = normalizeText(candidate.email);
  if (name && email) {
    return `${escapeSlackText(name)} (${escapeSlackText(email)})`;
  }
  return escapeSlackText(name || email || candidate.talentId);
}

export function formatOptional(value: unknown) {
  return escapeSlackText(value) || "없음";
}

export function buildOrgRoleCreatedSlackMessage(args: {
  actor: OrgSlackUser;
  roleId: string;
  roleName: string;
  workspace: OrgSlackWorkspace;
}) {
  const roleUrl = buildOrgRoleUrl(args.workspace.workspaceId, args.roleId);
  return [
    `지금부터 ${escapeSlackText(args.workspace.companyName)}의 *${formatSlackLink(roleUrl, args.roleName)}* 역할의 매칭을 시작합니다.`,
    "🔥 앞으로 Harper가 해당 역할의 기준과 팀의 선호도에 맞는 후보자를 찾아 추천할게요.",
    "추천되는 후보자는 단순히 기준에 맞는 사람을 찾아 알려드리는 게 아니에요. Harper 인재풀을 검토하고 부족한 정보가 있다면 후보자에게 먼저 물어본 뒤, 회사와 역할을 충분히 소개하고 만나보고 싶다고 응한 분들만 알려드려요.",
    "",
    "따라서 당장 많은 연결 제안을 드리기보다는, 천천히 정말 적합한 분들만 연결해드릴게요.",
    "",
    "Inbox의 연결 대기 후보자를 검토한 뒤 연결을 수락하거나 거절하면 그 결정에 맞춰 다음 단계를 진행해요. 연결을 수락하면 소개 이메일로 양측을 연결하고, 연결을 거절하면 회사가 더 진행하지 않기로 했다는 종료 결정을 후보자에게 안내해요. 평소에도 어떤 점을 선호하시는지, 특정 후보자가 왜 기준에 맞지 않았는지 자세히 알려주실수록 더 정확한 매칭에 반영할게요.",
  ].join("\n");
}

export function buildOrgCandidateAcceptedSlackMessage(args: {
  acceptReason?: string | null;
  actor: OrgSlackUser;
  candidate: OrgSlackCandidate;
  closureNotificationDelivered?: boolean;
  contactDirectly?: boolean;
  introEmails: string[];
  reactivated?: boolean;
  roleId: string;
  roleName: string;
  workspace: OrgSlackWorkspace;
}) {
  const roleUrl = buildOrgRoleUrl(args.workspace.workspaceId, args.roleId);
  const rawCandidateName = normalizeText(args.candidate.name) || "후보자";
  const politeCandidateName = rawCandidateName.endsWith("님")
    ? rawCandidateName
    : `${rawCandidateName}님`;
  const connectionMethod = args.contactDirectly ? "직접 연락" : "소개 이메일";
  const lines = [
    args.reactivated
      ? `*${escapeSlackText(politeCandidateName)}과 다시 연결해드렸어요*`
      : `*${escapeSlackText(politeCandidateName)}과 연결해드렸어요*`,
    `- *역할*: ${formatSlackLink(roleUrl, args.roleName)}`,
    `- *연결 대상*: ${formatCandidate(args.candidate)}`,
    `- *연결 방식*: ${connectionMethod}`,
    `- *선택 이유*: ${formatOptional(args.acceptReason)}`,
  ];
  if (!args.contactDirectly) {
    lines.splice(
      4,
      0,
      `- *회사 수신자*: ${args.introEmails.map(escapeSlackText).join(", ") || "없음"}`
    );
  }
  if (args.reactivated) {
    lines.push(
      args.closureNotificationDelivered
        ? "Harper가 후보자에게 이전 종료 결정을 이미 안내했어요. 이미 표시되거나 전달된 안내는 회수할 수 없으므로, 이후 대화에서 회사의 상황이 바뀐 점을 직접 솔직하고 배려 있게 설명해 주세요."
        : "Harper의 별도 종료 안내는 더 이상 발송되지 않도록 했어요. 다만 이전 종료 결정이 후보자 화면에 이미 표시됐을 수 있으므로, 이후 대화에서 상황이 바뀐 점을 배려 있게 설명해 주세요."
    );
  }
  lines.push(
    "",
    args.contactDirectly
      ? "Harper가 소개 이메일을 보내지는 않았어요. 회사에서 후보자에게 직접 연락해 인사하고 다음 일정을 조율해 주세요."
      : "Harper가 후보자와 선택한 회사 담당자에게 소개 이메일을 보냈어요. 이제 양측이 같은 이메일에서 인사하고 다음 일정을 직접 조율할 수 있어요.",
    "",
    args.reactivated
      ? "이번 연결이 서로에게 좋은 방향으로 이어질 수 있도록, 상황이 달라진 점을 후보자에게 솔직하고 배려 있게 설명해 주세요."
      : "서로에게 좋은 기회가 되길 바랄게요 :)"
  );
  return lines.join("\n");
}

export function buildOrgCandidateRejectedSlackMessage(args: {
  actor: OrgSlackUser;
  candidate: OrgSlackCandidate;
  previousStage?: string | null;
  roleId: string;
  roleName: string;
  stopNote?: string | null;
  workspace: OrgSlackWorkspace;
}) {
  const roleUrl = buildOrgRoleUrl(args.workspace.workspaceId, args.roleId);
  const rejectingPendingConnection =
    !args.previousStage || args.previousStage === "pending_connection";
  const rawCandidateName = normalizeText(args.candidate.name) || "이 분";
  const politeCandidateName = rawCandidateName.endsWith("님")
    ? rawCandidateName
    : `${rawCandidateName}님`;
  return [
    rejectingPendingConnection
      ? `*${escapeSlackText(politeCandidateName)}과의 연결을 거절했어요*`
      : `*${escapeSlackText(politeCandidateName)}과의 연결을 종료했어요*`,
    `- *역할*: ${formatSlackLink(roleUrl, args.roleName)}`,
    `- *연결 대상*: ${formatCandidate(args.candidate)}`,
    `- *결정한 분*: ${formatPerson(args.actor)}`,
    `- *남긴 이유*: ${formatOptional(args.stopNote)}`,
    rejectingPendingConnection
      ? "회사가 더 진행하지 않기로 했다는 종료 결정이 후보자 화면에 표시되고, Harper가 후보자에게 종료 안내를 진행해요. 이미 표시되거나 전달된 안내는 회수할 수 없어요."
      : "Harper가 후보자에게 회사가 프로세스를 종료했다는 안내를 진행해요. 이미 보낸 소개 이메일이나 회사의 직접 연락, 후보자에게 표시되거나 전달된 종료 안내는 회수할 수 없어요.",
  ].join("\n");
}
