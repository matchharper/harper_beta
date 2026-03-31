"use client";

import { useMemo } from "react";
import { useCountryLang } from "@/hooks/useCountryLang";
import { en } from "@/lang/en";
import { ko } from "@/lang/ko";
import type { Locale } from "@/i18n/useMessage";

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

export function useCountryMessages() {
  const countryLang = useCountryLang();
  const locale = useMemo(
    () => resolveLocaleFromCountryLang(countryLang),
    [countryLang]
  );
  const m = useMemo(() => DICTS[locale], [locale]);

  return {
    locale,
    m,
    countryLang,
  };
}

export { resolveLocaleFromCountryLang };
