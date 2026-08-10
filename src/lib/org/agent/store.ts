import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  assertOrgWorkspacePermission,
  OrgHttpError,
  type OrgRole,
  upsertOrgCompanyUser,
} from "@/lib/org/server";
import type {
  OrgAgentConversation,
  OrgAgentMention,
  OrgAgentMessage,
  OrgAgentMessageMetadata,
  OrgAgentMessageRole,
  OrgAgentMessageStatus,
  OrgAgentMoreDataKind,
  OrgAgentRetainedDataActivation,
  OrgAgentThinkingLog,
} from "@/lib/org/agent/types";
import type { Json } from "@/types/database.types";
import {
  isOrgAgentRetainedDataActivationActive,
  RETAINED_MORE_DATA_MAX_AGE_HOURS,
} from "@/lib/org/agent/retention";
import {
  mergeOrgAgentMessageMetadata,
  resolveAdoptableSlackUserMessageIdentity,
} from "@/lib/org/agent/messageIdempotency";
import { createOrgAgentConversationHistoryCursor } from "@/lib/org/agent/conversationHistory";

export {
  isOrgAgentRetainedDataActivationActive,
  RETAINED_MORE_DATA_MAX_AGE_HOURS,
  RETAINED_MORE_DATA_USER_TURNS,
} from "@/lib/org/agent/retention";

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

export type OrgAgentConversationRow = {
  company_workspace_id: string;
  created_at: string;
  id: string;
  last_message_at: string | null;
  last_message_id: number | null;
  metadata: Json;
  role_id: string | null;
  summary_cursor_message_id: number | null;
  title: string | null;
  updated_at: string;
};

export type OrgAgentMessageRow = {
  company_user_id: string | null;
  company_workspace_id: string;
  content: string;
  conversation_id: string;
  created_at: string;
  id: number;
  mentions: Json;
  message_type: string;
  metadata: Json;
  model: string | null;
  role: OrgAgentMessageRole;
  role_id: string | null;
  slack_thread_id?: string | null;
  slack_user_id?: string | null;
  status: OrgAgentMessageStatus;
  thinking_logs: Json;
};

export type OrgAgentPromptMessageScope =
  | { kind: "chat" }
  | { kind: "slack"; slackThreadId: string };

export type OrgAgentPromptMessageView = {
  content: string;
  createdAt: string;
  id: number;
  metadata: OrgAgentMessageMetadata;
  mentions: OrgAgentMention[];
  role: OrgAgentMessageRole;
  slackThreadId: string | null;
  slackUserId: string | null;
};

export type OrgAgentPromptMessagePage = {
  hasMore: boolean;
  messages: OrgAgentPromptMessageView[];
  nextCursor: string | null;
};

export type OrgAgentStoredRole = OrgRole & {
  hasMemory: boolean;
  memory: string | null;
};

export type OrgAgentWorkspaceData = {
  brief?: string | null;
  careerUrl?: string | null;
  companyDescription: string | null;
  companyDbId?: number | null;
  companyName: string;
  homepageUrl?: string | null;
  linkedinUrl?: string | null;
  logoUrl: string | null;
  pitch: string | null;
  request: string | null;
  updatedAt: string;
  workspaceId: string;
};

export type OrgAgentSummaryRow = {
  company_workspace_id: string;
  content: string;
  conversation_id: string;
  created_at: string;
  id: number;
  message_count: number;
  metadata: Json;
  model: string | null;
  role_id: string | null;
  source_end_message_id: number;
  source_start_message_id: number;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeMention(value: unknown): OrgAgentMention | null {
  if (!isRecord(value)) return null;
  const talentId = normalizeText(value.talentId);
  const displayName = normalizeText(value.displayName);
  if (!talentId || !displayName) return null;
  return {
    displayName,
    recommendationId: normalizeText(value.recommendationId) || null,
    roleId: normalizeText(value.roleId) || null,
    talentId,
  };
}

function safeMentions(value: unknown): OrgAgentMention[] {
  if (!Array.isArray(value)) return [];
  const mentions: OrgAgentMention[] = [];
  for (const item of value) {
    const mention = safeMention(item);
    if (mention) mentions.push(mention);
  }
  return mentions.slice(0, 20);
}

function safeThinkingLogs(value: unknown): OrgAgentThinkingLog[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item): OrgAgentThinkingLog[] => {
      if (!isRecord(item)) return [];
      const at = normalizeText(item.at);
      const label = normalizeText(item.label);
      if (!at || !label) return [];
      const status =
        item.status === "running" ||
        item.status === "done" ||
        item.status === "error"
          ? item.status
          : undefined;
      return [{ at, label, status }];
    })
    .slice(0, 20);
}

function safeMetadata(value: unknown): OrgAgentMessageMetadata {
  return isRecord(value) ? (value as OrgAgentMessageMetadata) : {};
}

function safeRetainedDataActivations(
  value: unknown
): OrgAgentRetainedDataActivation[] {
  if (!Array.isArray(value)) return [];
  const allowedKinds = new Set<OrgAgentMoreDataKind>([
    "members",
    "company_details",
    "workspace_memory",
  ]);
  return value.flatMap((item): OrgAgentRetainedDataActivation[] => {
    if (!isRecord(item)) return [];
    const kind = normalizeText(item.kind) as OrgAgentMoreDataKind;
    const scopeKey = normalizeText(item.scopeKey);
    const activatedByUserMessageId = Number(item.activatedByUserMessageId);
    if (
      !allowedKinds.has(kind) ||
      !scopeKey ||
      !Number.isSafeInteger(activatedByUserMessageId) ||
      activatedByUserMessageId <= 0
    ) {
      return [];
    }
    return [
      {
        activatedAt: normalizeText(item.activatedAt) || null,
        activatedByUserMessageId,
        fullTextKeys: Array.isArray(item.fullTextKeys)
          ? Array.from(
              new Set(
                item.fullTextKeys
                  .map(normalizeText)
                  .filter(Boolean)
                  .slice(0, 10)
              )
            )
          : [],
        kind,
        scopeKey,
      },
    ];
  });
}

function applyPromptMessageScope(
  query: any,
  scope: OrgAgentPromptMessageScope
) {
  if (scope.kind === "slack") {
    return query
      .eq("message_type", "slack")
      .eq("slack_thread_id", scope.slackThreadId);
  }
  return query.eq("message_type", "chat");
}

function normalizeMessageStatus(value: unknown): OrgAgentMessageStatus {
  return value === "pending" || value === "failed" ? value : "completed";
}

export function toOrgAgentConversation(
  row: OrgAgentConversationRow
): OrgAgentConversation {
  return {
    conversationId: row.id,
    roleId: row.role_id,
    title: row.title ?? null,
    workspaceId: row.company_workspace_id,
  };
}

export function toOrgAgentMessage(row: OrgAgentMessageRow): OrgAgentMessage {
  const storedMetadata = safeMetadata(row.metadata);
  const visibleMetadata = { ...storedMetadata };
  delete visibleMetadata.roleCreationAttachments;
  return {
    authorUserId: row.company_user_id ?? null,
    content: row.content ?? "",
    createdAt: row.created_at,
    id: Number(row.id),
    mentions: safeMentions(row.mentions),
    metadata: visibleMetadata,
    model: row.model ?? null,
    role: row.role,
    status: normalizeMessageStatus(row.status),
    thinkingLogs: safeThinkingLogs(row.thinking_logs),
  };
}

export async function ensureOrgAgentConversation(args: {
  user: User;
  workspaceId: string;
}): Promise<{
  admin: SupabaseAdminClient;
  conversation: OrgAgentConversationRow;
}> {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  if (!workspaceId) throw new OrgHttpError(400, "workspaceId is required");

  await upsertOrgCompanyUser(admin, args.user);
  await assertOrgWorkspacePermission({
    admin,
    permission: "manage_candidates",
    user: args.user,
    workspaceId,
  });

  const { data: existing, error: existingError } = await (
    admin.from("company_conversations" as any) as any
  )
    .select(
      "id, company_workspace_id, role_id, title, last_message_at, last_message_id, summary_cursor_message_id, metadata, created_at, updated_at"
    )
    .eq("company_workspace_id", workspaceId)
    .is("role_id", null)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    return { admin, conversation: existing as OrgAgentConversationRow };
  }

  const now = new Date().toISOString();
  const { data, error } = await (
    admin.from("company_conversations" as any) as any
  )
    .insert({
      company_workspace_id: workspaceId,
      created_at: now,
      metadata: {},
      role_id: null,
      title: null,
      updated_at: now,
    })
    .select(
      "id, company_workspace_id, role_id, title, last_message_at, last_message_id, summary_cursor_message_id, metadata, created_at, updated_at"
    )
    .single();

  if (!error) {
    return { admin, conversation: data as OrgAgentConversationRow };
  }

  if ((error as { code?: string }).code !== "23505") throw error;

  const { data: raced, error: racedError } = await (
    admin.from("company_conversations" as any) as any
  )
    .select(
      "id, company_workspace_id, role_id, title, last_message_at, last_message_id, summary_cursor_message_id, metadata, created_at, updated_at"
    )
    .eq("company_workspace_id", workspaceId)
    .is("role_id", null)
    .single();

  if (racedError) throw racedError;
  return { admin, conversation: raced as OrgAgentConversationRow };
}

/**
 * Returns the chat-only conversation owned by one role. This is deliberately
 * separate from ensureOrgAgentConversation so normal web chat and Slack
 * continue to share only the role_id-null workspace conversation.
 */
export async function ensureOrgRoleCreationConversation(args: {
  allowCompletedRole?: boolean;
  user: User;
  roleId: string;
  workspaceId: string;
}): Promise<{
  admin: SupabaseAdminClient;
  conversation: OrgAgentConversationRow;
}> {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  const roleId = normalizeText(args.roleId);
  if (!workspaceId || !roleId) {
    throw new OrgHttpError(400, "workspaceId and roleId are required");
  }

  await upsertOrgCompanyUser(admin, args.user);
  await assertOrgWorkspacePermission({
    admin,
    permission: "manage_candidates",
    user: args.user,
    workspaceId,
  });

  const { data: role, error: roleError } = await (
    admin.from("company_roles" as any) as any
  )
    .select("role_id, status")
    .eq("company_workspace_id", workspaceId)
    .eq("role_id", roleId)
    .eq("source_type", "internal")
    .not("is_expired", "is", true)
    .maybeSingle();
  if (roleError) throw roleError;
  if (!role) throw new OrgHttpError(404, "Role not found");
  const roleStatus = normalizeText(role.status).toLowerCase();
  if (roleStatus !== "draft" && !args.allowCompletedRole) {
    throw new OrgHttpError(409, "Role creation is already complete");
  }

  const select =
    "id, company_workspace_id, role_id, title, last_message_at, last_message_id, summary_cursor_message_id, metadata, created_at, updated_at";
  const { data: existing, error: existingError } = await (
    admin.from("company_conversations" as any) as any
  )
    .select(select)
    .eq("company_workspace_id", workspaceId)
    .eq("role_id", roleId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    return { admin, conversation: existing as OrgAgentConversationRow };
  }

  const now = new Date().toISOString();
  const metadata = {
    confirmedAssigneeUserId: null,
    confirmedSlackChannelIds: [],
    pendingConfirmationMessageId: null,
    phase: roleStatus === "draft" ? "collecting" : "completed",
    scope: "role_creation",
  };
  const { data, error } = await (
    admin.from("company_conversations" as any) as any
  )
    .insert({
      company_workspace_id: workspaceId,
      created_at: now,
      metadata,
      role_id: roleId,
      title: "새 역할 등록",
      updated_at: now,
    })
    .select(select)
    .single();
  if (!error) {
    return { admin, conversation: data as OrgAgentConversationRow };
  }
  if ((error as { code?: string }).code !== "23505") throw error;

  const { data: raced, error: racedError } = await (
    admin.from("company_conversations" as any) as any
  )
    .select(select)
    .eq("company_workspace_id", workspaceId)
    .eq("role_id", roleId)
    .single();
  if (racedError) throw racedError;
  return { admin, conversation: raced as OrgAgentConversationRow };
}

export async function fetchOrgAgentMessages(args: {
  beforeMessageId?: number | null;
  limit?: number | null;
  mode?: "general" | "role_creation";
  roleId?: string | null;
  user: User;
  workspaceId: string;
}) {
  const scoped =
    args.mode === "role_creation"
      ? await ensureOrgRoleCreationConversation({
          allowCompletedRole: true,
          roleId: normalizeText(args.roleId),
          user: args.user,
          workspaceId: args.workspaceId,
        })
      : await ensureOrgAgentConversation(args);
  const { admin, conversation } = scoped;
  const limit = Math.min(Math.max(args.limit ?? 30, 1), 80);
  let query = (admin.from("company_messages" as any) as any)
    .select(
      "id, conversation_id, company_workspace_id, role_id, company_user_id, role, content, message_type, model, status, mentions, thinking_logs, metadata, created_at"
    )
    .eq("conversation_id", conversation.id)
    .eq("message_type", "chat")
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (typeof args.beforeMessageId === "number" && args.beforeMessageId > 0) {
    query = query.lt("id", args.beforeMessageId);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = ((data ?? []) as OrgAgentMessageRow[]).slice(0, limit);
  const messages = rows.reverse().map(toOrgAgentMessage);
  const hasMore = (data ?? []).length > limit;

  return {
    conversation: toOrgAgentConversation(conversation),
    hasMore,
    messages,
    nextCursor: hasMore ? (messages[0]?.id ?? null) : null,
    ok: true as const,
  };
}

export async function insertOrgAgentMessage(args: {
  admin: SupabaseAdminClient;
  content: string;
  conversation: OrgAgentConversationRow;
  mentions?: OrgAgentMention[];
  messageType?: string;
  metadata?: OrgAgentMessageMetadata;
  model?: string | null;
  role: OrgAgentMessageRole;
  roleId?: string | null;
  slackMessageTs?: string | null;
  slackThreadId?: string | null;
  slackUserId?: string | null;
  status?: OrgAgentMessageStatus;
  thinkingLogs?: OrgAgentThinkingLog[];
  userId?: string | null;
}) {
  const now = new Date().toISOString();
  const messageType = args.messageType ?? "chat";
  const { data, error } = await (
    args.admin.from("company_messages" as any) as any
  )
    .insert({
      company_user_id: args.userId ?? null,
      company_workspace_id: args.conversation.company_workspace_id,
      content: args.content,
      conversation_id: args.conversation.id,
      created_at: now,
      mentions: (args.mentions ?? []) as unknown as Json,
      message_type: messageType,
      metadata: (args.metadata ?? {}) as Json,
      model: args.model ?? null,
      role: args.role,
      role_id: args.roleId ?? null,
      slack_message_ts: args.slackMessageTs ?? null,
      slack_thread_id: args.slackThreadId ?? null,
      slack_user_id: args.slackUserId ?? null,
      status: args.status ?? "completed",
      thinking_logs: (args.thinkingLogs ?? []) as unknown as Json,
    })
    .select(
      "id, conversation_id, company_workspace_id, role_id, company_user_id, role, content, message_type, model, status, mentions, thinking_logs, metadata, created_at"
    )
    .single();

  let row: OrgAgentMessageRow;
  if (!error) {
    row = data as OrgAgentMessageRow;
  } else {
    const identity = resolveAdoptableSlackUserMessageIdentity({
      content: args.content,
      conversationId: args.conversation.id,
      errorCode: (error as { code?: string }).code,
      messageType,
      role: args.role,
      slackMessageTs: args.slackMessageTs,
      slackThreadId: args.slackThreadId,
      workspaceId: args.conversation.company_workspace_id,
    });
    if (!identity) throw error;

    // The Slack Events API and a worker retry can race to persist the same
    // user message. Adopt only the exact timestamp row; a timestamp collision
    // with different scope or content remains a hard conflict.
    const { data: existing, error: existingError } = await (
      args.admin.from("company_messages" as any) as any
    )
      .select(
        "id, conversation_id, company_workspace_id, role_id, company_user_id, role, content, message_type, model, status, mentions, thinking_logs, metadata, created_at"
      )
      .eq("message_type", identity.messageType)
      .eq("slack_thread_id", identity.slackThreadId)
      .eq("slack_message_ts", identity.slackMessageTs)
      .eq("conversation_id", identity.conversationId)
      .eq("company_workspace_id", identity.workspaceId)
      .eq("role", identity.role)
      .eq("content", identity.content)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) throw error;
    row = existing as OrgAgentMessageRow;

    const mergedMetadata = mergeOrgAgentMessageMetadata(
      row.metadata,
      args.metadata
    );
    if (mergedMetadata.changed) {
      const { error: metadataError } = await (
        args.admin.from("company_messages" as any) as any
      )
        .update({ metadata: mergedMetadata.metadata as Json })
        .eq("id", row.id);
      if (metadataError) throw metadataError;
      row = {
        ...row,
        metadata: mergedMetadata.metadata as Json,
      };
    }
  }

  const { error: conversationError } = await (
    args.admin.from("company_conversations" as any) as any
  )
    .update({
      last_message_at: row.created_at,
      last_message_id: row.id,
      updated_at: row.created_at,
    })
    .eq("id", args.conversation.id);

  if (conversationError) throw conversationError;
  return toOrgAgentMessage(row);
}

function toPromptMessageView(row: {
  content: string;
  created_at: string;
  id: number;
  metadata: Json;
  mentions: Json;
  role: OrgAgentMessageRole;
  slack_thread_id: string | null;
  slack_user_id: string | null;
}): OrgAgentPromptMessageView {
  return {
    content: row.content ?? "",
    createdAt: row.created_at,
    id: Number(row.id),
    metadata: isRecord(row.metadata)
      ? (row.metadata as OrgAgentMessageMetadata)
      : {},
    mentions: safeMentions(row.mentions),
    role: row.role,
    slackThreadId: normalizeText(row.slack_thread_id) || null,
    slackUserId: normalizeText(row.slack_user_id) || null,
  };
}

export async function fetchRecentOrgAgentPromptMessages(args: {
  admin: SupabaseAdminClient;
  beforeMessageId?: number | null;
  conversationId: string;
  limit?: number;
  scope?: OrgAgentPromptMessageScope;
}): Promise<OrgAgentPromptMessagePage> {
  const scope = args.scope ?? { kind: "chat" };
  const limit = args.limit ?? 16;
  let query = (args.admin.from("company_messages" as any) as any)
    .select(
      "id, role, content, created_at, mentions, metadata, message_type, slack_thread_id, slack_user_id"
    )
    .eq("conversation_id", args.conversationId)
    .order("id", { ascending: false });

  query = applyPromptMessageScope(query, scope);

  if (args.beforeMessageId) {
    query = query.lt("id", args.beforeMessageId);
  }

  const { data, error } = await query.limit(limit + 1);

  if (error) throw error;
  const rows = (data ?? []) as Array<{
    content: string;
    created_at: string;
    id: number;
    metadata: Json;
    mentions: Json;
    role: OrgAgentMessageRole;
    slack_thread_id: string | null;
    slack_user_id: string | null;
  }>;
  const selected = rows.slice(0, limit);
  const oldest = selected.at(-1);
  const hasMore = rows.length > limit;
  return {
    hasMore,
    messages: selected.reverse().map(toPromptMessageView),
    nextCursor:
      hasMore && oldest && scope.kind === "slack"
        ? createOrgAgentConversationHistoryCursor({
            beforeId: Number(oldest.id),
            scope: "current_thread",
            slackThreadId: scope.slackThreadId,
          })
        : null,
  };
}

export async function countStartedCompanyAgentTurns(args: {
  activatedByUserMessageId: number;
  admin: SupabaseAdminClient;
  conversationId: string;
  currentUserMessageId: number;
  scope: OrgAgentPromptMessageScope;
}) {
  let query = (args.admin.from("company_messages" as any) as any)
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", args.conversationId)
    .eq("role", "user")
    .gt("id", args.activatedByUserMessageId)
    .lte("id", args.currentUserMessageId)
    .contains("metadata", {
      source:
        args.scope.kind === "slack" ? "org_agent_slack_user" : "org_agent_user",
    });
  query = applyPromptMessageScope(query, args.scope);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Resolves get_more_data auto-load leases. The stored metadata is only a
 * selector; callers re-read the selected data so retained context never
 * freezes an old database snapshot.
 */
export async function fetchActiveOrgAgentRetainedDataActivations(args: {
  admin: SupabaseAdminClient;
  conversationId: string;
  currentUserMessageId: number;
  now?: Date;
  scope: OrgAgentPromptMessageScope;
  scopeKey: string;
}) {
  const now = args.now ?? new Date();
  const oldest = new Date(
    now.getTime() - RETAINED_MORE_DATA_MAX_AGE_HOURS * 60 * 60 * 1_000
  ).toISOString();
  let query = (args.admin.from("company_messages" as any) as any)
    .select("id, created_at, metadata")
    .eq("conversation_id", args.conversationId)
    .eq("role", "assistant")
    .lt("id", args.currentUserMessageId)
    .gte("created_at", oldest)
    .order("id", { ascending: false })
    .limit(100);
  query = applyPromptMessageScope(query, args.scope);
  const { data, error } = await query;
  if (error) throw error;

  const latestByKind = new Map<
    OrgAgentMoreDataKind,
    OrgAgentRetainedDataActivation
  >();
  for (const row of (data ?? []) as Array<{
    created_at: string;
    metadata: Json;
  }>) {
    const metadata = safeMetadata(row.metadata);
    for (const activation of safeRetainedDataActivations(
      metadata.retainedDataActivations
    )) {
      if (
        activation.scopeKey !== args.scopeKey ||
        latestByKind.has(activation.kind)
      ) {
        continue;
      }
      const activatedAt = new Date(activation.activatedAt || row.created_at);
      if (
        !Number.isFinite(activatedAt.getTime()) ||
        now.getTime() - activatedAt.getTime() >
          RETAINED_MORE_DATA_MAX_AGE_HOURS * 60 * 60 * 1_000
      ) {
        continue;
      }
      latestByKind.set(activation.kind, {
        ...activation,
        activatedAt: activatedAt.toISOString(),
      });
    }
  }

  const active: OrgAgentRetainedDataActivation[] = [];
  for (const kind of [
    "members",
    "company_details",
    "workspace_memory",
  ] as const) {
    const activation = latestByKind.get(kind);
    if (!activation) continue;
    const turns = await countStartedCompanyAgentTurns({
      activatedByUserMessageId: activation.activatedByUserMessageId,
      admin: args.admin,
      conversationId: args.conversationId,
      currentUserMessageId: args.currentUserMessageId,
      scope: args.scope,
    });
    if (
      isOrgAgentRetainedDataActivationActive({
        activatedAt: activation.activatedAt!,
        now,
        startedUserTurns: turns,
      })
    ) {
      active.push(activation);
    }
  }
  return active;
}

export async function fetchRecentOrgAgentSummaries(args: {
  admin: SupabaseAdminClient;
  conversationId: string;
  limit?: number;
}) {
  const { data, error } = await (
    args.admin.from("company_conversation_summaries" as any) as any
  )
    .select(
      "id, conversation_id, company_workspace_id, role_id, source_start_message_id, source_end_message_id, message_count, content, model, metadata, created_at"
    )
    .eq("conversation_id", args.conversationId)
    .order("source_end_message_id", { ascending: false })
    .limit(args.limit ?? 3);

  if (error) throw error;
  return ((data ?? []) as OrgAgentSummaryRow[]).reverse();
}

export async function fetchRoleForOrgAgent(args: {
  admin: SupabaseAdminClient;
  includeCriteria?: boolean;
  includeMemory?: boolean;
  roleId: string;
  workspaceId: string;
}): Promise<OrgAgentStoredRole> {
  const { data, error } = await (args.admin.from("company_roles" as any) as any)
    .select(
      "role_id, company_workspace_id, name, external_jd_url, description, request, salary_range, status, type, location_text, work_mode, created_at, updated_at"
    )
    .eq("company_workspace_id", args.workspaceId)
    .eq("role_id", args.roleId)
    .eq("source_type", "internal")
    .not("is_expired", "is", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new OrgHttpError(404, "Role not found");
  const row = data as {
    company_workspace_id: string;
    created_at: string;
    description: string | null;
    external_jd_url: string | null;
    location_text: string | null;
    name: string;
    request: string | null;
    role_id: string;
    salary_range: string | null;
    status: string | null;
    type: string[] | null;
    updated_at: string;
    work_mode: string | null;
  };
  const [internalResult, memoryResult] = await Promise.all([
    args.includeCriteria === false
      ? Promise.resolve({ data: null, error: null })
      : (args.admin.from("company_internal_roles" as any) as any)
          .select("request")
          .eq("role_id", args.roleId)
          .maybeSingle(),
    args.includeMemory === false
      ? Promise.resolve({ data: null, error: null })
      : (args.admin.from("company_memories" as any) as any)
          .select("content")
          .eq("company_workspace_id", args.workspaceId)
          .eq("role_id", args.roleId)
          .maybeSingle(),
  ]);
  if (internalResult.error) throw internalResult.error;
  if (memoryResult.error) throw memoryResult.error;
  const memory = normalizeText(memoryResult.data?.content) || null;
  return {
    createdAt: row.created_at,
    description: row.description ?? null,
    employmentTypes: Array.isArray(row.type) ? row.type : [],
    externalJdUrl: row.external_jd_url ?? null,
    locationText: row.location_text ?? null,
    name: row.name,
    hasMemory: Boolean(memory),
    memory,
    request: normalizeText(internalResult.data?.request) || null,
    roleId: row.role_id,
    salaryRange: row.salary_range ?? null,
    status: row.status ?? null,
    updatedAt: row.updated_at,
    workMode: row.work_mode ?? null,
    workspaceId: row.company_workspace_id,
  };
}

export async function fetchWorkspaceForOrgAgent(args: {
  admin: SupabaseAdminClient;
  workspaceId: string;
}): Promise<OrgAgentWorkspaceData> {
  const { data, error } = await (
    args.admin.from("company_workspace" as any) as any
  )
    .select(
      "company_workspace_id, company_db_id, company_name, brief, company_description, pitch, request, logo_url, homepage_url, career_url, linkedin_url, updated_at"
    )
    .eq("company_workspace_id", args.workspaceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new OrgHttpError(404, "Workspace not found");
  const row = data as {
    brief: string | null;
    career_url: string | null;
    company_description: string | null;
    company_db_id: number | null;
    company_name: string;
    company_workspace_id: string;
    logo_url: string | null;
    homepage_url: string | null;
    linkedin_url: string | null;
    pitch: string | null;
    request: string | null;
    updated_at: string;
  };
  return {
    brief: row.brief ?? null,
    careerUrl: row.career_url ?? null,
    companyDescription: row.company_description ?? null,
    companyDbId: row.company_db_id ?? null,
    companyName: row.company_name,
    homepageUrl: row.homepage_url ?? null,
    linkedinUrl: row.linkedin_url ?? null,
    logoUrl: row.logo_url ?? null,
    pitch: row.pitch ?? null,
    request: row.request ?? null,
    updatedAt: row.updated_at,
    workspaceId: row.company_workspace_id,
  };
}

export async function updateOrgAgentAssistantMessageMetadata(args: {
  actionId?: string | null;
  messageId: number;
  metadata: OrgAgentMessageMetadata;
  user: User;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  if (!workspaceId || !args.messageId) {
    throw new OrgHttpError(400, "Missing required fields");
  }

  const { data: row, error: rowError } = await (
    admin.from("company_messages" as any) as any
  )
    .select("id, company_workspace_id")
    .eq("id", args.messageId)
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();

  if (rowError) throw rowError;
  if (!row) throw new OrgHttpError(404, "Message not found");
  await assertOrgWorkspacePermission({
    admin,
    permission: "manage_candidates",
    user: args.user,
    workspaceId,
  });

  const { error } = await (admin.from("company_messages" as any) as any)
    .update({ metadata: args.metadata as Json })
    .eq("id", args.messageId)
    .eq("company_workspace_id", workspaceId);

  if (error) throw error;
}
