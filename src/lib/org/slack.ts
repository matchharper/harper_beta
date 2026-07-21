import { sendOrgWorkspaceSlackMessage } from "@/lib/org/slackIntegration";

const ORG_SLACK_CHANNEL_ID = "C0AKK93FMH8";
const DEFAULT_PUBLIC_SITE_URL = "https://matchharper.com";

type OrgSlackWorkspace = {
  companyName: string;
  workspaceId: string;
};

type OrgSlackUser = {
  email?: string | null;
  name?: string | null;
  userId?: string | null;
};

type OrgSlackCandidate = {
  email?: string | null;
  name?: string | null;
  talentId: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function escapeSlackText(value: unknown) {
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

function formatSlackLink(url: string, label: string) {
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

function buildOrgRoleUrl(workspaceId: string, roleId?: string | null) {
  const params = new URLSearchParams({ orgId: workspaceId });
  if (roleId) params.set("roleId", roleId);
  return `${getPublicSiteUrl()}/org?${params.toString()}`;
}

function formatPerson(user: OrgSlackUser) {
  const name = normalizeText(user.name);
  const email = normalizeText(user.email);
  if (name && email)
    return `${escapeSlackText(name)} (${escapeSlackText(email)})`;
  return escapeSlackText(name || email || user.userId || "Unknown");
}

function formatCandidate(candidate: OrgSlackCandidate) {
  const name = normalizeText(candidate.name);
  const email = normalizeText(candidate.email);
  if (name && email)
    return `${escapeSlackText(name)} (${escapeSlackText(email)})`;
  return escapeSlackText(name || email || candidate.talentId);
}

function formatOptional(value: unknown) {
  return escapeSlackText(value) || "없음";
}

async function postOrgSlackMessage(text: string) {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is required");
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    body: JSON.stringify({
      channel: ORG_SLACK_CHANNEL_ID,
      text,
    }),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    method: "POST",
  });
  const result = (await response.json().catch(() => null)) as {
    error?: string;
    ok?: boolean;
  } | null;

  if (!response.ok || !result?.ok) {
    throw new Error(
      `Slack chat.postMessage failed: ${result?.error ?? response.status}`
    );
  }
}

async function postWorkspaceScopedOrgSlackMessage(
  text: string,
  workspaceId: string
) {
  const [internalResult, workspaceResult] = await Promise.allSettled([
    postOrgSlackMessage(text),
    sendOrgWorkspaceSlackMessage({ text, workspaceId }),
  ]);

  if (workspaceResult.status === "rejected") {
    console.error(
      "[org/slack] workspace notification failed",
      workspaceResult.reason
    );
  }
  if (internalResult.status === "rejected") {
    if (
      workspaceResult.status === "rejected" ||
      (workspaceResult.status === "fulfilled" && !workspaceResult.value)
    ) {
      throw internalResult.reason;
    }
    console.error(
      "[org/slack] internal notification failed",
      internalResult.reason
    );
  }
}

export async function notifyOrgCandidateAcceptedSlack(args: {
  acceptReason?: string | null;
  actor: OrgSlackUser;
  candidate: OrgSlackCandidate;
  introEmails: string[];
  roleId: string;
  roleName: string;
  workspace: OrgSlackWorkspace;
}) {
  const roleUrl = buildOrgRoleUrl(args.workspace.workspaceId, args.roleId);
  const lines = [
    "*Org 후보자 수락*",
    `- *Workspace*: ${formatSlackLink(roleUrl, args.workspace.companyName)}`,
    `- *Role*: ${escapeSlackText(args.roleName)}`,
    `- *Candidate*: ${formatCandidate(args.candidate)}`,
    `- *Accepted by*: ${formatPerson(args.actor)}`,
    `- *Intro emails*: ${args.introEmails.map(escapeSlackText).join(", ") || "없음"}`,
    `- *Reason*: ${formatOptional(args.acceptReason)}`,
  ];

  await postWorkspaceScopedOrgSlackMessage(
    lines.join("\n"),
    args.workspace.workspaceId
  );
}

export async function notifyOrgCandidateRejectedSlack(args: {
  actor: OrgSlackUser;
  candidate: OrgSlackCandidate;
  roleId: string;
  roleName: string;
  stopNote?: string | null;
  stopReason?: string | null;
  workspace: OrgSlackWorkspace;
}) {
  const roleUrl = buildOrgRoleUrl(args.workspace.workspaceId, args.roleId);
  const stopReasonLabel =
    args.stopReason === "candidate"
      ? "후보자측 종료"
      : args.stopReason === "company"
        ? "회사측 종료"
        : "미지정";
  const lines = [
    "*Org 후보자 거절*",
    `- *Workspace*: ${formatSlackLink(roleUrl, args.workspace.companyName)}`,
    `- *Role*: ${escapeSlackText(args.roleName)}`,
    `- *Candidate*: ${formatCandidate(args.candidate)}`,
    `- *Rejected by*: ${formatPerson(args.actor)}`,
    `- *Type*: ${escapeSlackText(stopReasonLabel)}`,
    `- *Reason*: ${formatOptional(args.stopNote)}`,
  ];

  await postWorkspaceScopedOrgSlackMessage(
    lines.join("\n"),
    args.workspace.workspaceId
  );
}

export async function notifyOrgMemberJoinedSlack(args: {
  user: OrgSlackUser;
  workspace: OrgSlackWorkspace;
}) {
  const orgUrl = buildOrgRoleUrl(args.workspace.workspaceId, "all");
  const lines = [
    "*Org 신규 유저 가입*",
    `- *Workspace*: ${formatSlackLink(orgUrl, args.workspace.companyName)}`,
    `- *User*: ${formatPerson(args.user)}`,
  ];

  await postWorkspaceScopedOrgSlackMessage(
    lines.join("\n"),
    args.workspace.workspaceId
  );
}
