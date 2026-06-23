import { useEffect, useState } from "react";
import { getBrowserCountryLang } from "@/i18n/localeResolution";

const COUNTRY_LANG_STORAGE_KEY = "harper_country_lang_0209";
const DEFAULT_COUNTRY_LANG = "ZZ_en";

type LandingContextResponse = {
  countryLang?: string;
};

function getInitialCountryLang() {
  if (typeof window === "undefined") return DEFAULT_COUNTRY_LANG;

  try {
    return (
      localStorage.getItem(COUNTRY_LANG_STORAGE_KEY) || getBrowserCountryLang()
    );
  } catch {
    return DEFAULT_COUNTRY_LANG;
  }
}

export const useCountryLang = () => {
  const [countryLang, setCountryLang] = useState<string>(getInitialCountryLang);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (!localStorage.getItem(COUNTRY_LANG_STORAGE_KEY)) {
        localStorage.setItem(COUNTRY_LANG_STORAGE_KEY, getInitialCountryLang());
      }
    } catch {
      // Ignore storage failures and keep the in-memory fallback.
    }

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
