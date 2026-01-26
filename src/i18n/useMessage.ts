"use client";

import { useEffect, useMemo, useState } from "react";
import { en } from "@/lang/en";
import { ko } from "@/lang/ko";

export type Locale = "ko" | "en";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="))
    ?.split("=")[1];
}

function getLocaleFromCookie(): Locale | null {
  const c = getCookie("NEXT_LOCALE");
  return c === "ko" || c === "en" ? c : null;
}

const DICTS = { ko, en } as const;

export function useMessages() {
  // 1) render 단계에서는 navigator 접근 X
  const [locale, setLocale] = useState<Locale>(() => {
    return getLocaleFromCookie() ?? "en"; // 기본값
  });

  // 2) mount 이후에만 navigator로 보정
  useEffect(() => {
    const fromCookie = getLocaleFromCookie();
    if (fromCookie) {
      setLocale(fromCookie);
      return;
    }

    const lang =
      typeof navigator !== "undefined" ? navigator.language?.toLowerCase() : "";
    setLocale(lang.startsWith("ko") ? "ko" : "en");
  }, []);

  const m = useMemo(() => DICTS[locale], [locale]);
  return { locale, m };
}
