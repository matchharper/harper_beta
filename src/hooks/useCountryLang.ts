import { useEffect, useState } from "react";

const COUNTRY_LANG_STORAGE_KEY = "harper_country_lang_0209";
const DEFAULT_COUNTRY_LANG = "ZZ_en";

type LandingContextResponse = {
  countryLang?: string;
};

const buildFallbackCountryLang = () => {
  if (typeof navigator === "undefined") return DEFAULT_COUNTRY_LANG;

  const locale = navigator.language || "en";
  const [rawLanguage, rawCountry] = locale.split("-");
  const language = (rawLanguage || "en").toLowerCase();
  const countryCode = (rawCountry || "ZZ").toUpperCase();
  return `${countryCode}_${language}`;
};

export const useCountryLang = () => {
  const [countryLang, setCountryLang] = useState<string>(DEFAULT_COUNTRY_LANG);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const cached = localStorage.getItem(COUNTRY_LANG_STORAGE_KEY);
    if (cached) {
      setCountryLang(cached);
      return;
    }

    const fallback = buildFallbackCountryLang();
    setCountryLang(fallback);
    localStorage.setItem(COUNTRY_LANG_STORAGE_KEY, fallback);

    let cancelled = false;

    const hydrateFromServer = async () => {
      try {
        const res = await fetch("/api/landing/context", { cache: "no-store" });
        if (!res.ok) return;

        const data = (await res.json()) as LandingContextResponse;
        if (cancelled || !data.countryLang) return;

        setCountryLang(data.countryLang);
        localStorage.setItem(COUNTRY_LANG_STORAGE_KEY, data.countryLang);
      } catch (_error) {
        // Keep fallback if network/geolocation headers are unavailable.
      }
    };

    hydrateFromServer();

    return () => {
      cancelled = true;
    };
  }, []);

  return countryLang;
};
