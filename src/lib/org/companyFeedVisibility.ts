/** Hide candidate-first recommendation history only in the company feed. */
export function isCompanyFeedProgressVisible(row: {
  kind: string;
  talent_opportunity_recommendation?: {
    opportunity_type: string | null;
  } | null;
}) {
  if (row.kind === "internal_followup_sent") {
    // Legacy Intro follow-ups used this same kind; keep those company-requested contacts.
    return (
      row.talent_opportunity_recommendation?.opportunity_type ===
      "intro_request"
    );
  }
  return ![
    "candidate_role_recommendation_presented",
    "candidate_role_recommendation_accepted",
    "internal_fit_question_asked",
    "matching_clarification_sent",
  ].includes(row.kind);
}
