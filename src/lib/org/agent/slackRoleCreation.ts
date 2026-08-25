import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  createOrResumeDraftRole,
  parseRoleCreationConversationMetadata,
  updateRoleCreationDraft,
  updateRoleCreationConversationMetadata,
} from "@/lib/org/agent/roleCreationState";
import {
  getHarperSlackMessagePermalink,
  postHarperSlackMessage,
} from "@/lib/org/slackHarper";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  insertOrgAgentMessage,
  type OrgAgentConversationRow,
} from "@/lib/org/agent/store";
import type { OrgAgentMessageMetadata } from "@/lib/org/agent/types";
import {
  appendMissingSlackRoleCreationThreadLinks,
  buildSlackRoleCreationStartMessage,
  buildSlackRoleCreationWebUrl,
} from "@/lib/org/agent/slackRoleCreationMessages";
import { stripSlackSentUsingAttribution } from "@/lib/org/slackMessageText";
import type { ChatAttachmentPayload } from "@/types/chat";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

export type SlackRoleCreationExecutionContext = {
  channelDbId: string;
  channelId: string;
  publicSiteUrl: string;
  slackUserId: string;
  sourceKey: string;
  token: string;
};

export type SlackRoleCreationThread = {
  roleId: string;
  roleTitle: string;
  slackThreadId: string;
  slackThreadTs: string;
  threadPermalink: string;
  webUrl: string;
};

type InProgressSlackRoleCreation = {
  roleId: string;
  roleTitle: string;
  threadPermalink: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function bootstrapAttachments(value: unknown): ChatAttachmentPayload[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).flatMap((item) => {
    const attachment = record(item);
    const name = text(attachment.name).slice(0, 240);
    const content = text(attachment.text);
    const size = Number(attachment.size ?? 0);
    if (!name || !content || !Number.isFinite(size) || size <= 0) return [];
    return [
      {
        kind: "file" as const,
        ...(text(attachment.mime)
          ? { mime: text(attachment.mime).slice(0, 160) }
          : {}),
        name,
        size,
        text: content,
        truncated: Boolean(attachment.truncated),
      },
    ];
  });
}

async function ensureSlackRoleCreationBootstrap(args: {
  actorLabel: string;
  admin: AdminClient;
  contextMessageCount: number;
  execution: SlackRoleCreationExecutionContext;
  roleConversation: OrgAgentConversationRow;
  roleId: string;
  roleSlackThreadId: string;
  roleSlackThreadTs: string;
  sourceConversation: OrgAgentConversationRow;
  sourceCurrentMessageId: number;
  sourceSlackThreadId: string;
}) {
  const expectedBootstrapMessageTs = `${args.roleSlackThreadTs}-bootstrap-${args.sourceCurrentMessageId}`;
  const existingResult = await (
    args.admin.from("company_messages" as any) as any
  )
    .select("content, slack_message_ts")
    .eq("company_workspace_id", args.roleConversation.company_workspace_id)
    .eq("conversation_id", args.roleConversation.id)
    .eq("role", "user")
    .eq("slack_thread_id", args.roleSlackThreadId)
    .eq("slack_message_ts", expectedBootstrapMessageTs)
    .maybeSingle();
  if (existingResult.error) throw existingResult.error;

  let bootstrapMessageTs = text(existingResult.data?.slack_message_ts);
  let bootstrapPrompt = text(existingResult.data?.content);
  if (!bootstrapMessageTs || !bootstrapPrompt) {
    const { data, error } = await (
      args.admin.from("company_messages" as any) as any
    )
      .select("id, company_user_id, content, metadata, role, slack_user_id")
      .eq("company_workspace_id", args.sourceConversation.company_workspace_id)
      .eq("conversation_id", args.sourceConversation.id)
      .eq("message_type", "slack")
      .eq("slack_thread_id", args.sourceSlackThreadId)
      .lte("id", args.sourceCurrentMessageId)
      .in("role", ["assistant", "user"])
      .order("id", { ascending: false })
      .limit(args.contextMessageCount);
    if (error) throw error;
    const sourceMessages = [...(data ?? [])].reverse() as Array<{
      company_user_id: string | null;
      content: string;
      id: number;
      metadata: unknown;
      role: "assistant" | "user";
      slack_user_id: string | null;
    }>;
    const current = sourceMessages.at(-1);
    if (
      !current ||
      Number(current.id) !== args.sourceCurrentMessageId ||
      current.role !== "user"
    ) {
      throw new Error("Slack role creation source context is unavailable");
    }

    for (const sourceMessage of sourceMessages) {
      const sourceMetadata = record(sourceMessage.metadata);
      const attachments = bootstrapAttachments(
        sourceMetadata.slackFileAttachments
      );
      const isCurrent =
        Number(sourceMessage.id) === args.sourceCurrentMessageId;
      const copied = await insertOrgAgentMessage({
        admin: args.admin,
        content: stripSlackSentUsingAttribution(sourceMessage.content),
        conversation: args.roleConversation,
        messageType: "slack",
        metadata: {
          ...(attachments.length > 0
            ? {
                attachments: attachments.map((attachment) => ({
                  kind: attachment.kind,
                  mime: attachment.mime,
                  name: attachment.name,
                  size: attachment.size,
                  truncated: attachment.truncated,
                })),
                roleCreationAttachments: attachments,
              }
            : {}),
          ...(Array.isArray(sourceMetadata.slackFileErrors)
            ? {
                slackFileErrors: sourceMetadata.slackFileErrors
                  .map(text)
                  .filter(Boolean)
                  .slice(0, 10),
              }
            : {}),
          slackRoleCreationBootstrap: {
            contextMessageCount: sourceMessages.length,
            isCurrent,
            sourceKey: args.execution.sourceKey,
            sourceMessageId: Number(sourceMessage.id),
            sourceSlackThreadId: args.sourceSlackThreadId,
          },
          slackUserName:
            text(sourceMetadata.slackUserName) ||
            (sourceMessage.role === "assistant"
              ? "Harper"
              : isCurrent
                ? args.actorLabel
                : null),
          source: "org_role_creation_slack_bootstrap_context",
        } satisfies OrgAgentMessageMetadata,
        role: sourceMessage.role,
        roleId: args.roleId,
        slackMessageTs: `${args.roleSlackThreadTs}-bootstrap-${sourceMessage.id}`,
        slackThreadId: args.roleSlackThreadId,
        slackUserId: sourceMessage.slack_user_id,
        userId:
          sourceMessage.role === "user" ? sourceMessage.company_user_id : null,
      });
      if (isCurrent) {
        bootstrapMessageTs = `${args.roleSlackThreadTs}-bootstrap-${sourceMessage.id}`;
        bootstrapPrompt = copied.content;
      }
    }
  }

  if (!bootstrapMessageTs || !bootstrapPrompt) {
    throw new Error("Slack role creation bootstrap message is unavailable");
  }
  const { error: enqueueError } = await (args.admin.rpc as any)(
    "enqueue_slack_reply_job_v2",
    {
      p_prompt: bootstrapPrompt,
      p_slack_event_id: `role_creation_bootstrap:${args.execution.sourceKey}`,
      p_slack_files: [],
      p_slack_message_ts: bootstrapMessageTs,
      p_slack_user_id: args.execution.slackUserId,
      p_thread_id: args.roleSlackThreadId,
      // Keep this on the existing durable thread-reply queue contract. The
      // event id and copied message metadata identify the server-only
      // bootstrap turn without requiring a database enum/constraint change.
      p_trigger_kind: "thread_reply",
    }
  );
  if (enqueueError) throw enqueueError;
}

async function fetchExistingStartedThread(args: {
  actorLabel: string;
  admin: AdminClient;
  channelId: string;
  contextMessageCount: number;
  execution: SlackRoleCreationExecutionContext;
  publicSiteUrl: string;
  sourceConversation: OrgAgentConversationRow;
  sourceCurrentMessageId: number;
  sourceSlackThreadId: string;
  sourceKey: string;
  token: string;
  workspaceId: string;
}): Promise<SlackRoleCreationThread | null> {
  const { data: conversation, error } = await (
    args.admin.from("company_conversations" as any) as any
  )
    .select(
      "id, company_workspace_id, role_id, title, last_message_at, last_message_id, summary_cursor_message_id, metadata, created_at, updated_at"
    )
    .eq("company_workspace_id", args.workspaceId)
    .contains("metadata", {
      slackRoleCreationThread: { sourceKey: args.sourceKey },
    })
    .maybeSingle();
  if (error) throw error;
  const roleId = text(conversation?.role_id);
  if (!conversation || !roleId) return null;
  const metadata = parseRoleCreationConversationMetadata(conversation.metadata);
  const linked = metadata.slackRoleCreationThread;
  if (!linked) return null;
  const { data: thread, error: threadError } = await (
    args.admin.from("company_slack_threads" as any) as any
  )
    .select("id, role_id, slack_thread_ts")
    .eq("id", linked.slackThreadId)
    .eq("role_id", roleId)
    .maybeSingle();
  if (threadError) throw threadError;
  if (!thread) return null;
  const { data: role, error: roleError } = await (
    args.admin.from("company_roles" as any) as any
  )
    .select("name")
    .eq("company_workspace_id", args.workspaceId)
    .eq("role_id", roleId)
    .maybeSingle();
  if (roleError) throw roleError;
  if (!role) return null;
  const webUrl = buildSlackRoleCreationWebUrl({
    publicSiteUrl: args.publicSiteUrl,
    roleId,
    workspaceId: args.workspaceId,
  });
  let permalink = text(linked.threadPermalink);
  if (!permalink) {
    permalink = await getHarperSlackMessagePermalink({
      channelId: args.channelId,
      messageTs: text(thread.slack_thread_ts),
      token: args.token,
    });
    await updateRoleCreationConversationMetadata({
      admin: args.admin,
      conversationId: conversation.id,
      current: conversation.metadata,
      patch: {
        slackRoleCreationThread: {
          ...linked,
          threadPermalink: permalink,
        },
      },
    });
  }
  await ensureSlackRoleCreationBootstrap({
    actorLabel: args.actorLabel,
    admin: args.admin,
    contextMessageCount: args.contextMessageCount,
    execution: args.execution,
    roleConversation: conversation as OrgAgentConversationRow,
    roleId,
    roleSlackThreadId: text(thread.id),
    roleSlackThreadTs: text(thread.slack_thread_ts),
    sourceConversation: args.sourceConversation,
    sourceCurrentMessageId: args.sourceCurrentMessageId,
    sourceSlackThreadId: args.sourceSlackThreadId,
  });
  return {
    roleId,
    roleTitle: text(role.name) || "새 역할",
    slackThreadId: text(thread.id),
    slackThreadTs: text(thread.slack_thread_ts),
    threadPermalink: permalink,
    webUrl,
  };
}

export async function startSlackRoleCreation(args: {
  actorLabel: string;
  contextMessageCount: number;
  execution: SlackRoleCreationExecutionContext;
  roleTitle: string;
  sourceConversation: OrgAgentConversationRow;
  sourceCurrentMessageId: number;
  sourceSlackThreadId: string | null;
  user: User;
  workspaceId: string;
}): Promise<SlackRoleCreationThread> {
  const admin = getSupabaseAdmin();
  const sourceSlackThreadId = text(args.sourceSlackThreadId);
  if (!sourceSlackThreadId) {
    throw new Error("Slack role creation source thread is unavailable");
  }
  const existing = await fetchExistingStartedThread({
    actorLabel: args.actorLabel,
    admin,
    channelId: args.execution.channelId,
    contextMessageCount: args.contextMessageCount,
    execution: args.execution,
    publicSiteUrl: args.execution.publicSiteUrl,
    sourceConversation: args.sourceConversation,
    sourceCurrentMessageId: args.sourceCurrentMessageId,
    sourceSlackThreadId,
    sourceKey: args.execution.sourceKey,
    token: args.execution.token,
    workspaceId: args.workspaceId,
  });
  if (existing) return existing;

  const roleId = crypto.randomUUID();
  await createOrResumeDraftRole({
    draftRoleId: roleId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const state = await updateRoleCreationDraft({
    actorLabel: args.actorLabel,
    name: args.roleTitle,
    roleId,
    user: args.user,
    workspaceId: args.workspaceId,
  });

  const webUrl = buildSlackRoleCreationWebUrl({
    publicSiteUrl: args.execution.publicSiteUrl,
    roleId,
    workspaceId: args.workspaceId,
  });
  const startMessage = buildSlackRoleCreationStartMessage({
    roleTitle: args.roleTitle,
    webUrl,
  });
  const root = await postHarperSlackMessage({
    channelId: args.execution.channelId,
    clientMessageId: crypto.randomUUID(),
    text: startMessage,
    token: args.execution.token,
  });
  const rootTs = text(root.ts);
  if (!rootTs) throw new Error("Slack role creation message has no timestamp");

  const now = new Date().toISOString();
  const { data: thread, error: threadError } = await (
    admin.from("company_slack_threads" as any) as any
  )
    .upsert(
      {
        channel_id: args.execution.channelDbId,
        created_by_harper: true,
        role_id: roleId,
        slack_thread_ts: rootTs,
        updated_at: now,
      },
      { onConflict: "channel_id,slack_thread_ts" }
    )
    .select("id, role_id, slack_thread_ts")
    .single();
  if (threadError) throw threadError;

  const linkedMetadata = await updateRoleCreationConversationMetadata({
    admin,
    conversationId: state.conversation.id,
    current: state.conversation.metadata,
    patch: {
      slackRoleCreationThread: {
        slackThreadId: text(thread.id),
        slackThreadTs: text(thread.slack_thread_ts),
        sourceKey: args.execution.sourceKey,
        threadPermalink: null,
      },
    },
  });
  await insertOrgAgentMessage({
    admin,
    content: startMessage,
    conversation: state.conversation,
    messageType: "slack",
    metadata: { source: "org_role_creation_slack_start" },
    role: "assistant",
    roleId,
    slackMessageTs: rootTs,
    slackThreadId: text(thread.id),
  });

  const threadPermalink = await getHarperSlackMessagePermalink({
    channelId: args.execution.channelId,
    messageTs: rootTs,
    token: args.execution.token,
  });
  await updateRoleCreationConversationMetadata({
    admin,
    conversationId: state.conversation.id,
    current: linkedMetadata,
    patch: {
      slackRoleCreationThread: {
        slackThreadId: text(thread.id),
        slackThreadTs: text(thread.slack_thread_ts),
        sourceKey: args.execution.sourceKey,
        threadPermalink,
      },
    },
  });
  await ensureSlackRoleCreationBootstrap({
    actorLabel: args.actorLabel,
    admin,
    contextMessageCount: args.contextMessageCount,
    execution: args.execution,
    roleConversation: state.conversation,
    roleId,
    roleSlackThreadId: text(thread.id),
    roleSlackThreadTs: text(thread.slack_thread_ts),
    sourceConversation: args.sourceConversation,
    sourceCurrentMessageId: args.sourceCurrentMessageId,
    sourceSlackThreadId,
  });

  return {
    roleId,
    roleTitle: args.roleTitle,
    slackThreadId: text(thread.id),
    slackThreadTs: text(thread.slack_thread_ts),
    threadPermalink,
    webUrl,
  };
}

export async function resolveDraftRoleCreationForSlackThread(args: {
  admin: AdminClient;
  slackThreadId: string;
  workspaceId: string;
}) {
  const { data: thread, error } = await (
    args.admin.from("company_slack_threads" as any) as any
  )
    .select("role_id")
    .eq("id", args.slackThreadId)
    .maybeSingle();
  if (error) throw error;
  const roleId = text(thread?.role_id);
  if (!roleId) return null;
  const { data: role, error: roleError } = await (
    args.admin.from("company_roles" as any) as any
  )
    .select("name, status")
    .eq("company_workspace_id", args.workspaceId)
    .eq("role_id", roleId)
    .maybeSingle();
  if (roleError) throw roleError;
  if (!role || text(role.status).toLowerCase() !== "draft") return null;
  const { data: conversation, error: conversationError } = await (
    args.admin.from("company_conversations" as any) as any
  )
    .select("metadata")
    .eq("company_workspace_id", args.workspaceId)
    .eq("role_id", roleId)
    .contains("metadata", { scope: "role_creation" })
    .maybeSingle();
  if (conversationError) throw conversationError;
  const linked = parseRoleCreationConversationMetadata(
    conversation?.metadata
  ).slackRoleCreationThread;
  return {
    roleId,
    roleTitle: text(role.name) || "새 역할",
    threadPermalink: text(linked?.threadPermalink) || null,
  };
}

async function loadInProgressSlackRoleCreations(args: {
  admin: AdminClient;
  workspaceId: string;
}): Promise<InProgressSlackRoleCreation[]> {
  const { data: roles, error: rolesError } = await (
    args.admin.from("company_roles" as any) as any
  )
    .select("role_id, name")
    .eq("company_workspace_id", args.workspaceId)
    .eq("source_type", "internal")
    .eq("status", "draft")
    .not("is_expired", "is", true)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (rolesError) throw rolesError;
  const roleIds = (roles ?? []).map((role: any) => text(role.role_id));
  if (roleIds.length === 0) return [];
  const { data: conversations, error: conversationsError } = await (
    args.admin.from("company_conversations" as any) as any
  )
    .select("role_id, metadata")
    .eq("company_workspace_id", args.workspaceId)
    .in("role_id", roleIds)
    .contains("metadata", { scope: "role_creation" });
  if (conversationsError) throw conversationsError;
  const links = new Map(
    (conversations ?? []).flatMap((conversation: any) => {
      const permalink = text(
        parseRoleCreationConversationMetadata(conversation.metadata)
          .slackRoleCreationThread?.threadPermalink
      );
      return permalink
        ? [[text(conversation.role_id), permalink] as const]
        : [];
    })
  );
  return (roles ?? []).flatMap((role: any) => {
    const roleId = text(role.role_id);
    const threadPermalink = links.get(roleId);
    return threadPermalink
      ? [
          {
            roleId,
            roleTitle: text(role.name) || "새 역할",
            threadPermalink,
          },
        ]
      : [];
  });
}

export async function formatInProgressSlackRoleCreations(args: {
  admin: AdminClient;
  workspaceId: string;
}) {
  const roles = await loadInProgressSlackRoleCreations(args);
  return (
    roles
      .map(
        (role) =>
          `title=${JSON.stringify(role.roleTitle)} slack_thread=${role.threadPermalink}`
      )
      .join("\n") || "-"
  );
}

export async function appendMissingInProgressSlackRoleLinks(args: {
  admin: AdminClient;
  message: string;
  workspaceId: string;
}) {
  const roles = await loadInProgressSlackRoleCreations(args);
  return appendMissingSlackRoleCreationThreadLinks({
    message: args.message,
    roles,
  });
}
