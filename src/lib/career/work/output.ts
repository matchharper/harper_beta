import type { CareerTextTurnAdapter } from "../chatTurn";
import type { TalentMessageRow } from "@/lib/talentOnboarding/models";
import type { WorkScope } from "./store";

/** Delegates return private results; only the originating conversation addresses the user. */
export function createDelegatedTurnAdapter(
  scope: WorkScope, invocationId: string, source: TalentMessageRow, flush: () => Promise<unknown>, claim: () => string | undefined,
): CareerTextTurnAdapter {
  return {
    sourceMessage: source,
    artifactsVisible: true,
    adaptPromptBlocks: blocks => blocks,
    adaptTools: selection => ({ ...selection,
      tools: selection.tools.filter(tool => !["contact_user", "suggest_form"].includes(tool.function.name)),
      toolNames: selection.toolNames.filter(name => !["contact_user", "suggest_form"].includes(name)),
    }),
    executeTool: ({ executeDefault }) => executeDefault(),
    async persistAssistant(output) {
      await flush();
      const { error } = await (scope.admin.rpc as any)("save_career_delegated_output", {
        p_user_id: scope.userId, p_conversation_id: scope.conversationId,
        p_invocation_id: invocationId, p_claim_id: claim(), p_output: { content: output.content, agentTurn: output.agentTurn },
      });
      if (error) throw error;
      // Adapter receipts are internal to the turn. No assistant chat row is inserted.
      return { ...source, role: "assistant", content: output.content,
        payload: { agentTurn: output.agentTurn } } as TalentMessageRow;
    },
  };
}
