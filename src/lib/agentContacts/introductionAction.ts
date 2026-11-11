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

/**
 * The free text a candidate wrote with a decline: the form's own note, or plain
 * text. The reason options they picked are not part of it (context minimization).
 */
export function declineNote(feedbackReason: string | null | undefined) {
  const raw = String(feedbackReason ?? "").trim();
  if (!raw) return { note: "" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return { note: typeof parsed.customReason === "string" ? parsed.customReason.trim() : "" };
  } catch {}
  return { note: raw };
}

/**
 * A saved decline with the candidate's note becomes a durable Career request,
 * like an introduction button: the original Career LLM reads the note and
 * decides whether part of it is meant for the company. The decline itself is
 * already saved and never waits for this.
 */
export async function admitDeclineNoteAction(args: {
  admin: any;
  talentId: string;
  conversationId: string;
  opportunity: any;
  content: string;
  note: string;
  isMobile?: boolean;
}) {
  const rec = args.opportunity;
  const payload = {
    opportunityDecision: {
      decision: "decline",
      recommendationId: rec.id,
      roleId: rec.roleId,
      decisionAt: rec.feedbackAt ?? null,
      note: args.note,
    },
    clientRequestId: `decline-note:${rec.id}:${rec.feedbackAt ?? "new"}`,
  };
  const { data, error } = await args.admin.rpc("admit_career_request", {
    p_user_id: args.talentId,
    p_conversation_id: args.conversationId,
    p_content: args.content,
    p_message_type: "opportunity_feedback_note",
    p_is_mobile: args.isMobile ?? null,
    p_payload: payload,
  });
  if (error) throw error;
  return data;
}
