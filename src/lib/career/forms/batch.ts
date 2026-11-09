import type { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { toTalentMessageResponse, type TalentMessageRow } from "@/lib/talentOnboarding/models";
import { careerFormBatchInputSchema } from "./schema";
import { buildCareerFormResponseMessage } from "./format";
import { prepareCareerFormResponse } from "./server";

export async function respondToCareerForms(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>; userId: string; conversationId: string; input: unknown;
}) {
  const input = careerFormBatchInputSchema.parse(args.input);
  const previous = await args.admin.from("talent_messages").select("*")
    .eq("user_id", args.userId).eq("conversation_id", args.conversationId)
    .eq("message_type", "career_form_response").eq("payload->>requestId", input.requestId).maybeSingle();
  if (previous.error) throw new Error(previous.error.message);
  if (previous.data) return toTalentMessageResponse(previous.data as TalentMessageRow);
  const responses = [];
  for (const response of input.responses) {
    const prepared = await prepareCareerFormResponse({ ...args, batch: true,
      input: { ...response, conversationId: args.conversationId, requestId: `${input.requestId}:${response.formId}` } });
    responses.push(prepared);
  }
  const content = responses.map(response => [response.formSnapshot.title,
    buildCareerFormResponseMessage(response.formSnapshot, response.actionId, response.values, undefined, response),
  ].filter(Boolean).join("\n")).join("\n\n");
  const result = await (args.admin.rpc as any)("respond_career_forms", {
    p_user_id: args.userId, p_conversation_id: args.conversationId,
    p_request_id: input.requestId, p_responses: responses, p_content: content,
  });
  if (result.error) throw new Error(result.error.message);
  return toTalentMessageResponse(result.data as TalentMessageRow);
}
