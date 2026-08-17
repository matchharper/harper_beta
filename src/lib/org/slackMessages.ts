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
    "*새 역할 등록이 완료됐어요*",
    `*${formatSlackLink(roleUrl, args.roleName)}* 역할의 후보자 탐색을 시작합니다.`,
    "Harper가 역할 기준에 맞는 인재를 살펴보고, 후보자의 관심과 연결 의사를 확인한 뒤 Harper 팀의 마지막 확인까지 마친 분을 이 채널에 알려드릴게요.",
    `- *등록한 분*: ${formatPerson(args.actor)}`,
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
  const lines = [
    args.reactivated
      ? "*후보자 연결을 다시 시작했어요*"
      : "*후보자 연결을 시작했어요*",
    `- *역할*: ${formatSlackLink(roleUrl, args.roleName)}`,
    `- *후보자*: ${formatCandidate(args.candidate)}`,
    `- *진행한 분*: ${formatPerson(args.actor)}`,
    `- *연결 방식*: ${args.contactDirectly ? "회사에서 직접 연락" : "Harper CC 소개 메일"}`,
    `- *회사 수신자*: ${args.introEmails.map(escapeSlackText).join(", ") || "없음"}`,
    `- *남긴 이유*: ${formatOptional(args.acceptReason)}`,
  ];
  if (args.reactivated) {
    lines.push(
      args.closureNotificationDelivered
        ? "Harper가 후보자에게 이전 프로세스 종료를 이미 안내했습니다. 상태는 다시 연결됨으로 열었고, 소개 메일에는 과거 거절이나 종료를 언급하지 않았습니다. 이후 대화에서는 회사가 상황이 바뀐 점을 직접 솔직하고 배려 있게 짚어 주세요."
        : "후보자에게 이전 프로세스 종료 안내는 아직 나가지 않았습니다. 종료 안내가 더 이상 발송되지 않도록 상태를 바꾸고 연결을 이어갑니다."
    );
  }
  return lines.join("\n");
}
