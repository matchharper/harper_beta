import { decodeMaterialSelection } from "./contracts";

/** A button admits a durable candidate request. The original Career LLM performs the introduction. */
export async function admitIntroductionAction(args: {
  admin: any;
  talentId: string;
  conversationId: string;
  opportunity: any;
  selectionRef: string;
  locale?: string | null;
  isMobile?: boolean;
  feedbackReason?: string | null;
}) {
  decodeMaterialSelection(args.selectionRef);
  const rec = args.opportunity;
  const content =
    args.locale === "en"
      ? `Please introduce me to ${rec.companyName} for ${rec.title}.`
      : `${rec.companyName}의 ${rec.title} 역할에 저를 소개해주세요.`;
  const payload = {
    recommendationId: rec.id,
    roleId: rec.roleId,
    selectionRef: args.selectionRef,
    decisionAt: rec.feedbackAt ?? null,
    feedbackReason: args.feedbackReason ?? null,
    clientRequestId: `introduction:${rec.id}:${rec.feedbackAt ?? "new"}:${args.selectionRef}`,
  };
  const { data, error } = await args.admin.rpc("admit_career_request", {
    p_user_id: args.talentId,
    p_conversation_id: args.conversationId,
    p_content: content,
    p_message_type: "agent_introduction_action",
    p_is_mobile: args.isMobile ?? null,
    p_payload: payload,
  });
  if (error) throw error;
  return data;
}
