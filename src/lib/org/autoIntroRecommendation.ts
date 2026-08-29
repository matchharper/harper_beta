const AUTO_INTRO_REPLY_CTA = "_*PLEASE REPLY TO REQUEST AN INTRO*_";

function jsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function preservedText(value: unknown) {
  const text = typeof value === "string" ? value : "";
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export function extractSentAutoIntroRecommendationBody(row: {
  metadata?: unknown;
  text?: unknown;
}) {
  const metadata = jsonRecord(row.metadata);
  if (metadata.slackSent !== true && metadata.deliveryStatus !== "sent") {
    return null;
  }

  const candidateCopy =
    preservedText(metadata.candidateCopy) || preservedText(row.text);
  if (!candidateCopy) return null;

  const replyCtaIndex = candidateCopy.indexOf(AUTO_INTRO_REPLY_CTA);
  if (replyCtaIndex < 0) return candidateCopy;
  return preservedText(
    candidateCopy.slice(replyCtaIndex + AUTO_INTRO_REPLY_CTA.length)
  );
}
