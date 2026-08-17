import {
  sendHarperWorkspaceSlackMessage,
  type HarperSlackNotificationKey,
} from "@/lib/org/slackHarper";
import {
  buildOrgCandidateAcceptedSlackMessage,
  buildOrgRoleUrl,
  buildOrgRoleCreatedSlackMessage,
  escapeSlackText,
  formatCandidate,
  formatOptional,
  formatPerson,
  formatSlackLink,
  type OrgSlackCandidate,
  type OrgSlackUser,
  type OrgSlackWorkspace,
} from "@/lib/org/slackMessages";

export {
  buildOrgCandidateAcceptedSlackMessage,
  buildOrgRoleCreatedSlackMessage,
} from "@/lib/org/slackMessages";

export const ORG_SLACK_CHANNEL_ID =
  process.env.ORG_SLACK_CHANNEL_ID?.trim() || "C0AKK93FMH8";

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
  workspaceId: string,
  notificationKey?: HarperSlackNotificationKey,
  roleId?: string | null,
  idempotencyKey?: string
) {
  const [internalResult, workspaceResult] = await Promise.allSettled([
    postOrgSlackMessage(text),
    sendHarperWorkspaceSlackMessage({
      idempotencyKey,
      notificationKey,
      roleId,
      text,
      workspaceId,
    }),
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
  return (
    workspaceResult.status === "fulfilled" && workspaceResult.value === true
  );
}

export async function notifyOrgRoleCreatedSlack(args: {
  actor: OrgSlackUser;
  roleId: string;
  roleName: string;
  workspace: OrgSlackWorkspace;
}) {
  return postWorkspaceScopedOrgSlackMessage(
    buildOrgRoleCreatedSlackMessage(args),
    args.workspace.workspaceId,
    undefined,
    args.roleId,
    `org-role-created/${args.roleId}`
  );
}

export async function notifyOrgCandidateAcceptedSlack(args: {
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
  await postWorkspaceScopedOrgSlackMessage(
    buildOrgCandidateAcceptedSlackMessage(args),
    args.workspace.workspaceId,
    "candidateAccepted",
    args.roleId
  );
}

export async function notifyOrgCandidateRejectedSlack(args: {
  actor: OrgSlackUser;
  candidate: OrgSlackCandidate;
  roleId: string;
  roleName: string;
  stopNote?: string | null;
  workspace: OrgSlackWorkspace;
}) {
  const roleUrl = buildOrgRoleUrl(args.workspace.workspaceId, args.roleId);
  const lines = [
    "*후보자 프로세스를 종료했어요*",
    `- *역할*: ${formatSlackLink(roleUrl, args.roleName)}`,
    `- *후보자*: ${formatCandidate(args.candidate)}`,
    `- *결정한 분*: ${formatPerson(args.actor)}`,
    `- *남긴 이유*: ${formatOptional(args.stopNote)}`,
    "후보자에게는 아직 종료 안내가 나가지 않았습니다. Harper가 적절한 시점에 배려 있게 안내하며, 그 전에 다시 연결하면 종료 안내는 발송되지 않습니다.",
  ];

  await postWorkspaceScopedOrgSlackMessage(
    lines.join("\n"),
    args.workspace.workspaceId,
    "candidateRejected",
    args.roleId
  );
}

export async function notifyOrgMemberJoinedSlack(args: {
  user: OrgSlackUser;
  workspace: OrgSlackWorkspace;
}) {
  const lines = [
    "*Org 신규 유저 가입*",
    `- *Workspace*: ${escapeSlackText(args.workspace.companyName)}`,
    `- *Name*: ${escapeSlackText(args.user.name) || "Unknown"}`,
  ];

  await postWorkspaceScopedOrgSlackMessage(
    lines.join("\n"),
    args.workspace.workspaceId,
    "memberJoined"
  );
}

export async function notifyOrgAgentMeetingRequestedSlack(args: {
  actor: OrgSlackUser;
  reason?: string | null;
  roleId: string;
  roleName: string;
  topic: string;
  workspace: OrgSlackWorkspace;
}) {
  const roleUrl = buildOrgRoleUrl(args.workspace.workspaceId, args.roleId);
  const lines = [
    "*Org Agent 미팅 요청*",
    `- *Workspace*: ${formatSlackLink(roleUrl, args.workspace.companyName)}`,
    `- *Role*: ${escapeSlackText(args.roleName)}`,
    `- *Requested by*: ${formatPerson(args.actor)}`,
    `- *Topic*: ${formatOptional(args.topic)}`,
    `- *Reason*: ${formatOptional(args.reason)}`,
  ];

  await postWorkspaceScopedOrgSlackMessage(
    lines.join("\n"),
    args.workspace.workspaceId
  );
}
