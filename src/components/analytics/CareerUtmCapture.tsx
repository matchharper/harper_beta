"use client";

import { useCountryLang } from "@/hooks/useCountryLang";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  CAREER_LANDING_LAST_ABTEST_TYPE_KEY,
  CAREER_LANDING_LAST_VISIT_AT_KEY,
  CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
  CAREER_LANDING_SESSION_GAP_MS,
  CAREER_PUBLIC_UTM_ABTEST_TYPE,
  CAREER_UTM_DEFAULT_SOURCE,
  CAREER_UTM_PARAMS_LOGGED_STORAGE_PREFIX,
  CAREER_UTM_SOURCE_STORAGE_KEY,
  buildCareerUtmLandingLogType,
  normalizeCareerUtmSource,
  persistCareerExplicitUtmSource,
  readCareerUtmParamsFromSearch,
  readCareerUtmSourceFromSearch,
} from "@/lib/career/utm";
import { withLandingLogSource } from "@/lib/landingLogTypes";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/router";
import { useEffect } from "react";

const NATIVE_CAREER_LANDING_PATHS = new Set(["/", "/en", "/ko"]);

function createCareerLandingId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getSearchFromPath(path: string) {
  try {
    return new URL(path, "https://matchharper.com").search;
  } catch {
    return "";
  }
}

function CareerUtmCaptureEffect({ search }: { search: string }) {
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const countryLang = useCountryLang();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (authLoading || user || typeof window === "undefined") return;

    const utmParams = readCareerUtmParamsFromSearch(search);
    if (!utmParams) return;

    const now = Date.now();
    const querySource =
      utmParams.utm_source ?? readCareerUtmSourceFromSearch(search);
    const savedSource = normalizeCareerUtmSource(
      window.localStorage.getItem(CAREER_UTM_SOURCE_STORAGE_KEY)
    );
    const resolvedSource =
      querySource ?? savedSource ?? CAREER_UTM_DEFAULT_SOURCE;
    const savedId = window.localStorage.getItem(
      CAREER_LANDING_LOCAL_ID_STORAGE_KEY
    );
    const localId = savedId || createCareerLandingId();
    const savedAbtestType = window.localStorage.getItem(
      CAREER_LANDING_LAST_ABTEST_TYPE_KEY
    );
    const lastVisitAt = Number(
      window.localStorage.getItem(CAREER_LANDING_LAST_VISIT_AT_KEY)
    );
    const hasExpiredSession =
      Number.isFinite(lastVisitAt) &&
      lastVisitAt > 0 &&
      now - lastVisitAt >= CAREER_LANDING_SESSION_GAP_MS;
    const entryType =
      !savedId || !savedAbtestType
        ? "new_visit"
        : (querySource && querySource !== savedSource) || hasExpiredSession
          ? "new_session"
          : null;

    window.localStorage.setItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY, localId);
    window.localStorage.setItem(CAREER_UTM_SOURCE_STORAGE_KEY, resolvedSource);
    window.localStorage.setItem(CAREER_LANDING_LAST_VISIT_AT_KEY, String(now));
    if (!savedAbtestType) {
      window.localStorage.setItem(
        CAREER_LANDING_LAST_ABTEST_TYPE_KEY,
        CAREER_PUBLIC_UTM_ABTEST_TYPE
      );
    }
    if (utmParams.utm_source) {
      persistCareerExplicitUtmSource(utmParams.utm_source, now);
    }

    if (entryType) {
      void supabase
        .from("landing_logs")
        .insert({
          local_id: localId,
          type: withLandingLogSource(entryType, resolvedSource),
          abtest_type: CAREER_PUBLIC_UTM_ABTEST_TYPE,
          is_mobile: isMobile,
          country_lang: countryLang,
        })
        .then(({ error }) => {
          if (error) {
            console.error("public UTM entry log insert error:", error);
          }
        });
    }

    const utmLogType = buildCareerUtmLandingLogType(utmParams);
    if (!utmLogType) return;

    const storageKey = `${CAREER_UTM_PARAMS_LOGGED_STORAGE_PREFIX}:${localId}:${utmLogType}`;
    if (window.localStorage.getItem(storageKey)) return;

    void supabase
      .from("landing_logs")
      .insert({
        local_id: localId,
        type: utmLogType,
        abtest_type: CAREER_PUBLIC_UTM_ABTEST_TYPE,
        is_mobile: isMobile,
        country_lang: countryLang,
      })
      .then(({ error }) => {
        if (error) {
          console.error("public UTM params log insert error:", error);
          return;
        }
        window.localStorage.setItem(storageKey, "1");
      });
  }, [authLoading, countryLang, isMobile, search, user]);

  return null;
}

export default function CareerUtmCapture() {
  const router = useRouter();
  if (!router.isReady || NATIVE_CAREER_LANDING_PATHS.has(router.pathname)) {
    return null;
  }

  const search = getSearchFromPath(router.asPath);
  if (!readCareerUtmParamsFromSearch(search)) return null;

  return <CareerUtmCaptureEffect search={search} />;
}
