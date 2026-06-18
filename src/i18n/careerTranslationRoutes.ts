export function isCareerTranslationRoute(path: string | null | undefined) {
  const pathname = path?.split(/[?#]/)[0]?.replace(/\/+$/, "") || "/";

  return pathname === "/career" || pathname.startsWith("/career/");
}

export function getCurrentCareerTranslationPath(
  fallbackPath: string | null | undefined
) {
  if (typeof window !== "undefined") {
    return window.location.pathname;
  }

  return fallbackPath;
}
