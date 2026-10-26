import "server-only";

import { createHash } from "node:crypto";
import { after } from "next/server";
import type { User } from "@supabase/supabase-js";
import { readOrgRoleAccess, scopeOrgRoleQuery } from "@/lib/org/teamAccess";
import { createOrResumeDraftRole, fetchRoleCreationState, parseRoleCreationConversationMetadata,
  updateRoleCreationDraft, updateRoleCreationConversationMetadata } from "@/lib/org/agent/roleCreationState";
import { beginRoleStartDraft } from "@/lib/org/roleStart/service";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { insertOrgAgentMessage, type OrgAgentConversationRow } from "@/lib/org/agent/store";
import type { OrgAgentMessageMetadata } from "@/lib/org/agent/types";
import { appendMissingSlackRoleCreationThreadLinks, buildSlackRoleCreationWebUrl } from "@/lib/org/agent/slackRoleCreationMessages";
import { stripSlackSentUsingAttribution } from "@/lib/org/slackMessageText";
import type { ChatAttachmentPayload } from "@/types/chat";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;
export type SlackRoleCreationExecutionContext = {
  channelDbId: string; channelId: string; channelName: string; publicSiteUrl: string;
  slackUserId: string; sourceKey: string; token: string;
};
export type SlackRoleCreationDraft = Pick<Parameters<typeof updateRoleCreationDraft>[0],
  "description" | "request" | "locationText" | "workMode" | "employmentTypes" | "salaryRange" | "externalJdUrl">;
export type SlackRoleCreationStartResult = {
  roleId: string; roleTitle: string; webUrl: string; transferredMessageCount: number;
};
type InProgressSlackRoleCreation = { roleId: string; roleTitle: string; threadPermalink: string };

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

/** Stable per source request and Role, including retries after a lost tool response. */
export function slackRoleDraftId(workspaceId: string, sourceKey: string, title: string) {
  const hex = createHash("sha256").update(JSON.stringify(["slack-role-draft", workspaceId, sourceKey, title.trim()])).digest("hex");
  // The draft API accepts v4-shaped application IDs; this ID is never an authorization token.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const creationDependencies = { getSupabaseAdmin, createOrResumeDraftRole, fetchRoleCreationState,
  updateRoleCreationDraft, updateRoleCreationConversationMetadata, insertOrgAgentMessage, beginRoleStartDraft, after };

export async function startSlackRoleCreation(args: {
  actorLabel: string; contextMessageCount: number; execution: SlackRoleCreationExecutionContext;
  roleTitle: string; draft: SlackRoleCreationDraft; sourceConversation: OrgAgentConversationRow;
  sourceCurrentMessageId: number; sourceSlackThreadId: string | null; user: User; workspaceId: string;
}, dependencies = creationDependencies): Promise<SlackRoleCreationStartResult> {
  const admin = dependencies.getSupabaseAdmin();
  const sourceThreadId = text(args.sourceSlackThreadId);
  if (!sourceThreadId || args.sourceConversation.company_workspace_id !== args.workspaceId) {
    throw new Error("Slack role creation source thread is unavailable");
  }
  const roleId = slackRoleDraftId(args.workspaceId, args.execution.sourceKey, args.roleTitle);
  await dependencies.createOrResumeDraftRole({ draftRoleId: roleId, user: args.user, workspaceId: args.workspaceId });
  let state = await dependencies.fetchRoleCreationState({ roleId, user: args.user, workspaceId: args.workspaceId });
  const { data, error } = await (admin.from("company_messages" as any) as any)
    .select("id, company_user_id, content, metadata, role, slack_user_id")
    .eq("company_workspace_id", args.workspaceId).eq("conversation_id", args.sourceConversation.id)
    .eq("message_type", "slack").eq("slack_thread_id", sourceThreadId)
    .lte("id", args.sourceCurrentMessageId).in("role", ["assistant", "user"])
    .order("id", { ascending: false }).limit(args.contextMessageCount);
  if (error) throw error;
  const messages = [...(data ?? [])].reverse();
  if (Number(messages.at(-1)?.id) !== args.sourceCurrentMessageId || messages.at(-1)?.role !== "user") {
    throw new Error("Slack role creation source context is unavailable");
  }
  for (const message of messages) {
    const copiedTs = `role-draft-${roleId}-${message.id}`;
    const prior = await (admin.from("company_messages" as any) as any).select("id")
      .eq("conversation_id", state.conversation.id).eq("slack_message_ts", copiedTs).maybeSingle();
    if (prior.error) throw prior.error;
    if (prior.data) continue;
    const metadata = record(message.metadata);
    const attachments = bootstrapAttachments(metadata.slackFileAttachments);
    try {
      await dependencies.insertOrgAgentMessage({ admin, conversation: state.conversation, roleId,
        content: stripSlackSentUsingAttribution(message.content), role: message.role, messageType: "slack",
        slackMessageTs: copiedTs, slackThreadId: sourceThreadId, slackUserId: message.slack_user_id,
        userId: message.role === "user" ? message.company_user_id : null,
        metadata: {
          ...(attachments.length ? { attachments: attachments.map(({ text: _text, ...file }) => file), roleCreationAttachments: attachments } : {}),
          ...(Array.isArray(metadata.slackFileErrors) ? { slackFileErrors: metadata.slackFileErrors } : {}),
          slackRoleCreationBootstrap: { sourceKey: args.execution.sourceKey, sourceMessageId: Number(message.id),
            sourceSlackThreadId: sourceThreadId, contextMessageCount: messages.length,
            isCurrent: Number(message.id) === args.sourceCurrentMessageId },
          slackUserName: text(metadata.slackUserName) || (message.role === "assistant" ? "Harper" : args.actorLabel),
          source: "org_role_creation_slack_bootstrap_context",
        } satisfies OrgAgentMessageMetadata,
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "23505") throw error;
    }
  }
  // Once saved, retries resume the same draft without overwriting later web edits.
  if (state.metadata.slackRoleCreationSource?.sourceKey !== args.execution.sourceKey) {
    state = await dependencies.updateRoleCreationDraft({ ...args.draft, name: args.roleTitle, roleId,
      actorLabel: args.actorLabel, source: "slack", user: args.user, workspaceId: args.workspaceId });
    await dependencies.updateRoleCreationConversationMetadata({ admin, conversationId: state.conversation.id,
      current: state.conversation.metadata,
      patch: { slackRoleCreationSource: { sourceKey: args.execution.sourceKey, sourceThreadId } } });
  }
  const { completion } = await dependencies.beginRoleStartDraft({ roleId, user: args.user, workspaceId: args.workspaceId });
  const task = completion.catch((error) => console.error("[slack-role-creation:draft]", error));
  try { dependencies.after(() => task); } catch { /* A local invocation keeps running in its process. */ }
  return { roleId, roleTitle: state.role.name, transferredMessageCount: messages.length,
    webUrl: buildSlackRoleCreationWebUrl({ publicSiteUrl: args.execution.publicSiteUrl, roleId, workspaceId: args.workspaceId }) };
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
  user?: User;
  workspaceId: string;
}): Promise<InProgressSlackRoleCreation[]> {
  let query = (
    args.admin.from("company_roles" as any) as any
  )
    .select("role_id, name, company_internal_roles(team_id)")
    .eq("company_workspace_id", args.workspaceId)
    .eq("source_type", "internal")
    .eq("status", "draft")
    .not("is_expired", "is", true)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (args.user) query = scopeOrgRoleQuery(query, await readOrgRoleAccess({ admin: args.admin, user: args.user, workspaceId: args.workspaceId }));
  const { data: roles, error: rolesError } = await query;
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
  const draftIds = new Set((conversations ?? []).map((conversation: any) => text(conversation.role_id)));
  return (roles ?? []).filter((role: any) => draftIds.has(text(role.role_id))).map((role: any) => ({
    roleId: text(role.role_id), roleTitle: text(role.name) || "새 역할",
    threadPermalink: buildSlackRoleCreationWebUrl({ publicSiteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://matchharper.com",
      roleId: text(role.role_id), workspaceId: args.workspaceId }),
  }));
}

export async function formatInProgressSlackRoleCreations(args: {
  admin: AdminClient;
  user?: User;
  workspaceId: string;
}) {
  const roles = await loadInProgressSlackRoleCreations(args);
  return (
    roles
      .map(
        (role) =>
          `title=${JSON.stringify(role.roleTitle)} onboarding_url=${role.threadPermalink}`
      )
      .join("\n") || "-"
  );
}

export async function appendMissingInProgressSlackRoleLinks(args: {
  admin: AdminClient;
  user?: User;
  message: string;
  workspaceId: string;
}) {
  const roles = await loadInProgressSlackRoleCreations(args);
  return appendMissingSlackRoleCreationThreadLinks({
    message: args.message,
    roles,
  });
}
