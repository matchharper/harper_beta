export const TALENT_MESSAGE_TYPE_OPPORTUNITY_FEEDBACK_NOTE =
  "opportunity_feedback_note";

export function buildOpportunityFeedbackNoteContent(args: {
  action: "positive" | "negative";
  companyName: string;
  title: string;
}) {
  const title = args.title.replace(/\s+/g, " ").trim() || "Unknown role";
  const companyName =
    args.companyName.replace(/\s+/g, " ").trim() || "Unknown company";
  const actionLabel =
    args.action === "positive" ? "저장함" : "선호하지 않음";

  return `${title} at ${companyName} ${actionLabel}`;
}
