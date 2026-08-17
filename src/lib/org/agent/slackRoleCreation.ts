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
import { insertOrgAgentMessage } from "@/lib/org/agent/store";
import {
  appendMissingSlackRoleCreationThreadLinks,
  buildSlackRoleCreationStartMessage,
  buildSlackRoleCreationThreadIntro,
  buildSlackRoleCreationWebUrl,
} from "@/lib/org/agent/slackRoleCreationMessages";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

export type SlackRoleCreationExecutionContext = {
  channelDbId: string;
  channelId: string;
  publicSiteUrl: string;
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

export type SlackRoleDescriptionOrigin =
  | "company_style_draft"
  | "same_company_public_jd"
  | "user_supplied";

type InProgressSlackRoleCreation = {
  roleId: string;
  roleTitle: string;
  threadPermalink: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

async function fetchExistingStartedThread(args: {
  admin: AdminClient;
  channelId: string;
  publicSiteUrl: string;
  sourceKey: string;
  token: string;
  workspaceId: string;
}): Promise<SlackRoleCreationThread | null> {
  const { data: conversation, error } = await (
    args.admin.from("company_conversations" as any) as any
  )
    .select("id, role_id, metadata")
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
    const intro = await postHarperSlackMessage({
      channelId: args.channelId,
      text: buildSlackRoleCreationThreadIntro(),
      threadTs: text(thread.slack_thread_ts),
      token: args.token,
    });
    const introTs = text(intro.ts);
    if (!introTs) {
      throw new Error("Slack role creation intro has no timestamp");
    }
    permalink = await getHarperSlackMessagePermalink({
      channelId: args.channelId,
      messageTs: introTs,
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
  description: string;
  descriptionOrigin: SlackRoleDescriptionOrigin;
  descriptionSourceUrl?: string | null;
  execution: SlackRoleCreationExecutionContext;
  roleTitle: string;
  user: User;
  workspaceId: string;
}): Promise<SlackRoleCreationThread> {
  const admin = getSupabaseAdmin();
  const existing = await fetchExistingStartedThread({
    admin,
    channelId: args.execution.channelId,
    publicSiteUrl: args.execution.publicSiteUrl,
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
    description: args.description,
    ...(text(args.descriptionSourceUrl)
      ? { externalJdUrl: text(args.descriptionSourceUrl) }
      : {}),
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
    description: args.description,
    descriptionOrigin: args.descriptionOrigin,
    descriptionSourceUrl: args.descriptionSourceUrl,
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
      ...(args.descriptionOrigin !== "user_supplied"
        ? {
            descriptionSourceResearch: {
              attemptedAt: now,
              query:
                `${state.workspace.companyName} ${args.roleTitle} 채용 career`
                  .replace(/\s+/g, " ")
                  .trim(),
              resultCount: null,
              selectedSourceUrl:
                args.descriptionOrigin === "same_company_public_jd"
                  ? text(args.descriptionSourceUrl) || null
                  : null,
              source: "slack_entry" as const,
              status: "completed" as const,
            },
          }
        : {}),
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

  const introMessage = buildSlackRoleCreationThreadIntro({
    descriptionOrigin: args.descriptionOrigin,
  });
  const intro = await postHarperSlackMessage({
    channelId: args.execution.channelId,
    text: introMessage,
    threadTs: rootTs,
    token: args.execution.token,
  });
  const introTs = text(intro.ts);
  if (!introTs) throw new Error("Slack role creation intro has no timestamp");
  await insertOrgAgentMessage({
    admin,
    content: introMessage,
    conversation: state.conversation,
    messageType: "slack",
    metadata: { source: "org_role_creation_slack_intro" },
    role: "assistant",
    roleId,
    slackMessageTs: introTs,
    slackThreadId: text(thread.id),
  });
  const threadPermalink = await getHarperSlackMessagePermalink({
    channelId: args.execution.channelId,
    messageTs: introTs,
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
