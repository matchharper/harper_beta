const AUTO_INTRO_REPLY_CTA = "_*PLEASE REPLY TO REQUEST AN INTRO*_";

function jsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function preservedText(value: unknown) {
  const text = typeof value === "string" ? value : "";
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

/** Caller must authorize the company-visible progress row. Report availability
 * is independent of Slack delivery and does not attest to a sent message. */
export function extractCompanyCandidateIntroduction(row: { metadata?: unknown; text?: unknown }) {
  const metadata = jsonRecord(row.metadata);
  if (metadata.deliveryOwner === "role_matching_outbox") {
    return preservedText(jsonRecord(metadata.companyPresentation).tldr) || null;
  }
  if (metadata.autoIntroToCompany === true) {
    const introduction = preservedText(jsonRecord(metadata.companyPresentation).introduction);
    if (introduction) return introduction;
  }
  return extractSentAutoIntroRecommendationBody(row);
}

export function extractSentAutoIntroRecommendationBody(row: {
  metadata?: unknown;
  text?: unknown;
}) {
  const metadata = jsonRecord(row.metadata);
  if (metadata.slackSent !== true && metadata.deliveryStatus !== "sent") {
    return null;
  }

  const introduction = preservedText(jsonRecord(metadata.companyPresentation).introduction);
  if (introduction) return introduction;

  const candidateCopy =
    preservedText(metadata.candidateCopy) || preservedText(row.text);
  if (!candidateCopy) return null;

  const replyCtaIndex = candidateCopy.indexOf(AUTO_INTRO_REPLY_CTA);
  if (replyCtaIndex < 0) return candidateCopy;
  return preservedText(
    candidateCopy.slice(replyCtaIndex + AUTO_INTRO_REPLY_CTA.length)
  );
}
