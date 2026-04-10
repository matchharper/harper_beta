import {
  normalizeEmail,
  normalizeExcludedEmails,
} from "@/lib/adminMetrics/utils";
import {
  ATS_ALLOWED_EMAILS,
  INTERNAL_EMAIL_DOMAIN,
  getEmailDomain,
} from "@/lib/internalAccess";

type LandingLogIdentity = {
  local_id: string | null | undefined;
  type: string | null | undefined;
};

export const DEFAULT_ADMIN_EXCLUDED_EMAILS = normalizeExcludedEmails([
  `@${INTERNAL_EMAIL_DOMAIN}`,
  ...ATS_ALLOWED_EMAILS,
]);

export function createExcludedEmailSet(input: string | string[]) {
  return new Set(normalizeExcludedEmails(input));
}

export function isEmailExcluded(
  value: string | null | undefined,
  excludedEmails: Iterable<string>
) {
  const normalized = normalizeEmail(value);
  if (!normalized) return false;

  const excludedEmailSet =
    excludedEmails instanceof Set
      ? excludedEmails
      : new Set(
          Array.from(excludedEmails)
            .map((item) => normalizeEmail(item))
            .filter(Boolean)
        );

  if (excludedEmailSet.has(normalized)) return true;

  const domain = getEmailDomain(normalized);
  if (!domain) return false;

  return excludedEmailSet.has(`@${domain}`);
}

export function extractLoginEmailFromLandingLogType(
  type: string | null | undefined
) {
  const value = String(type ?? "").trim();
  const prefix = "login_email:";
  if (!value.startsWith(prefix)) return null;

  const email = normalizeEmail(value.slice(prefix.length));
  return email || null;
}

export function collectExcludedLandingLocalIds<T extends LandingLogIdentity>(
  logs: T[],
  excludedEmails: string[] | Set<string>
) {
  const excludedEmailSet =
    excludedEmails instanceof Set
      ? excludedEmails
      : createExcludedEmailSet(excludedEmails);
  const excludedLocalIds = new Set<string>();

  if (excludedEmailSet.size === 0) return excludedLocalIds;

  for (const log of logs) {
    const localId = String(log.local_id ?? "").trim();
    if (!localId) continue;

    const email = extractLoginEmailFromLandingLogType(log.type);
    if (!email) continue;
    if (!isEmailExcluded(email, excludedEmailSet)) continue;

    excludedLocalIds.add(localId);
  }

  return excludedLocalIds;
}

export function filterLandingLogsByExcludedLocalIds<
  T extends { local_id: string | null | undefined },
>(logs: T[], excludedLocalIds: Iterable<string>) {
  const excludedLocalIdSet =
    excludedLocalIds instanceof Set
      ? excludedLocalIds
      : new Set(
          Array.from(excludedLocalIds)
            .map((value) => String(value ?? "").trim())
            .filter(Boolean)
        );

  if (excludedLocalIdSet.size === 0) return logs;

  return logs.filter((log) => {
    const localId = String(log.local_id ?? "").trim();
    return !localId || !excludedLocalIdSet.has(localId);
  });
}
