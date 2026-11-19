import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const DEV_ACCESS_HOST = "dev.matchharper.com";
export const DEV_ACCESS_ORIGIN = `https://${DEV_ACCESS_HOST}`;
export const DEV_ACCESS_DOMAIN = "matchharper.com";
export const DEV_ACCESS_LOGIN = "/api/dev-access/login";
export const DEV_ACCESS_CALLBACK = "/api/dev-access/callback";
export const DEV_ACCESS_COOKIE = "__Host-harper_dev_access";
export const DEV_ACCESS_OAUTH_COOKIE = "__Host-harper_dev_oauth";
export const DEV_ACCESS_OAUTH_SECONDS = 600;

export const devAccessCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

export type DevAccessIdentity = {
  sub: string;
  email: string;
  hd: string;
  exp: number;
};

export type DevAccessOAuthState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  exp: number;
};

export function isDevAccessHost(request: NextRequest) {
  // Next's server URL can use localhost/the deployment origin behind a proxy.
  // Host is the authority routed by Vercel; do not trust x-forwarded-host.
  const hostname =
    request.headers.get("host")?.split(":")[0] ?? request.nextUrl.hostname;
  return hostname.toLowerCase().replace(/\.$/, "") === DEV_ACCESS_HOST;
}

export function devAccessSecret() {
  const secret = process.env.DEV_ACCESS_SESSION_SECRET;
  // Configure this with at least 32 random bytes; reject short keys.
  if (!secret || Buffer.byteLength(secret) < 32) return null;
  return secret;
}

function sign(payload: string, purpose: "session" | "oauth", secret: string) {
  return createHmac("sha256", secret)
    .update(`harper.dev-access.${purpose}:${payload}`)
    .digest();
}

export function encodeDevAccessCookie(
  value: DevAccessIdentity | DevAccessOAuthState,
  purpose: "session" | "oauth",
  secret: string
) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${sign(payload, purpose, secret).toString("base64url")}`;
}

export function readDevAccessCookie(
  cookie: string | undefined,
  purpose: "session" | "oauth",
  secret: string,
  nowSeconds = Date.now() / 1000
): Record<string, unknown> | null {
  if (!cookie) return null;
  const parts = cookie.split(".");
  if (parts.length !== 2) return null;
  const [payload, supplied] = parts;
  const expected = sign(payload, purpose, secret);
  const actual = Buffer.from(supplied, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const result = value as Record<string, unknown>;
    if (
      typeof result.exp !== "number" ||
      !Number.isFinite(result.exp) ||
      result.exp <= nowSeconds
    ) {
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

export function isHarperDevIdentity(value: Record<string, unknown> | null) {
  return Boolean(
    value &&
    typeof value.sub === "string" &&
    value.sub.length > 0 &&
    typeof value.email === "string" &&
    value.email.toLowerCase().split("@").length === 2 &&
    value.email.toLowerCase().split("@")[1] === DEV_ACCESS_DOMAIN &&
    value.hd === DEV_ACCESS_DOMAIN
  );
}

export function devAccessReturnTo(raw: string | null) {
  if (!raw?.startsWith("/") || raw.includes("\\")) return "/";
  try {
    const url = new URL(raw, DEV_ACCESS_ORIGIN);
    if (
      url.origin !== DEV_ACCESS_ORIGIN ||
      url.pathname.startsWith("/api/dev-access/")
    ) {
      return "/";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function devAccessResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

/** Independent of customer auth: the dev gate never creates a Harper account. */
export function guardDevAccess(request: NextRequest): NextResponse | null {
  if (!isDevAccessHost(request)) return null;
  const { pathname } = request.nextUrl;
  if (pathname === DEV_ACCESS_LOGIN || pathname === DEV_ACCESS_CALLBACK)
    return null;

  const secret = devAccessSecret();
  if (!secret) {
    return devAccessResponse(
      new NextResponse("개발 사이트의 Google 인증 설정이 필요합니다.", {
        status: 503,
      })
    );
  }
  const identity = readDevAccessCookie(
    request.cookies.get(DEV_ACCESS_COOKIE)?.value,
    "session",
    secret
  );
  if (isHarperDevIdentity(identity)) return null;

  // API calls and assets cannot complete an interactive OAuth redirect.
  if (
    request.method !== "GET" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/")
  ) {
    return devAccessResponse(
      NextResponse.json({ error: "DEV_GOOGLE_LOGIN_REQUIRED" }, { status: 401 })
    );
  }
  const login = new URL(DEV_ACCESS_LOGIN, DEV_ACCESS_ORIGIN);
  login.searchParams.set("returnTo", `${pathname}${request.nextUrl.search}`);
  return devAccessResponse(NextResponse.redirect(login));
}
