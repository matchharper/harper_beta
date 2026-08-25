import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  applyWebsiteCompanyDataChanges,
  normalizeWebsiteCompanyDataStringList,
} from "@/lib/org/companyDataWebsite";
import {
  assertOrgWorkspacePermission,
  OrgHttpError,
  updateOrgRoleCriteria,
  upsertOrgCompanyUser,
} from "@/lib/org/server";
import {
  fetchOrgRoleNotificationSettings,
  updateOrgRoleNotificationSettings,
} from "@/lib/org/roleNotifications";
import {
  ensureOrgRoleCreationConversation,
  fetchRoleForOrgAgent,
  fetchWorkspaceForOrgAgent,
  type OrgAgentConversationRow,
} from "@/lib/org/agent/store";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { Json } from "@/types/database.types";
import {
  isUnambiguousFinalRoleNotificationDefault,
  validateRoleCreationNotificationConsent,
} from "@/lib/org/agent/roleCreationConsent";
import {
  hasCompleteOrgRoleCriteria,
  type OrgRoleCriterion,
} from "@/lib/org/roleCriteria";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

export type RoleCreationConversationMetadata = {
  completedAt: string | null;
  completedBy: string | null;
  confirmationProcessingActionId: string | null;
  confirmationProcessingDecision: "no" | "yes" | null;
  confirmationProcessingMessageId: number | null;
  confirmationProcessingStartedAt: string | null;
  confirmedAssigneeUserId: string | null;
  confirmedSlackChannelIds: string[];
  descriptionSourceResearch?: {
    attemptedAt: string;
    query: string;
    resultCount: number | null;
    selectedSourceUrl: string | null;
    source: "role_creation_chat" | "slack_entry";
    status: "completed" | "failed";
  } | null;
  lastConfirmationActionId: string | null;
  lastConfirmationDecision: "no" | "yes" | null;
  lastConfirmationHandledAt: string | null;
  lastConfirmationMessageId: number | null;
  pendingConfirmationMessageId: number | null;
  phase:
    | "collecting"
    | "completed"
    | "confirmation_pending"
    | "confirmation_processing";
  scope: "role_creation";
  slackRoleCreationThread: {
    slackThreadId: string;
    slackThreadTs: string;
    sourceKey: string;
    threadPermalink: string | null;
  } | null;
};

export type RoleCreationState = {
  assigneeUserIds: string[];
  channels: Array<{
    channelId: string;
    channelName: string | null;
    enabled: boolean;
  }>;
  conversation: OrgAgentConversationRow;
  currentUser: { email: string | null; name: string; userId: string };
  members: Array<{ email: string | null; name: string; userId: string }>;
  metadata: RoleCreationConversationMetadata;
  role: Awaited<ReturnType<typeof fetchRoleForOrgAgent>>;
  workspace: Awaited<ReturnType<typeof fetchWorkspaceForOrgAgent>> & {
    relatedLinks: string[];
  };
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : []).map(text).filter(Boolean).slice(0, 20)
    )
  );
}

export function parseRoleCreationConversationMetadata(
  value: unknown
): RoleCreationConversationMetadata {
  const source = record(value);
  const phase =
    source.phase === "completed" ||
    source.phase === "confirmation_pending" ||
    source.phase === "confirmation_processing"
      ? source.phase
      : "collecting";
  const pendingConfirmationMessageId = Number(
    source.pendingConfirmationMessageId
  );
  const confirmationProcessingMessageId = Number(
    source.confirmationProcessingMessageId
  );
  const lastConfirmationMessageId = Number(source.lastConfirmationMessageId);
  const rawSlackRoleCreationThread = record(source.slackRoleCreationThread);
  const rawDescriptionSourceResearch = record(
    source.descriptionSourceResearch
  );
  const descriptionSourceResearch =
    text(rawDescriptionSourceResearch.attemptedAt) &&
    text(rawDescriptionSourceResearch.query) &&
    (rawDescriptionSourceResearch.status === "completed" ||
      rawDescriptionSourceResearch.status === "failed")
      ? {
          attemptedAt: text(rawDescriptionSourceResearch.attemptedAt),
          query: text(rawDescriptionSourceResearch.query),
          resultCount:
            Number.isSafeInteger(
              Number(rawDescriptionSourceResearch.resultCount)
            ) && Number(rawDescriptionSourceResearch.resultCount) >= 0
              ? Number(rawDescriptionSourceResearch.resultCount)
              : null,
          selectedSourceUrl:
            text(rawDescriptionSourceResearch.selectedSourceUrl) || null,
          source:
            rawDescriptionSourceResearch.source === "slack_entry"
              ? ("slack_entry" as const)
              : ("role_creation_chat" as const),
          status:
            rawDescriptionSourceResearch.status === "failed"
              ? ("failed" as const)
              : ("completed" as const),
        }
      : null;
  const slackRoleCreationThread =
    text(rawSlackRoleCreationThread.slackThreadId) &&
    text(rawSlackRoleCreationThread.slackThreadTs) &&
    text(rawSlackRoleCreationThread.sourceKey)
      ? {
          slackThreadId: text(rawSlackRoleCreationThread.slackThreadId),
          slackThreadTs: text(rawSlackRoleCreationThread.slackThreadTs),
          sourceKey: text(rawSlackRoleCreationThread.sourceKey),
          threadPermalink:
            text(rawSlackRoleCreationThread.threadPermalink) || null,
        }
      : null;
  return {
    completedAt: text(source.completedAt) || null,
    completedBy: text(source.completedBy) || null,
    confirmationProcessingActionId:
      text(source.confirmationProcessingActionId) || null,
    confirmationProcessingDecision:
      source.confirmationProcessingDecision === "no" ||
      source.confirmationProcessingDecision === "yes"
        ? source.confirmationProcessingDecision
        : null,
    confirmationProcessingMessageId:
      Number.isSafeInteger(confirmationProcessingMessageId) &&
      confirmationProcessingMessageId > 0
        ? confirmationProcessingMessageId
        : null,
    confirmationProcessingStartedAt:
      text(source.confirmationProcessingStartedAt) || null,
    confirmedAssigneeUserId: text(source.confirmedAssigneeUserId) || null,
    confirmedSlackChannelIds: stringList(source.confirmedSlackChannelIds),
    descriptionSourceResearch,
    lastConfirmationActionId: text(source.lastConfirmationActionId) || null,
    lastConfirmationDecision:
      source.lastConfirmationDecision === "no" ||
      source.lastConfirmationDecision === "yes"
        ? source.lastConfirmationDecision
        : null,
    lastConfirmationHandledAt: text(source.lastConfirmationHandledAt) || null,
    lastConfirmationMessageId:
      Number.isSafeInteger(lastConfirmationMessageId) &&
      lastConfirmationMessageId > 0
        ? lastConfirmationMessageId
        : null,
    pendingConfirmationMessageId:
      Number.isSafeInteger(pendingConfirmationMessageId) &&
      pendingConfirmationMessageId > 0
        ? pendingConfirmationMessageId
        : null,
    phase,
    scope: "role_creation",
    slackRoleCreationThread,
  };
}

export async function updateRoleCreationConversationMetadata(args: {
  admin: AdminClient;
  conversationId: string;
  current: unknown;
  patch: Partial<RoleCreationConversationMetadata>;
}) {
  const next = {
    ...parseRoleCreationConversationMetadata(args.current),
    ...args.patch,
    scope: "role_creation" as const,
  };
  const { error } = await args.admin
    .from("company_conversations")
    .update({
      metadata: next as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.conversationId);
  if (error) throw error;
  return next;
}

export async function createOrResumeDraftRole(args: {
  draftRoleId: string;
  user: User;
  workspaceId: string;
}) {
  const roleId = text(args.draftRoleId);
  const workspaceId = text(args.workspaceId);
  if (!workspaceId || !roleId) {
    throw new OrgHttpError(400, "workspaceId and draftRoleId are required");
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      roleId
    )
  ) {
    throw new OrgHttpError(400, "draftRoleId must be a UUID v4");
  }

  const admin = getSupabaseAdmin();
  await upsertOrgCompanyUser(admin, args.user);
  await assertOrgWorkspacePermission({
    admin,
    permission: "manage_candidates",
    user: args.user,
    workspaceId,
  });

  const { data: existing, error: existingError } = await admin
    .from("company_roles")
    .select("role_id, company_workspace_id, status, source_type, is_expired")
    .eq("role_id", roleId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    if (
      existing.company_workspace_id !== workspaceId ||
      text(existing.status).toLowerCase() !== "draft" ||
      existing.source_type !== "internal" ||
      existing.is_expired
    ) {
      throw new OrgHttpError(409, "draftRoleId is already in use");
    }
  }

  const now = new Date().toISOString();
  if (!existing) {
    const { error: insertError } = await admin.from("company_roles").insert({
      company_workspace_id: workspaceId,
      created_at: now,
      is_expired: false,
      name: "새 역할",
      opportunity_search_tsv: null,
      role_id: roleId,
      source_type: "internal",
      status: "draft",
      summary: {},
      type: [],
      updated_at: now,
    });
    if (insertError) {
      if (insertError.code !== "23505") throw insertError;
      const { data: raced, error: racedError } = await admin
        .from("company_roles")
        .select(
          "role_id, company_workspace_id, status, source_type, is_expired"
        )
        .eq("role_id", roleId)
        .maybeSingle();
      if (racedError) throw racedError;
      if (
        !raced ||
        raced.company_workspace_id !== workspaceId ||
        text(raced.status).toLowerCase() !== "draft" ||
        raced.source_type !== "internal" ||
        raced.is_expired
      ) {
        throw new OrgHttpError(409, "draftRoleId is already in use");
      }
    }
  }

  const { error: internalError } = await admin
    .from("company_internal_roles")
    .upsert(
      {
        request: null,
        role_id: roleId,
        updated_at: now,
      },
      { ignoreDuplicates: true, onConflict: "role_id" }
    );
  if (internalError) throw internalError;
  return roleId;
}

export async function fetchRoleCreationState(args: {
  allowCompletedRole?: boolean;
  roleId: string;
  user: User;
  workspaceId: string;
}): Promise<RoleCreationState> {
  const { admin, conversation } = await ensureOrgRoleCreationConversation(args);
  const [role, workspace, notificationSettings, membersResult] =
    await Promise.all([
      fetchRoleForOrgAgent({
        admin,
        roleId: args.roleId,
        workspaceId: args.workspaceId,
      }),
      fetchWorkspaceForOrgAgent({ admin, workspaceId: args.workspaceId }),
      fetchOrgRoleNotificationSettings(args),
      admin
        .from("company_user_workspace")
        .select("company_user_id, company_users(email, name)")
        .eq("company_workspace_id", args.workspaceId),
    ]);
  if (membersResult.error) throw membersResult.error;

  const companyLinksResult = workspace.companyDbId
    ? await admin
        .from("company_db")
        .select("funding_url, related_links")
        .eq("id", workspace.companyDbId)
        .maybeSingle()
    : { data: null, error: null };
  if (companyLinksResult.error) throw companyLinksResult.error;
  const companyLinks = companyLinksResult.data;
  const relatedLinks = Array.from(
    new Set(
      [
        text(workspace.careerUrl),
        text(companyLinks?.funding_url),
        ...normalizeWebsiteCompanyDataStringList(companyLinks?.related_links),
      ].filter(Boolean)
    )
  ).slice(0, 12);

  const members = (membersResult.data ?? []).map((row) => {
    const companyUser = record(row.company_users);
    return {
      email: text(companyUser.email) || null,
      name: text(companyUser.name) || text(companyUser.email) || "멤버",
      userId: row.company_user_id,
    };
  });
  const currentMember = members.find(
    (member) => member.userId === args.user.id
  );

  return {
    assigneeUserIds: notificationSettings.assigneeUserIds,
    channels: notificationSettings.channels,
    conversation,
    currentUser: {
      email: args.user.email ?? null,
      name:
        [currentMember?.name, args.user.user_metadata?.name, args.user.email]
          .map(text)
          .find(Boolean) ?? "작성자",
      userId: args.user.id,
    },
    members,
    metadata: parseRoleCreationConversationMetadata(conversation.metadata),
    role,
    workspace: { ...workspace, relatedLinks },
  };
}

export async function updateRoleCreationDraft(args: {
  actorLabel: string;
  allowCompletedRole?: boolean;
  criteria?: OrgRoleCriterion[];
  employmentTypes?: string[];
  externalJdUrl?: string | null;
  locationText?: string | null;
  memory?: string | null;
  name?: string;
  description?: string | null;
  request?: string | null;
  salaryRange?: string | null;
  roleId: string;
  user: User;
  workMode?: string | null;
  workspaceId: string;
}) {
  await fetchRoleCreationState(args);
  const changes: Parameters<
    typeof applyWebsiteCompanyDataChanges
  >[0]["changes"] = [];
  if (args.name !== undefined) {
    const name = text(args.name);
    if (!name) throw new OrgHttpError(400, "Role title cannot be empty");
    changes.push({ key: "role_name", roleId: args.roleId, value: name });
  }
  if (args.description !== undefined) {
    changes.push({
      key: "role_description",
      roleId: args.roleId,
      value: args.description,
    });
  }
  if (args.request !== undefined) {
    changes.push({
      key: "role_request",
      roleId: args.roleId,
      value: args.request,
    });
  }
  if (args.locationText !== undefined) {
    changes.push({
      key: "role_location",
      roleId: args.roleId,
      value: args.locationText,
    });
  }
  if (args.workMode !== undefined) {
    changes.push({
      key: "role_work_mode",
      roleId: args.roleId,
      value: args.workMode,
    });
  }
  if (args.employmentTypes !== undefined) {
    changes.push({
      key: "role_employment_types",
      roleId: args.roleId,
      value: args.employmentTypes,
    });
  }
  if (args.externalJdUrl !== undefined) {
    changes.push({
      key: "role_external_jd_url",
      roleId: args.roleId,
      value: args.externalJdUrl,
    });
  }
  if (changes.length > 0) {
    await applyWebsiteCompanyDataChanges({
      actorLabel: args.actorLabel,
      admin: getSupabaseAdmin(),
      changes,
      source: "chat",
      workspaceId: args.workspaceId,
    });
  }

  if (args.salaryRange !== undefined) {
    let query = getSupabaseAdmin()
      .from("company_roles")
      .update({
        salary_range: text(args.salaryRange).slice(0, 1_000) || null,
        updated_at: new Date().toISOString(),
      })
      .eq("company_workspace_id", args.workspaceId)
      .eq("role_id", args.roleId);
    if (!args.allowCompletedRole) {
      query = query.eq("status", "draft");
    }
    const { error } = await query;
    if (error) throw error;
  }

  if (args.criteria !== undefined) {
    await updateOrgRoleCriteria({
      actorLabel: args.actorLabel,
      criteria: args.criteria,
      roleId: args.roleId,
      source: "chat",
      user: args.user,
      workspaceId: args.workspaceId,
    });
  }

  if (args.memory !== undefined) {
    const admin = getSupabaseAdmin();
    const memory = text(args.memory);
    const { data: existing, error: existingError } = await admin
      .from("company_memories")
      .select("id")
      .eq("company_workspace_id", args.workspaceId)
      .eq("role_id", args.roleId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!memory && existing) {
      const { error } = await admin
        .from("company_memories")
        .delete()
        .eq("id", existing.id);
      if (error) throw error;
    } else if (memory && existing) {
      const { error } = await admin
        .from("company_memories")
        .update({
          content: memory.slice(0, 12_000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) throw error;
    } else if (memory) {
      const { error } = await admin.from("company_memories").insert({
        company_workspace_id: args.workspaceId,
        content: memory.slice(0, 12_000),
        role_id: args.roleId,
      });
      if (error) throw error;
    }
  }

  return fetchRoleCreationState(args);
}

export async function setRoleCreationNotification(args: {
  allowCompletedRole?: boolean;
  assigneeUserId?: string;
  channelIds?: string[];
  previousAssistantMessage: string;
  roleId: string;
  user: User;
  userMessage: string;
  workspaceId: string;
}) {
  const state = await fetchRoleCreationState(args);
  const hasChannels = args.channelIds !== undefined;
  const hasAssignee = args.assigneeUserId !== undefined;
  const channelIds = stringList(args.channelIds);
  const assigneeUserId = text(args.assigneeUserId);
  if (!hasChannels && !hasAssignee) {
    throw new OrgHttpError(400, "Slack channel or assignee is required");
  }
  if (hasChannels && channelIds.length === 0) {
    throw new OrgHttpError(400, "At least one Slack channel is required");
  }
  if (hasAssignee && !assigneeUserId) {
    throw new OrgHttpError(400, "One assignee is required");
  }
  const availableChannelIds = new Set(
    state.channels.map((item) => item.channelId)
  );
  if (channelIds.some((channelId) => !availableChannelIds.has(channelId))) {
    throw new OrgHttpError(400, "Unknown Slack channel");
  }
  if (
    hasAssignee &&
    !state.members.some((member) => member.userId === assigneeUserId)
  ) {
    throw new OrgHttpError(400, "Assignee must be an organization member");
  }

  const selectedChannels = hasChannels
    ? state.channels.filter((channel) => channelIds.includes(channel.channelId))
    : [];
  const selectedAssignee = hasAssignee
    ? state.members.find((member) => member.userId === assigneeUserId)
    : null;
  const consent = validateRoleCreationNotificationConsent({
    previousAssistantMessage: args.previousAssistantMessage,
    targets: [
      ...selectedChannels.map((channel) => ({
        aliases: [`#${channel.channelName ?? ""}`, channel.channelId],
        id: `channel:${channel.channelId}`,
        label: channel.channelName ?? channel.channelId,
      })),
      ...(selectedAssignee
        ? [
            {
              aliases: [
                selectedAssignee.email,
                selectedAssignee.userId,
                ...(selectedAssignee.userId === state.currentUser.userId
                  ? ["저로", "제가", "작성자", "본인"]
                  : []),
              ],
              id: `assignee:${selectedAssignee.userId}`,
              label: selectedAssignee.name,
            },
          ]
        : []),
    ],
    userMessage: args.userMessage,
  });
  const transparentFinalDefaults =
    hasChannels &&
    hasAssignee &&
    isUnambiguousFinalRoleNotificationDefault({
      availableChannelIds: state.channels
        .filter((channel) => channel.enabled)
        .map((channel) => channel.channelId),
      currentUserId: state.currentUser.userId,
      memberUserIds: state.members.map((member) => member.userId),
      roleStatus: state.role.status,
      selectedAssigneeUserId: assigneeUserId,
      selectedChannelIds: channelIds,
      unresolvedFields: getRoleCreationMissingFields(state),
    });
  if (!consent.ok && !transparentFinalDefaults) {
    throw new OrgHttpError(
      409,
      "Slack channel and assignee changes require explicit user confirmation"
    );
  }

  await updateOrgRoleNotificationSettings({
    ...(hasAssignee ? { assigneeUserIds: [assigneeUserId] } : {}),
    ...(hasChannels
      ? {
          channels: state.channels.map((channel) => ({
            channelId: channel.channelId,
            enabled: channelIds.includes(channel.channelId),
          })),
        }
      : {}),
    roleId: args.roleId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  await updateRoleCreationConversationMetadata({
    admin: getSupabaseAdmin(),
    conversationId: state.conversation.id,
    current: state.conversation.metadata,
    patch: {
      ...(hasAssignee ? { confirmedAssigneeUserId: assigneeUserId } : {}),
      ...(hasChannels ? { confirmedSlackChannelIds: channelIds } : {}),
      phase: state.role.status === "draft" ? "collecting" : "completed",
    },
  });
  return fetchRoleCreationState(args);
}

export function getRoleCreationMissingFields(state: RoleCreationState) {
  const missing: string[] = [];
  if (!state.role.name || state.role.name === "새 역할")
    missing.push("role_title");
  if (!text(state.role.description)) missing.push("description");
  if (!text(state.role.request)) missing.push("request");
  if (!hasCompleteOrgRoleCriteria(state.role.criteria))
    missing.push("criteria");
  if (!text(state.role.locationText)) missing.push("location");
  if (!text(state.role.workMode)) missing.push("work_mode");
  if (state.role.employmentTypes.length === 0) missing.push("employment_type");
  const availableChannels = new Set(
    state.channels
      .filter((channel) => channel.enabled)
      .map((channel) => channel.channelId)
  );
  if (
    state.metadata.confirmedSlackChannelIds.length === 0 ||
    state.metadata.confirmedSlackChannelIds.some(
      (channelId) => !availableChannels.has(channelId)
    )
  ) {
    missing.push("connected_slack");
  }
  if (
    state.assigneeUserIds.length !== 1 ||
    !state.metadata.confirmedAssigneeUserId ||
    state.assigneeUserIds[0] !== state.metadata.confirmedAssigneeUserId ||
    !state.members.some(
      (member) => member.userId === state.metadata.confirmedAssigneeUserId
    )
  ) {
    missing.push("assignee");
  }
  return missing;
}

export async function fetchOtherRoleCriteria(args: {
  allowCompletedRole?: boolean;
  roleId: string;
  user: User;
  workspaceId: string;
}) {
  const state = await fetchRoleCreationState(args);
  const { data, error } = await getSupabaseAdmin()
    .from("company_roles")
    .select(
      "role_id, name, description, company_internal_roles(request, criteria)"
    )
    .eq("company_workspace_id", args.workspaceId)
    .eq("source_type", "internal")
    .neq("role_id", args.roleId)
    .not("is_expired", "is", true)
    .order("updated_at", { ascending: false })
    .limit(8);
  if (error) throw error;
  const roleIds = (data ?? []).map((role) => role.role_id);
  const memoriesResult =
    roleIds.length > 0
      ? await getSupabaseAdmin()
          .from("company_memories")
          .select("role_id, content")
          .eq("company_workspace_id", args.workspaceId)
          .in("role_id", roleIds)
      : { data: [], error: null };
  if (memoriesResult.error) throw memoriesResult.error;
  const memoryByRoleId = new Map(
    (memoriesResult.data ?? []).map((item) => [
      item.role_id,
      text(item.content).slice(0, 2_500) || null,
    ])
  );
  return {
    companyName: state.workspace.companyName,
    roles: (data ?? []).map((role) => ({
      criteria: record(role.company_internal_roles).criteria ?? [],
      description: text(role.description).slice(0, 2_500) || null,
      name: role.name,
      memory: memoryByRoleId.get(role.role_id) ?? null,
      request:
        text(record(role.company_internal_roles).request).slice(0, 2_500) ||
        null,
      roleId: role.role_id,
    })),
  };
}

export async function fetchOtherRoleDescriptionReferences(args: {
  allowCompletedRole?: boolean;
  roleId: string;
  user: User;
  workspaceId: string;
}) {
  const state = await fetchRoleCreationState(args);
  const { data, error } = await getSupabaseAdmin()
    .from("company_roles")
    .select(
      "role_id, name, description, external_jd_url, source_type, updated_at"
    )
    .eq("company_workspace_id", args.workspaceId)
    .neq("role_id", args.roleId)
    .not("is_expired", "is", true)
    .not("description", "is", null)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  return {
    companyName: state.workspace.companyName,
    roles: (data ?? []).flatMap((role) => {
      const description = text(role.description).slice(0, 6_000);
      if (!description) return [];
      return [
        {
          description,
          externalJdUrl: text(role.external_jd_url) || null,
          name: role.name,
          roleId: role.role_id,
          sourceType: role.source_type,
        },
      ];
    }),
  };
}
