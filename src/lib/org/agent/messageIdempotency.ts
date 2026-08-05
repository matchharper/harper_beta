import type { OrgAgentMessageMetadata } from "@/lib/org/agent/types";

export type AdoptableSlackUserMessageIdentity = {
  content: string;
  conversationId: string;
  messageType: "slack";
  role: "user";
  slackMessageTs: string;
  slackThreadId: string;
  workspaceId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function resolveAdoptableSlackUserMessageIdentity(args: {
  content: string;
  conversationId: string;
  errorCode?: string | null;
  messageType: string;
  role: string;
  slackMessageTs?: string | null;
  slackThreadId?: string | null;
  workspaceId: string;
}): AdoptableSlackUserMessageIdentity | null {
  if (
    args.errorCode !== "23505" ||
    args.messageType !== "slack" ||
    args.role !== "user" ||
    !args.slackThreadId?.trim() ||
    !args.slackMessageTs?.trim()
  ) {
    return null;
  }

  return {
    content: args.content,
    conversationId: args.conversationId,
    messageType: "slack",
    role: "user",
    slackMessageTs: args.slackMessageTs,
    slackThreadId: args.slackThreadId,
    workspaceId: args.workspaceId,
  };
}

export function mergeOrgAgentMessageMetadata(
  existing: unknown,
  incoming: unknown
): { changed: boolean; metadata: OrgAgentMessageMetadata } {
  const existingMetadata = isRecord(existing)
    ? (existing as OrgAgentMessageMetadata)
    : {};
  const incomingMetadata = isRecord(incoming)
    ? (incoming as OrgAgentMessageMetadata)
    : {};
  const metadata = {
    ...existingMetadata,
    ...incomingMetadata,
  } satisfies OrgAgentMessageMetadata;

  return {
    changed: JSON.stringify(metadata) !== JSON.stringify(existingMetadata),
    metadata,
  };
}
