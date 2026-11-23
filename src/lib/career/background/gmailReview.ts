/** The first inbox review after a Gmail connection, before it starts. It waits for a quiet chat and holds nothing
 * meanwhile, so the person's own saves are not refused because of it. */
export function isWaitingGmailReview(run: { trigger?: string | null; coverage?: unknown }) {
  return run.trigger === "gmail_connected" && !(run.coverage as { gmailReviewStartedAt?: unknown } | null | undefined)?.gmailReviewStartedAt;
}
