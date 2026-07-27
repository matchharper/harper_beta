import { getEmailDomain, INTERNAL_EMAIL_DOMAIN } from "@/lib/internalAccess";

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function hasOrgWorkspaceAccessBypass(email: string | null | undefined) {
  return getEmailDomain(email) === INTERNAL_EMAIL_DOMAIN;
}

export function isOrgInvitationForUser(args: {
  invitationEmail: string | null | undefined;
  userEmail: string | null | undefined;
}) {
  const userEmail = normalizeEmail(args.userEmail);
  const invitationEmail = normalizeEmail(args.invitationEmail);
  return Boolean(userEmail && invitationEmail === userEmail);
}
