import type { DraftChatAttachment } from "@/lib/chat/attachmentClient";
import type { ChatComposerToken } from "@/lib/chat/composerTokens";
import type { OrgAgentMention, OrgAgentMessage } from "@/lib/org/agent/types";
import type { ChatAttachmentPayload } from "@/types/chat";

/** What the input held when a message was sent, so it can come back unchanged. */
export type OrgAgentDraftSnapshot = {
  attachments: DraftChatAttachment[];
  text: string;
  tokens: ChatComposerToken<OrgAgentMention>[];
};

/** A message sent while Harper was still answering; it goes out after the current reply. */
export type OrgAgentQueuedMessage = {
  attachments: ChatAttachmentPayload[];
  createdAt: string;
  /** Null when the message did not come from the input (a To-do approval, Run Search). */
  draft: OrgAgentDraftSnapshot | null;
  id: string;
  mentions: OrgAgentMention[];
  message: string;
  model: string | null;
};

export type OrgAgentTurnOutcome =
  /** The turn ran to its end. */
  | "completed"
  /** It failed after the message was saved, so the message stays in the conversation. */
  | "failed_saved"
  /** It never reached the conversation (no session, network, request refused). */
  | "failed_unsaved"
  /** The team stopped it. */
  | "stopped";

export type OrgAgentTurnResult = {
  /** For a stopped turn: the last saved message, so the stop note sits right after it. */
  lastMessageId?: number | null;
  outcome: OrgAgentTurnOutcome;
  userMessageSaved: boolean;
};

export type OrgAgentSendResult =
  | OrgAgentTurnResult
  /** Handed back to the input before it was sent. */
  | { outcome: "returned"; userMessageSaved: false };

/**
 * A message that never reached the conversation goes back to the input, and so
 * does everything written after it: sending the later ones alone would change
 * the order the team wrote them in.
 */
export function shouldHandBackOrgAgentQueue(result: OrgAgentTurnResult) {
  return (
    !result.userMessageSaved &&
    (result.outcome === "failed_unsaved" || result.outcome === "stopped")
  );
}

export function orgAgentDraftFromQueuedMessage(
  item: Pick<OrgAgentQueuedMessage, "draft" | "message">
): OrgAgentDraftSnapshot {
  return item.draft ?? { attachments: [], text: item.message, tokens: [] };
}

/**
 * Joins drafts into one input, oldest first, a blank line between them. Each
 * @mention keeps its place and each file is kept once.
 */
export function mergeOrgAgentDraftSnapshots(
  drafts: OrgAgentDraftSnapshot[]
): OrgAgentDraftSnapshot {
  let text = "";
  const tokens: ChatComposerToken<OrgAgentMention>[] = [];
  const attachments: DraftChatAttachment[] = [];
  for (const draft of drafts) {
    const part = draft.text.replace(/\s+$/u, "");
    if (part) {
      const separator = text ? "\n\n" : "";
      const offset = text.length + separator.length;
      text = `${text}${separator}${part}`;
      for (const token of draft.tokens) {
        if (token.start < 0 || token.end > part.length) continue;
        if (part.slice(token.start, token.end) !== token.text) continue;
        tokens.push({
          ...token,
          end: token.end + offset,
          start: token.start + offset,
        });
      }
    }
    for (const attachment of draft.attachments) {
      if (!attachments.some((existing) => existing.id === attachment.id)) {
        attachments.push(attachment);
      }
    }
  }
  return { attachments, text, tokens };
}

function comparableText(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

/**
 * Whether a stopped send reached the conversation anyway: its user message is
 * in the refreshed history. The server and browser clocks can differ, so the
 * time window is generous.
 */
export function orgAgentMessageWasSaved(args: {
  messages: OrgAgentMessage[];
  message: string;
  sentAt: string;
  userId?: string | null;
}) {
  const sentAt = Date.parse(args.sentAt);
  const wanted = comparableText(args.message);
  return args.messages.some((message) => {
    if (message.role !== "user" || message.id <= 0) return false;
    if (args.userId && message.authorUserId && message.authorUserId !== args.userId) {
      return false;
    }
    const createdAt = Date.parse(message.createdAt);
    if (Number.isFinite(sentAt) && Number.isFinite(createdAt)) {
      if (createdAt < sentAt - 2 * 60_000) return false;
    }
    return !wanted || comparableText(message.content) === wanted;
  });
}
