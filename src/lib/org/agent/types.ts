import type { OrgAgentModelId } from "@/lib/org/agent/modelConfig";

export type OrgAgentMessageRole = "assistant" | "system" | "user";
export type OrgAgentMessageStatus = "completed" | "failed" | "pending";

export type OrgAgentReadAudience = "caller" | "company_safe";

export const ORG_AGENT_MORE_DATA_KINDS = [
  "members",
  "company_details",
  "workspace_memory",
] as const;

export type OrgAgentMoreDataKind = (typeof ORG_AGENT_MORE_DATA_KINDS)[number];

export type OrgAgentRetainedDataActivation = {
  activatedAt?: string | null;
  activatedByUserMessageId: number;
  fullTextKeys: string[];
  kind: OrgAgentMoreDataKind;
  scopeKey: string;
};

export type OrgAgentMention = {
  displayName: string;
  recommendationId?: string | null;
  roleId?: string | null;
  talentId: string;
};

export type OrgAgentThinkingLog = {
  at: string;
  label: string;
  status?: "done" | "error" | "running";
};

export type OrgAgentMessageAction =
  | {
      id: string;
      kind: "schedule_meeting";
      label: string;
      payload: {
        reason?: string | null;
        topic: string;
      };
      status?: "idle" | "sent";
    }
  | {
      id: string;
      kind: "entity_updated";
      label: string;
      payload: {
        changeSummary: string;
        scope: "company" | "role";
      };
      status?: "idle";
    }
  | {
      /** Legacy action kind used by request-only Agent messages. */
      id: string;
      kind: "request_updated";
      label: string;
      payload: {
        changeSummary: string;
        scope: "company" | "role";
      };
      status?: "idle";
    };

export type OrgAgentMessageMetadata = {
  actions?: OrgAgentMessageAction[];
  autoIntroToCompany?: {
    candidateIds: string[];
    candidateKeys: string[];
    pendingSinceByCandidateKey: Record<string, string>;
    reasonSourceByCandidateKey: Record<string, "codex" | "codex-authored">;
    roleIds: string[];
  };
  candidateConnectionConfirmations?: Array<{
    actorId: string;
    recommendationId: string;
    roleId: string;
    slackThreadId: string | null;
    talentId: string;
  }>;
  fallbackReason?: string | null;
  historyTruncated?: boolean;
  internalTokenCorrectionCount?: number;
  llmUsage?: {
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
    completionCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model?: string | null;
  requestChange?: {
    after: string | null;
    before: string | null;
    changeSummary: string;
    scope: "company" | "role";
  };
  requestChanges?: Array<{
    after: string | null;
    before: string | null;
    changeSummary: string;
    scope: "company" | "role";
  }>;
  retainedDataActivations?: OrgAgentRetainedDataActivation[];
  slackReplyJobId?: string;
  source?: string | null;
  slackUserName?: string | null;
  toolResults?: Array<{
    callId: string;
    name: string;
    status: "error" | "success" | "unchanged";
    summary: string;
  }>;
  updateProposalRef?: {
    proposalId: string;
    summary: string;
  };
};

export type OrgAgentMessage = {
  content: string;
  createdAt: string;
  id: number;
  mentions: OrgAgentMention[];
  metadata: OrgAgentMessageMetadata;
  model: string | null;
  role: OrgAgentMessageRole;
  status: OrgAgentMessageStatus;
  thinkingLogs: OrgAgentThinkingLog[];
};

export type OrgAgentConversation = {
  conversationId: string;
  /**
   * Legacy field kept during the workspace-conversation migration.
   * New organization agent conversations always return null.
   */
  roleId: string | null;
  title: string | null;
  workspaceId: string;
};

export type OrgAgentMessagesResponse = {
  conversation: OrgAgentConversation;
  hasMore: boolean;
  messages: OrgAgentMessage[];
  nextCursor: number | null;
  ok: true;
};

export type OrgAgentMentionCandidate = {
  headline: string | null;
  label: string;
  recommendationId: string;
  roleId: string;
  stage: string;
  subtitle: string;
  talentId: string;
};

export type OrgAgentMentionsResponse = {
  candidates: OrgAgentMentionCandidate[];
  ok: true;
};

export type OrgAgentChatBody = {
  mentions?: OrgAgentMention[];
  message?: string;
  model?: OrgAgentModelId | string | null;
  /** @deprecated The organization agent is no longer bound to one role. */
  roleId?: string;
  workspaceId?: string;
};

export type OrgAgentMeetingRequestBody = {
  actionId?: string;
  messageId?: number;
  reason?: string | null;
  roleId?: string;
  topic?: string;
  workspaceId?: string;
};

export type OrgAgentMeetingRequestResponse = {
  ok: true;
};
