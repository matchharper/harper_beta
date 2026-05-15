const DEFAULT_COMPACT_URL_MAX_LENGTH = 44;
const URL_TEXT_PATTERN = /^(https?:\/\/|mailto:|www\.)\S+$/i;
const HARPER_OWNED_DOMAIN = "matchharper.com";
const COMMON_SECOND_LEVEL_TLDS = new Set([
  "ac",
  "co",
  "com",
  "edu",
  "go",
  "net",
  "org",
]);

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function truncateLabel(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
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
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;

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

    return `${url.pathname || "/"}${url.search}${url.hash}`;
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

  try {
    const url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw);
    const hostParts = url.hostname.replace(/^www\./i, "").split(".");
    const hasCountrySuffix =
      hostParts.length >= 3 &&
      (hostParts.at(-1)?.length ?? 0) === 2 &&
      COMMON_SECOND_LEVEL_TLDS.has(hostParts.at(-2)?.toLowerCase() ?? "");
    const labelIndex = hostParts.length - (hasCountrySuffix ? 3 : 2);
    const label = hostParts[Math.max(0, labelIndex)] ?? url.hostname;

    return truncateLabel(trimTrailingSlash(label), maxLength);
  } catch {
    return truncateLabel(raw, maxLength);
  }
}
