import type { TalentMessageRow } from "@/lib/talentOnboarding/models";
import { formatTalentMessageContentForLlmPrompt } from "../opportunityFeedbackNote";
import type { CareerInputInbox, CareerReplyCheckpoint } from "../capabilities/runtime";
import type { CareerConversationEvent } from "./events";
import type { WorkScope } from "./store";

export type CareerInboxSnapshot = {
  messages: TalentMessageRow[];
  deliveredIds: number[];
  inputIds: number[];
  completed: boolean;
  historyBeforeMessageId?: number;
  events?: CareerConversationEvent[];
  deliveredEventIds?: string[];
};

export async function readCareerInbox(scope: WorkScope, invocationId: string): Promise<CareerInboxSnapshot> {
  const { data, error } = await (scope.admin.rpc as any)("read_career_inbox", {
    p_user_id: scope.userId, p_conversation_id: scope.conversationId, p_invocation_id: invocationId,
  });
  if (error) throw error;
  return data;
}

export function formatCareerInboxMessages(messages: TalentMessageRow[], options: { preferredLocale?: string | null; timeZone?: string | null } = {}) {
  return messages.map(message => {
    // Hiding a row is a display action, not withdrawal of its authenticated input.
    const payload = message.payload && typeof message.payload === "object" && !Array.isArray(message.payload)
      ? { ...message.payload, hidden: false } : message.payload;
    const action = (payload as Record<string, any> | null)?.careerInputAction;
    const references = [
      Array.isArray(action?.documentIds) && action.documentIds.length ? `Attached owned documents: ${action.documentIds.join(", ")}.` : "",
      action?.conversationStarterId ? `Selected conversation topic: ${action.conversationStarterId}.` : "",
      action?.companyRequestId ? `This message refers to company request ${action.companyRequestId}.` : "",
      action?.coachingActivityAction ? `Selected coaching card action: ${action.coachingActivityAction.action}; activityMessageId ${action.coachingActivityAction.activityMessageId}; expectedRevision ${action.coachingActivityAction.expectedRevision}; channel ${action.coachingActivityAction.channel ?? "chat"}. The executor checks the current revision.` : "",
    ].filter(Boolean).join("\n");
    return `User message ${message.id}:\n${formatTalentMessageContentForLlmPrompt({ ...message, payload }, {
      ...options, includeCreatedAt: true, preserveUserText: true,
      currentInput: true,
    })}${references ? `\n${references}` : ""}`;
  }).join("\n\n");
}

/** Messages stay in their original rows. Only delivery receipts live in the execution. */
export function createCareerInputInbox(args: {
  read: () => Promise<CareerInboxSnapshot>;
  save: (checkpoint: CareerReplyCheckpoint) => Promise<void>;
  deliveredIds: number[];
  deliveredEventIds?: string[];
  readEvents?: (events: CareerConversationEvent[]) => Promise<string>;
  readContext?: (messages: TalentMessageRow[]) => Promise<string>;
  preferredLocale?: string | null;
  timeZone?: string | null;
}): CareerInputInbox {
  const delivered = new Set(args.deliveredIds);
  const deliveredEvents = new Set(args.deliveredEventIds ?? []);
  return {
    messageIds: () => [...delivered],
    eventIds: () => [...deliveredEvents],
    async hasPending() {
      const snapshot = await args.read();
      return snapshot.messages.some(message => !delivered.has(message.id)) ||
        (snapshot.events ?? []).some(event => !deliveredEvents.has(event.id));
    },
    async append(messages) {
      const snapshot = await args.read();
      if (snapshot.completed) throw new Error("Conversation execution already completed");
      const pending = snapshot.messages.filter(message => !delivered.has(message.id));
      const events = (snapshot.events ?? []).filter(event => !deliveredEvents.has(event.id));
      if (!pending.length && !events.length) return false;
      const context = await args.readContext?.(pending);
      const eventContext = events.length ? await args.readEvents?.(events) : undefined;
      if (events.length && !eventContext) throw new Error("Execution event projection unavailable");
      messages.push({ role: "user", content: [formatCareerInboxMessages(pending, args), context, eventContext].filter(Boolean).join("\n\n") });
      for (const message of pending) delivered.add(message.id);
      for (const event of events) deliveredEvents.add(event.id);
      return true;
    },
    save: args.save,
  };
}
