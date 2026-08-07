import { NextRequest, NextResponse } from "next/server";
import {
  normalizeLocale,
  resolveLocaleFromLanguage,
} from "@/i18n/localeResolution";

const LOCALE_COOKIE_NAME = "NEXT_LOCALE";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function parsePrimaryLanguage(acceptLanguage: string | null) {
  const primaryLocale =
    acceptLanguage?.split(",")[0]?.split(";")[0]?.trim() || "en";
  return primaryLocale.split("-")[0] || "en";
}

function inferRequestLocale(request: NextRequest) {
  return resolveLocaleFromLanguage(
    parsePrimaryLanguage(request.headers.get("accept-language"))
  );
}

export function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const { pathname } = req.nextUrl;
  let response = NextResponse.next();

  // Only rewrite the app subdomain's root document.
  // Static assets such as /_next/* must pass through untouched.
  if (host.startsWith("app.") && pathname === "/") {
    response = NextResponse.rewrite(new URL("/radar", req.url));
  }

  const existingLocale = normalizeLocale(
    req.cookies.get(LOCALE_COOKIE_NAME)?.value
  );
  const inferredLocale = inferRequestLocale(req);

  if (!existingLocale) {
    response.cookies.set(LOCALE_COOKIE_NAME, inferredLocale, {
      maxAge: ONE_YEAR_SECONDS,
      path: "/",
      sameSite: "lax",
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
