import type {
  TalentToolDefinition,
  TalentToolExecutionContext,
} from "@/lib/talentOnboarding/tools";
import { CAREER_DELIVERY_TOOLS } from "@/lib/career/background/delivery";
import { READ_AGENT_MESSAGES_TOOL, CONTACT_USER_TOOL } from "./toolContracts";
import type { AgentContactSource } from "./contracts";
import { readAgentCorrespondence } from "./read";
import { agentContactDatabase, assertAgentContactSource } from "./store";

export function careerContactSource(
  context?: TalentToolExecutionContext
): Extract<AgentContactSource, { kind: "career" }> {
  if (!context?.userId || !context.conversationId)
    throw new Error("Authenticated Career conversation required");
  return {
    kind: "career",
    talentId: context.userId,
    conversationId: context.conversationId,
    ...(context.voiceEventId
      ? { voiceEventId: context.voiceEventId }
      : context.backgroundInvocation
        ? { backgroundRunId: context.backgroundInvocation.runId }
        : { messageId: Number(context.userMessageId) }),
  };
}
export const CAREER_CONTACT_TOOLS: Record<string, TalentToolDefinition> = {
  read_agent_messages: {
    ...READ_AGENT_MESSAGES_TOOL.function,
    channels: ["chat", "voice"],
    execute: (input, context) =>
      readAgentCorrespondence(careerContactSource(context), input),
  },
  contact_user: {
    ...CONTACT_USER_TOOL.function,
    channels: ["chat"],
    async execute(input, context) {
      if (input.channel === "email")
        return CAREER_DELIVERY_TOOLS.deliver_career_email.execute!(
          { action: "deliver", subject: input.subject, body: input.body },
          context
        );
      if (input.channel !== "chat")
        throw new Error(
          "This candidate has no approved audience for that channel"
        );
      const source = careerContactSource(context);
      if (!source.backgroundRunId)
        throw new Error(
          "Use the ordinary reply in the active candidate conversation"
        );
      const body = String(input.body ?? "");
      if (!body.trim()) throw new Error("Message body required");
      const key = `agent-contact-user:${source.backgroundRunId}`;
      return agentContactDatabase().transaction(async (q) => {
        await assertAgentContactSource(q, source, "");
        const { assertCareerSourceEventsCurrent } =
          await import("@/lib/career/companies/server");
        const [run] = await q(
          "SELECT * FROM public.opportunity_discovery_run WHERE id=$1::uuid",
          [source.backgroundRunId]
        );
        await assertCareerSourceEventsCurrent({
          admin: context!.admin as any,
          run: run as any,
        });
        await q("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
        const [previous] = await q(
          "SELECT id FROM public.talent_messages WHERE user_id=$1::uuid AND payload->>'agentContactDeliveryKey'=$2",
          [source.talentId, key]
        );
        const [message] = previous
          ? [previous]
          : await q(
              `INSERT INTO public.talent_messages(user_id,conversation_id,role,content,message_type,payload)
        VALUES($1::uuid,$2::uuid,'assistant',$3,'chat',$4::jsonb) RETURNING id`,
              [
                source.talentId,
                source.conversationId,
                body,
                JSON.stringify({
                  agentContactDeliveryKey: key,
                  backgroundRunId: source.backgroundRunId,
                }),
              ]
            );
        return {
          status: "saved",
          messageId: message.id,
          modelOutput: `Message ${message.id} saved in the candidate's chat${previous ? "; original message reused" : ""}. This receipt does not establish that it was read.`,
        };
      });
    },
  },
};
