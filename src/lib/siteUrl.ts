const DEFAULT_PUBLIC_SITE_URL = "https://matchharper.com";

function normalizeSiteOrigin(value?: string | null) {
  const text = value?.trim();
  if (!text) return null;

  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;

  try {
    return new URL(withProtocol).origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function getHostname(origin: string) {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLocalhostOrigin(origin: string) {
  const hostname = getHostname(origin);
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

function isVercelOrigin(origin: string) {
  const hostname = getHostname(origin);
  return hostname === "vercel.app" || hostname.endsWith(".vercel.app");
}

export function getPublicSiteUrlFromRequest(
  req: Pick<Request, "headers" | "url">
) {
  const configured = normalizeSiteOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured && !isVercelOrigin(configured)) {
    return configured;
  }

  const requestOrigin = normalizeSiteOrigin(req.url);
  if (requestOrigin && isLocalhostOrigin(requestOrigin)) {
    return requestOrigin;
  }

  return DEFAULT_PUBLIC_SITE_URL;
}
