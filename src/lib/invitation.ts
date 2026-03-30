export function normalizeInvitationDomain(value?: string | null) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");

  if (!normalized) return null;

  const atIndex = normalized.lastIndexOf("@");
  if (atIndex >= 0) {
    const domain = normalized.slice(atIndex + 1);
    return domain || null;
  }

  return normalized;
}

export function getEmailDomain(email?: string | null) {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  const atIndex = normalizedEmail.lastIndexOf("@");

  if (atIndex <= 0 || atIndex === normalizedEmail.length - 1) {
    return null;
  }

  return normalizedEmail.slice(atIndex + 1);
}

export function doesEmailMatchInvitationDomain(
  email?: string | null,
  invitationDomain?: string | null
) {
  const normalizedInvitationDomain = normalizeInvitationDomain(invitationDomain);
  if (!normalizedInvitationDomain) return true;

  return getEmailDomain(email) === normalizedInvitationDomain;
}
