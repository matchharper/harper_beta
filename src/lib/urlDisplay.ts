const DEFAULT_COMPACT_URL_MAX_LENGTH = 30;
const URL_TEXT_PATTERN = /^(https?:\/\/|mailto:|www\.)\S+$/i;
const HARPER_OWNED_DOMAIN = "matchharper.com";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_CAREER_ROLE_PATH_PATTERN =
  /^\/career\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?(?:[?#].*)?$/i;
function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function truncateLabel(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
}

function buildCareerHistoryRoute(roleId: string) {
  return `/career/history?historyTab=new&id=${encodeURIComponent(roleId)}`;
}

function normalizeHarperOwnedRoute(route: string) {
  const match = route.match(LEGACY_CAREER_ROLE_PATH_PATTERN);
  if (!match?.[1]) return route;
  return buildCareerHistoryRoute(match[1]);
}

export function isUrlText(value: string) {
  return URL_TEXT_PATTERN.test(value.trim());
}

export function isHarperOwnedUrl(value: string) {
  return getHarperOwnedUrlRoute(value) !== null;
}

export function getHarperOwnedUrlRoute(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  if (UUID_PATTERN.test(raw)) return buildCareerHistoryRoute(raw);
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return normalizeHarperOwnedRoute(raw);
  }

  const urlText = raw.startsWith("//")
    ? `https:${raw}`
    : /^www\./i.test(raw)
      ? `https://${raw}`
      : raw;

  try {
    const url = new URL(urlText);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const isHarperOwned =
      hostname === HARPER_OWNED_DOMAIN ||
      hostname.endsWith(`.${HARPER_OWNED_DOMAIN}`);
    if (!isHarperOwned) return null;

    return normalizeHarperOwnedRoute(
      `${url.pathname || "/"}${url.search}${url.hash}`
    );
  } catch {
    return null;
  }
}

export function compactUrlLabel(
  value: string,
  maxLength = DEFAULT_COMPACT_URL_MAX_LENGTH
) {
  const raw = value.trim();
  if (!raw) return raw;

  if (raw.toLowerCase().startsWith("mailto:")) {
    return truncateLabel(raw.slice("mailto:".length), maxLength);
  }

  return truncateLabel(
    trimTrailingSlash(raw.replace(/^https:\/\//i, "")),
    maxLength
  );
}
