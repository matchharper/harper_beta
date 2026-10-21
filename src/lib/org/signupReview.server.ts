import type { User } from "@supabase/supabase-js";
import domains from "./workspaceReviewDomains.json";

/** Only call with the authenticated user, never with request-body email/flags. */
export function workspaceSignupReview(
  user: Pick<User, "email" | "email_confirmed_at" | "is_anonymous">
) {
  if (!user.email || !user.email_confirmed_at || user.is_anonymous)
    throw new Error("signup_work_email_required");
  const email = user.email.toLowerCase();
  const host = email.split("@")[1];
  if (!host) throw new Error("signup_work_email_required");
  const match = domains
    .filter(({ domain }) => host === domain || host.endsWith(`.${domain}`))
    .sort((a, b) => b.domain.length - a.domain.length)[0];
  return { p_review_email: email, p_review_domain: match?.domain ?? null };
}
