const HARPER_PUBLIC_HOSTNAMES = new Set([
  "matchharper.com",
  "www.matchharper.com",
]);
const PUBLIC_IMAGE_PATH_PREFIX = "/images/";

export function normalizeHarperPublicImageUrl(
  value: string | null | undefined
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (raw.startsWith(PUBLIC_IMAGE_PATH_PREFIX)) {
    return raw;
  }

  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const isWebUrl = url.protocol === "https:" || url.protocol === "http:";

    if (
      isWebUrl &&
      HARPER_PUBLIC_HOSTNAMES.has(hostname) &&
      url.pathname.startsWith(PUBLIC_IMAGE_PATH_PREFIX)
    ) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    // Preserve non-URL image values so existing fallbacks keep working.
  }

  return raw;
}
