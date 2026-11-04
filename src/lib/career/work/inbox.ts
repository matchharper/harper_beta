import type { TalentMessageRow } from "@/lib/talentOnboarding/models";
import { formatTalentMessageContentForLlmPrompt } from "../opportunityFeedbackNote";
import type { CareerInputInbox, CareerReplyCheckpoint } from "../capabilities/runtime";
import type { WorkScope } from "./store";

export type CareerInboxSnapshot = {
  messages: TalentMessageRow[];
  deliveredIds: number[];
  inputIds: number[];
  completed: boolean;
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
    return `User message ${message.id}:\n${formatTalentMessageContentForLlmPrompt({ ...message, payload }, {
      ...options, includeCreatedAt: true, preserveUserText: true,
    })}`;
  }).join("\n\n");
}

/** Messages stay in their original rows. Only delivery receipts live in the execution. */
export function createCareerInputInbox(args: {
  read: () => Promise<CareerInboxSnapshot>;
  save: (checkpoint: CareerReplyCheckpoint) => Promise<void>;
  deliveredIds: number[];
  preferredLocale?: string | null;
  timeZone?: string | null;
}): CareerInputInbox {
  const delivered = new Set(args.deliveredIds);
  return {
    messageIds: () => [...delivered],
    async append(messages) {
      const snapshot = await args.read();
      if (snapshot.completed) throw new Error("Conversation execution already completed");
      const pending = snapshot.messages.filter(message => !delivered.has(message.id));
      if (!pending.length) return false;
      messages.push({ role: "user", content: formatCareerInboxMessages(pending, args) });
      for (const message of pending) delivered.add(message.id);
      return true;
    },
    save: args.save,
  };
}
