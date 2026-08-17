const HARPER_PUBLIC_HOSTNAMES = new Set([
  "matchharper.com",
  "www.matchharper.com",
]);
const HARPER_SUPABASE_STORAGE_HOSTNAMES = new Set([
  "zzojrniuppueizhnmqfd.supabase.co",
]);
const PUBLIC_IMAGE_PATH_PREFIX = "/images/";
const LINKEDIN_MEDIA_HOSTNAME = "media.licdn.com";
const SUPABASE_PUBLIC_STORAGE_PATH_PREFIX = "/storage/v1/object/public/";

try {
  const configuredSupabaseHostname = new URL(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  ).hostname
    .toLowerCase()
    .replace(/\.$/, "");
  if (configuredSupabaseHostname) {
    HARPER_SUPABASE_STORAGE_HOSTNAMES.add(configuredSupabaseHostname);
  }
} catch {
  // The fixed production storage hostname above remains available.
}

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

function filterExpiredLinkedInMediaUrl(
  value: string | null,
  nowMs: number
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");

    if (hostname === LINKEDIN_MEDIA_HOSTNAME) {
      const expiresAtSeconds = Number(url.searchParams.get("e"));

      if (
        Number.isFinite(expiresAtSeconds) &&
        expiresAtSeconds > 0 &&
        expiresAtSeconds * 1_000 <= nowMs
      ) {
        return null;
      }
    }
  } catch {
    // Preserve non-URL image values so the image component can handle them.
  }

  return raw;
}

export function getDisplayableProfileImageUrl(
  value: string | null | undefined,
  nowMs = Date.now()
): string | null {
  return filterExpiredLinkedInMediaUrl(
    String(value ?? "").trim() || null,
    nowMs
  );
}

export function getDisplayableCompanyLogoUrl(
  value: string | null | undefined,
  nowMs = Date.now()
): string | null {
  return filterExpiredLinkedInMediaUrl(
    normalizeHarperPublicImageUrl(value),
    nowMs
  );
}

export function getHarperSupabaseStorageImageUrl(
  value: string | null | undefined
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const isWebUrl = url.protocol === "https:" || url.protocol === "http:";

    if (
      isWebUrl &&
      HARPER_SUPABASE_STORAGE_HOSTNAMES.has(hostname) &&
      url.pathname.startsWith(SUPABASE_PUBLIC_STORAGE_PATH_PREFIX)
    ) {
      return raw;
    }
  } catch {
    return null;
  }

  return null;
}

export function resolveCompanyLogoUrl(args: {
  companyDbLogoUrl: string | null | undefined;
  workspaceLogoUrl: string | null | undefined;
  nowMs?: number;
}): string | null {
  return (
    getHarperSupabaseStorageImageUrl(args.companyDbLogoUrl) ??
    getDisplayableCompanyLogoUrl(args.workspaceLogoUrl, args.nowMs)
  );
}
