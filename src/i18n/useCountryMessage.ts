"use client";

import { useMemo } from "react";
import { useCountryLang } from "@/hooks/useCountryLang";
import { en } from "@/lang/en";
import { ko } from "@/lang/ko";
import type { Locale } from "@/i18n/useMessage";
import {
  resolveLocaleFromCountryLang as resolveSharedLocaleFromCountryLang,
} from "@/i18n/localeResolution";

const DICTS = { ko, en } as const;

function resolveLocaleFromCountryLang(countryLang?: string | null): Locale {
  return resolveSharedLocaleFromCountryLang(countryLang);
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
