"use client";

import { useEffect, useMemo, useState } from "react";
import { useCountryLang } from "@/hooks/useCountryLang";
import { en } from "@/lang/en";
import { ko } from "@/lang/ko";
import type { Locale } from "@/i18n/useMessage";

const COUNTRY_LANG_STORAGE_KEY = "harper_country_lang_0209";
const DICTS = { ko, en } as const;

function resolveLocaleFromCountryLang(countryLang?: string | null): Locale {
  const [rawCountry, rawLanguage] = String(countryLang ?? "").split("_");
  const country = (rawCountry || "ZZ").toUpperCase();
  const language = (rawLanguage || "").toLowerCase();

  if (country === "KR") return "ko";
  if (country !== "ZZ") return "en";
  if (language === "ko") return "ko";
  return "en";
}

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "ko";

  const cached = localStorage.getItem(COUNTRY_LANG_STORAGE_KEY);
  if (cached) {
    return resolveLocaleFromCountryLang(cached);
  }

  const browserLanguage = navigator.language?.toLowerCase() ?? "en";
  return browserLanguage.startsWith("ko") ? "ko" : "en";
}

export function useCountryMessages() {
  const countryLang = useCountryLang();
  const [locale, setLocale] = useState<Locale>(getInitialLocale);

  useEffect(() => {
    setLocale(resolveLocaleFromCountryLang(countryLang));
  }, [countryLang]);

  const m = useMemo(() => DICTS[locale], [locale]);

  return {
    locale,
    m,
    countryLang,
  };
}

export { resolveLocaleFromCountryLang };
