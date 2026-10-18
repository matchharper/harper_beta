import { useEffect, useRef } from "react";
import { normalizeLocale } from "@/i18n/localeResolution";
import { useMessages, type Locale } from "@/i18n/useMessage";

// A logged-in talent's saved language decides the screen once the session
// loads, instead of the browser guess. Each saved value is applied once, so a
// language picked afterwards in the profile menu is not switched back.
export const useCareerSavedLocale = (savedLocale: unknown) => {
  const { locale, setLocale } = useMessages();
  const appliedLocaleRef = useRef<Locale | null>(null);

  useEffect(() => {
    const saved = normalizeLocale(savedLocale);
    if (!saved || saved === appliedLocaleRef.current) return;
    appliedLocaleRef.current = saved;
    if (saved !== locale) setLocale(saved);
  }, [locale, savedLocale, setLocale]);
};
