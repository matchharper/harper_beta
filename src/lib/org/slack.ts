import {
  sendHarperWorkspaceSlackMessage,
  type HarperSlackNotificationKey,
} from "@/lib/org/slackHarper";
import {
  buildOrgCandidateAcceptedSlackMessage,
  buildOrgCandidateRejectedSlackMessage,
  buildOrgRoleCalibrationSlackBlocks,
  buildOrgRoleUrl,
  buildOrgRoleCreatedSlackMessage,
  buildOrgRoleCalibrationSlackMessage,
  escapeSlackText,
  formatOptional,
  formatPerson,
  formatSlackLink,
  type OrgSlackCandidate,
  type OrgSlackUser,
  type OrgSlackWorkspace,
} from "@/lib/org/slackMessages";

export {
  buildOrgCandidateAcceptedSlackMessage,
  buildOrgCandidateRejectedSlackMessage,
  buildOrgRoleCalibrationSlackBlocks,
  buildOrgRoleCreatedSlackMessage,
  buildOrgRoleCalibrationSlackMessage,
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
      unfurl_links: false,
      unfurl_media: false,
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

export async function notifyOrgRoleCalibrationSlack(args: {
  calibrationId: string;
  profiles: Array<{
    display: {
      headline: string | null;
      name: string;
      profilePicture?: string | null;
    };
    profileId: string;
    selection: { reason: string };
  }>;
  roleId: string;
  roleName: string;
  workspaceId: string;
}) {
  return sendHarperWorkspaceSlackMessage({
    blocks: buildOrgRoleCalibrationSlackBlocks(args),
    idempotencyKey: `org-role-calibration/${args.calibrationId}`,
    messageMetadata: {
      roleCalibration: {
        calibrationId: args.calibrationId,
        profileIds: args.profiles.map((profile) => profile.profileId),
      },
      source: "company_role_calibration",
    },
    roleId: args.roleId,
    text: buildOrgRoleCalibrationSlackMessage(args),
    unfurlLinks: false,
    unfurlMedia: false,
    workspaceId: args.workspaceId,
  });
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
  previousStage?: string | null;
  roleId: string;
  roleName: string;
  stopNote?: string | null;
  workspace: OrgSlackWorkspace;
}) {
  await postWorkspaceScopedOrgSlackMessage(
    buildOrgCandidateRejectedSlackMessage(args),
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
    `*새로운 멤버 가입* : ${escapeSlackText(args.user.name) || "Unknown"}`,
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
