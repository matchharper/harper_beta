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
  OrgAgentThinkingLog,
} from "@/lib/org/agent/types";
import type { Json } from "@/types/database.types";

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
  status: OrgAgentMessageStatus;
  thinking_logs: Json;
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
  return {
    content: row.content ?? "",
    createdAt: row.created_at,
    id: Number(row.id),
    mentions: safeMentions(row.mentions),
    metadata: safeMetadata(row.metadata),
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

export async function fetchOrgAgentMessages(args: {
  beforeMessageId?: number | null;
  limit?: number | null;
  user: User;
  workspaceId: string;
}) {
  const { admin, conversation } = await ensureOrgAgentConversation(args);
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
      message_type: args.messageType ?? "chat",
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

  if (error) throw error;
  const row = data as OrgAgentMessageRow;

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

export async function fetchRecentOrgAgentPromptMessages(args: {
  admin: SupabaseAdminClient;
  beforeMessageId?: number | null;
  conversationId: string;
  limit?: number;
  slackThreadId?: string;
}) {
  let query = (args.admin.from("company_messages" as any) as any)
    .select("id, role, content, created_at, mentions, metadata, slack_user_id")
    .eq("conversation_id", args.conversationId)
    .order("id", { ascending: false });

  if (args.beforeMessageId) {
    query = query.lt("id", args.beforeMessageId);
  }
  if (args.slackThreadId) {
    query = query
      .eq("message_type", "slack")
      .eq("slack_thread_id", args.slackThreadId);
  } else {
    query = query.eq("message_type", "chat");
  }

  const { data, error } = await query.limit(args.limit ?? 16);

  if (error) throw error;
  return (
    (data ?? []) as Array<{
      content: string;
      created_at: string;
      id: number;
      metadata: Json;
      mentions: Json;
      role: OrgAgentMessageRole;
      slack_user_id: string | null;
    }>
  )
    .reverse()
    .map((row) => ({
      content: row.content ?? "",
      createdAt: row.created_at,
      id: Number(row.id),
      metadata: isRecord(row.metadata)
        ? (row.metadata as OrgAgentMessageMetadata)
        : {},
      mentions: safeMentions(row.mentions),
      role: row.role,
      slackUserId: normalizeText(row.slack_user_id) || null,
    }));
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
  roleId: string;
  workspaceId: string;
}): Promise<OrgRole> {
  const { data, error } = await (args.admin.from("company_roles" as any) as any)
    .select(
      "role_id, company_workspace_id, name, external_jd_url, description, request, status, type, location_text, work_mode, updated_at"
    )
    .eq("company_workspace_id", args.workspaceId)
    .eq("role_id", args.roleId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new OrgHttpError(404, "Role not found");
  const row = data as {
    company_workspace_id: string;
    description: string | null;
    external_jd_url: string | null;
    location_text: string | null;
    name: string;
    request: string | null;
    role_id: string;
    status: string | null;
    type: string[] | null;
    updated_at: string;
    work_mode: string | null;
  };
  return {
    description: row.description ?? null,
    employmentTypes: Array.isArray(row.type) ? row.type : [],
    externalJdUrl: row.external_jd_url ?? null,
    locationText: row.location_text ?? null,
    name: row.name,
    request: row.request ?? null,
    roleId: row.role_id,
    status: row.status ?? null,
    updatedAt: row.updated_at,
    workMode: row.work_mode ?? null,
    workspaceId: row.company_workspace_id,
  };
}

export async function fetchWorkspaceForOrgAgent(args: {
  admin: SupabaseAdminClient;
  workspaceId: string;
}) {
  const { data, error } = await (
    args.admin.from("company_workspace" as any) as any
  )
    .select(
      "company_workspace_id, company_name, company_description, pitch, request, logo_url, updated_at"
    )
    .eq("company_workspace_id", args.workspaceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new OrgHttpError(404, "Workspace not found");
  const row = data as {
    company_description: string | null;
    company_name: string;
    company_workspace_id: string;
    logo_url: string | null;
    pitch: string | null;
    request: string | null;
    updated_at: string;
  };
  return {
    companyDescription: row.company_description ?? null,
    companyName: row.company_name,
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
