export const LANDING_LOG_SOURCE_SEPARATOR = ":";

export const LANDING_LOG_ENTRY_TYPES = ["new_visit", "new_session"] as const;

export type LandingLogEntryType = (typeof LANDING_LOG_ENTRY_TYPES)[number];

const LOGIN_EMAIL_PREFIX = "login_email:";
const SOURCE_AWARE_EVENT_TYPES = [
  ...LANDING_LOG_ENTRY_TYPES,
  "click_start",
  "email_capture_already_sent",
  "email_capture_error",
  "email_capture_sent",
  "email_capture_submit",
  "first_scroll_down",
] as const;
const SOURCE_AWARE_EVENT_TYPE_SET: readonly string[] =
  SOURCE_AWARE_EVENT_TYPES;

export function isLandingLogEntryType(type: string | null | undefined) {
  const value = String(type ?? "").trim();
  return LANDING_LOG_ENTRY_TYPES.some(
    (entryType) => value === entryType || value.startsWith(`${entryType}:`)
  );
}

export function getLandingLogBaseType(type: string | null | undefined) {
  const value = String(type ?? "").trim();
  if (!value) return "";
  if (value.startsWith(LOGIN_EMAIL_PREFIX)) return LOGIN_EMAIL_PREFIX;

  const matchedType = SOURCE_AWARE_EVENT_TYPES.find(
    (eventType) => value === eventType || value.startsWith(`${eventType}:`)
  );

  return matchedType ?? value;
}

export function getLandingLogSource(type: string | null | undefined) {
  const value = String(type ?? "").trim();
  if (value.startsWith(LOGIN_EMAIL_PREFIX)) {
    const rest = value.slice(LOGIN_EMAIL_PREFIX.length).trim();
    const separatorIndex = rest.lastIndexOf(LANDING_LOG_SOURCE_SEPARATOR);
    if (separatorIndex === -1) return "unknown";

    const source = rest.slice(separatorIndex + 1).trim();
    return source || "unknown";
  }

  const matchedSourceAwareType = SOURCE_AWARE_EVENT_TYPES.find(
    (eventType) => value === eventType || value.startsWith(`${eventType}:`)
  );
  if (matchedSourceAwareType) {
    const source = value.slice(matchedSourceAwareType.length + 1).trim();
    return source || "unknown";
  }

  const matchedEntryType = LANDING_LOG_ENTRY_TYPES.find(
    (entryType) => value === entryType || value.startsWith(`${entryType}:`)
  );
  if (!matchedEntryType) return "unknown";

  const source = value.slice(matchedEntryType.length + 1).trim();
  return source || "unknown";
}

export function withLandingLogSource(type: string, source: string) {
  const normalizedType = String(type ?? "").trim();
  const normalizedSource = String(source ?? "").trim();
  if (!normalizedType || !normalizedSource) return normalizedType;

  if (normalizedType.startsWith(LOGIN_EMAIL_PREFIX)) {
    const email = extractEmailFromLandingLoginType(normalizedType);
    return email
      ? buildLandingLoginEmailType(email, normalizedSource)
      : normalizedType;
  }

  if (isLandingLogEntryType(normalizedType)) {
    const baseType = LANDING_LOG_ENTRY_TYPES.find((entryType) =>
      normalizedType.startsWith(entryType)
    );
    return baseType
      ? `${baseType}${LANDING_LOG_SOURCE_SEPARATOR}${normalizedSource}`
      : normalizedType;
  }

  if (SOURCE_AWARE_EVENT_TYPE_SET.includes(normalizedType)) {
    return `${normalizedType}${LANDING_LOG_SOURCE_SEPARATOR}${normalizedSource}`;
  }

  return normalizedType;
}

export function buildLandingLoginEmailType(
  email: string,
  source?: string | null
) {
  const normalizedEmail = String(email ?? "").trim();
  const normalizedSource = String(source ?? "").trim();
  if (!normalizedEmail) return "";
  return normalizedSource
    ? `login_email:${normalizedEmail}${LANDING_LOG_SOURCE_SEPARATOR}${normalizedSource}`
    : `login_email:${normalizedEmail}`;
}

export function extractEmailFromLandingLoginType(
  type: string | null | undefined
) {
  const value = String(type ?? "").trim();
  if (!value.startsWith(LOGIN_EMAIL_PREFIX)) return null;

  const rest = value.slice(LOGIN_EMAIL_PREFIX.length).trim();
  const separatorIndex = rest.indexOf(LANDING_LOG_SOURCE_SEPARATOR);
  const email =
    separatorIndex === -1 ? rest : rest.slice(0, separatorIndex).trim();
  return email || null;
}

export function isFirstScrollLandingLogType(type: string | null | undefined) {
  const value = String(type ?? "").trim();
  return (
    value === "first_scroll_down" || value.startsWith("first_scroll_down:")
  );
}

export function isStartLandingLogType(type: string | null | undefined) {
  const value = String(type ?? "").trim();
  if (value === "click_start" || value.startsWith("click_start:")) return true;
  return value.startsWith("click_") && value.endsWith("_start");
}
