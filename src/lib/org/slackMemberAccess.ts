import "server-only";

import {
  getOrgPermissions,
  normalizeOrgMembershipRole,
  type OrgMembershipRole,
} from "@/lib/org/permissions";
import {
  getHarperSlackUserEmail,
  postHarperSlackEphemeralMessage,
} from "@/lib/org/slackHarper";
import {
  buildHarperSlackAccessDeniedMessage,
  type HarperSlackAccessDenialReason,
} from "@/lib/org/slackMemberAccessPolicy";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

export type HarperSlackWorkspaceMember = {
  authority: OrgMembershipRole;
  canManageCandidates: boolean;
  companyUserId: string;
  email: string;
};

export type HarperSlackWorkspaceAccess =
  | {
      allowed: true;
      email: string;
      member: HarperSlackWorkspaceMember;
      workspaceName: string | null;
    }
  | {
      allowed: false;
      email: string | null;
      hasPendingInvitation: boolean;
      reason: "email_unavailable" | "not_member";
      workspaceName: string | null;
    };

const clean = (value: unknown) => String(value ?? "").trim();

async function loadWorkspaceName(admin: AdminClient, workspaceId: string) {
  const { data, error } = await (
    admin.from("company_workspace" as any) as any
  )
    .select("company_name")
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return clean(data?.company_name) || null;
}

export async function findHarperSlackWorkspaceMember(args: {
  admin?: AdminClient;
  email: string;
  workspaceId: string;
}): Promise<HarperSlackWorkspaceMember | null> {
  const admin = args.admin ?? getSupabaseAdmin();
  const normalizedEmail = clean(args.email).toLowerCase();
  if (!normalizedEmail) return null;

  const { data: membershipData, error: membershipError } = await (
    admin.from("company_user_workspace" as any) as any
  )
    .select("company_user_id, authority")
    .eq("company_workspace_id", args.workspaceId);
  if (membershipError) throw membershipError;

  const companyUserIds = Array.from(
    new Set(
      (membershipData ?? [])
        .map((row: { company_user_id?: unknown }) => clean(row.company_user_id))
        .filter(Boolean)
    )
  );
  if (companyUserIds.length === 0) return null;

  const { data: userData, error: userError } = await (
    admin.from("company_users" as any) as any
  )
    .select("user_id, email")
    .in("user_id", companyUserIds);
  if (userError) throw userError;

  const user = (userData ?? []).find(
    (row: { email?: unknown }) =>
      clean(row.email).toLowerCase() === normalizedEmail
  ) as { email?: unknown; user_id?: unknown } | undefined;
  const companyUserId = clean(user?.user_id);
  if (!companyUserId) return null;

  const membership = (membershipData ?? []).find(
    (row: { company_user_id?: unknown }) =>
      clean(row.company_user_id) === companyUserId
  ) as { authority?: unknown } | undefined;
  const authority = normalizeOrgMembershipRole(clean(membership?.authority));
  return {
    authority,
    canManageCandidates: getOrgPermissions(authority).canManageCandidates,
    companyUserId,
    email: normalizedEmail,
  };
}

async function hasPendingWorkspaceInvitation(args: {
  admin: AdminClient;
  email: string;
  workspaceId: string;
}) {
  const { data, error } = await (
    args.admin.from("company_workspace_invitations" as any) as any
  )
    .select("invitation_id")
    .eq("company_workspace_id", args.workspaceId)
    .eq("email", args.email)
    .is("accepted_at", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function resolveHarperSlackWorkspaceAccess(args: {
  slackUserId: string;
  token: string;
  workspaceId: string;
}): Promise<HarperSlackWorkspaceAccess> {
  const admin = getSupabaseAdmin();
  const workspaceName = await loadWorkspaceName(admin, args.workspaceId);
  let email: string | null = null;
  try {
    email = await getHarperSlackUserEmail({
      token: args.token,
      userId: args.slackUserId,
    });
  } catch (error) {
    console.warn("[harper-slack/access:user-email]", {
      error: error instanceof Error ? error.message : String(error),
      slackUserId: args.slackUserId,
      workspaceId: args.workspaceId,
    });
  }
  if (!email) {
    return {
      allowed: false,
      email: null,
      hasPendingInvitation: false,
      reason: "email_unavailable",
      workspaceName,
    };
  }

  const member = await findHarperSlackWorkspaceMember({
    admin,
    email,
    workspaceId: args.workspaceId,
  });
  if (member) {
    const { data: authData, error: authError } =
      await admin.auth.admin.getUserById(member.companyUserId);
    if (authError) throw authError;
    if (clean(authData.user?.email).toLowerCase() === email) {
      return { allowed: true, email, member, workspaceName };
    }
    console.warn("[harper-slack/access:stale-member-email]", {
      companyUserId: member.companyUserId,
      slackUserId: args.slackUserId,
      workspaceId: args.workspaceId,
    });
  }

  return {
    allowed: false,
    email,
    hasPendingInvitation: await hasPendingWorkspaceInvitation({
      admin,
      email,
      workspaceId: args.workspaceId,
    }),
    reason: "not_member",
    workspaceName,
  };
}

export async function postHarperSlackAccessDenied(args: {
  access: HarperSlackWorkspaceAccess;
  channelId: string;
  reason?: HarperSlackAccessDenialReason;
  slackUserId: string;
  token: string;
}) {
  const reason = args.reason ?? (args.access.allowed ? null : args.access.reason);
  if (!reason) throw new Error("Slack access denial reason is required");
  await postHarperSlackEphemeralMessage({
    channelId: args.channelId,
    text: buildHarperSlackAccessDeniedMessage({
      email: args.access.email,
      hasPendingInvitation:
        !args.access.allowed && args.access.hasPendingInvitation,
      reason,
      workspaceName: args.access.workspaceName,
    }),
    token: args.token,
    userId: args.slackUserId,
  });
}
