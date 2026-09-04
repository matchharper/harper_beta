import type { OrgAgentModelId } from "@/lib/org/agent/modelConfig";
import type {
  MeetingScheduleAdditionalMessage,
  MeetingScheduleDraftConfig,
} from "@/lib/meetings/scheduleDraft";
import type { ChatAttachmentPayload } from "@/types/chat";

export type OrgAgentMode = "general" | "role" | "role_creation";

export type OrgAgentMessageAttachment = Pick<
  ChatAttachmentPayload,
  "kind" | "mime" | "name" | "size" | "truncated" | "url"
>;

export type OrgRoleCreationChoice = {
  actionId: string;
  kind: "role_creation_confirmation";
  label: string;
  status: "declined" | "pending" | "confirmed";
  value: "no" | "yes";
};

export type OrgAgentCandidateDecision = "accept" | "decline";

export type OrgAgentCandidateConnectionMethod =
  | "intro_email"
  | "direct_contact"
  | "schedule_interview";

export type OrgAgentMeetingScheduleConfirmation = {
  additionalMessage: MeetingScheduleAdditionalMessage | null;
  availabilityVersion: number | null;
  config: MeetingScheduleDraftConfig;
  draftBlocker:
    | "availability_missing"
    | "meeting_stage_missing"
    | "organizer_email_missing"
    | null;
  meetingStage:
    | import("@/lib/meetings/scheduleDraft").MeetingScheduleStageProfile
    | null;
};

export type OrgAgentCandidateDecisionConfirmation = {
  actorId: string;
  connectionMethod: OrgAgentCandidateConnectionMethod | null;
  decision: OrgAgentCandidateDecision;
  introEmails: string[];
  meetingDraft: OrgAgentMeetingScheduleConfirmation | null;
  processStageId: string | null;
  reason: string | null;
  recommendationId: string;
  roleId: string;
  slackThreadId: string | null;
  talentId: string;
};

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

export type OrgAgentThinkingLogIcon =
  | "read"
  | "write"
  | "send"
  | "run"
  | "search"
  | "link";

export type OrgAgentThinkingLog = {
  at: string;
  id?: string;
  icon?: OrgAgentThinkingLogIcon;
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
  attachments?: OrgAgentMessageAttachment[];
  autoIntroToCompany?: {
    candidateIds: string[];
    candidateKeys: string[];
    pendingSinceByCandidateKey: Record<string, string>;
    reasonSourceByCandidateKey: Record<string, "codex" | "codex-authored">;
    roleIds: string[];
    webToolCallCount?: number;
  };
  candidateConnectionConfirmations?: OrgAgentCandidateDecisionConfirmation[];
  contactDraftRef?: {
    contactId: string;
    revision: number;
  };
  contactDraftRefs?: Array<{
    contactId: string;
    revision: number;
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
  /** Server-authored role context used to resolve Slack candidate links. */
  preferredRoleId?: string | null;
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
  slackChoiceSourceJobId?: string;
  /** Server-only marker for exact Slack messages transferred into a new role thread. */
  slackRoleCreationBootstrap?: {
    contextMessageCount: number;
    isCurrent: boolean;
    sourceKey: string;
    sourceMessageId: number;
    sourceSlackThreadId: string;
  };
  slackReplyJobId?: string;
  source?: string | null;
  roleCreation?: {
    choices?: OrgRoleCreationChoice[];
    confirmationPrompt?: string;
    roleId: string;
  };
  roleCreationConfirmation?: {
    actionId: string;
    decision: "no" | "yes";
    kind: "assistant" | "user";
    sourceMessageId: number;
  };
  /** Server-only extracted context retained for later turns; UI uses attachments. */
  roleCreationAttachments?: ChatAttachmentPayload[];
  /** Server-only Slack file text retained for later turns; UI uses attachments. */
  slackFileAttachments?: ChatAttachmentPayload[];
  slackFileErrors?: string[];
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
  authorUserId: string | null;
  content: string;
  createdAt: string;
  id: number;
  mentions: OrgAgentMention[];
  metadata: OrgAgentMessageMetadata;
  model: string | null;
  role: OrgAgentMessageRole;
  sourceSurface: "slack" | "web";
  status: OrgAgentMessageStatus;
  thinkingLogs: OrgAgentThinkingLog[];
};

export type OrgAgentConversation = {
  conversationId: string;
  /** Null for workspace chat; otherwise the owning role for role-scoped chat. */
  roleId: string | null;
  title: string | null;
  workspaceId: string;
};

export type OrgAgentMessagesResponse = {
  conversation: OrgAgentConversation;
  hasMore: boolean;
  latestUserMessageAt: string | null;
  messages: OrgAgentMessage[];
  nextCursor: number | null;
  ok: true;
};

export type OrgAgentMentionCandidate = {
  headline: string | null;
  label: string;
  profilePicture: string | null;
  recommendedAt: string;
  recommendationId: string;
  roleId: string;
  roleName: string;
  stage: string;
  stageLabel: string;
  subtitle: string;
  talentId: string;
};

export type OrgAgentMentionsResponse = {
  candidates: OrgAgentMentionCandidate[];
  hasMore: boolean;
  nextOffset: number | null;
  ok: true;
  totalCount: number;
};

export type OrgAgentChatBody = {
  attachments?: ChatAttachmentPayload[];
  draftRoleId?: string;
  mentions?: OrgAgentMention[];
  message?: string;
  mode?: OrgAgentMode;
  model?: OrgAgentModelId | string | null;
  /** Required for role and role_creation conversations. */
  roleId?: string;
  workspaceId?: string;
};

export type OrgRoleCreationConfirmationBody = {
  actionId?: string;
  decision?: "no" | "yes";
  messageId?: number;
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
