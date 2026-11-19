const MAIL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The GTM mail id the onboarding page sends with its final submit (POST /api/talent/onboarding/start), or null.
 * The server puts the mail's postings in the inbox and records the sign-up on the mail right then, so a person who
 * closes the tab after submitting, or whose phone never opens /career, still counts on Ops (가입) and gets the
 * postings. /career's own claim (useGtmInviteClaim) stays as the second try and opens the posting.
 */
export function gtmMailIdFromOnboarding(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return MAIL_ID.test(text) ? text.toLowerCase() : null;
}
