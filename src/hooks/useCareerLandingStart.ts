import {
  CAREER_LANDING_ABTEST_TYPE,
  CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
  CAREER_UTM_DEFAULT_SOURCE,
  CAREER_UTM_LOGIN_LOGGED_STORAGE_PREFIX,
  CAREER_UTM_SOURCE_STORAGE_KEY,
  normalizeCareerUtmSource,
  readCareerUtmSourceFromSearch,
  resolveCareerUtmSource,
} from "@/lib/career/utm";
import {
  buildLandingLoginEmailType,
  withLandingLogSource,
} from "@/lib/landingLogTypes";
import { supabase } from "@/lib/supabase";
import { useCountryLang } from "@/hooks/useCountryLang";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";

const CAREER_AUTHENTICATED_START_HREF = "/career";
const CAREER_ONBOARDING_HREF = "/career/onboarding";
const CAREER_LANDING_LAST_ABTEST_TYPE_KEY =
  "harper_career_landing_last_abtest_type";
const CAREER_LANDING_LAST_VISIT_AT_KEY = "harper_career_landing_last_visit_at";
const CAREER_LANDING_SESSION_GAP_MS = 30 * 60 * 1000;

type UseCareerLandingStartOptions = {
  abtestType?: string;
  landingIdOverride?: string;
  trackingEnabled?: boolean;
};

const buildCareerLoginHref = (
  source: string,
  landingId: string,
  abtestType: string
) => {
  const params = new URLSearchParams({
    ab: abtestType,
    next: CAREER_ONBOARDING_HREF,
    source: resolveCareerUtmSource(source),
  });
  if (landingId) params.set("lid", landingId);
  return `/career_login?${params.toString()}`;
};

const createCareerLandingId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const useCareerStartHref = (
  source: string,
  landingId: string,
  abtestType: string
) => {
  const user = useAuthStore((state) => state.user);
  const session = useAuthStore((state) => state.session);
  const authLoading = useAuthStore((state) => state.loading);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      queueMicrotask(() => setNeedsOnboarding(null));
      return;
    }

    const token = session?.access_token;
    if (!token) {
      queueMicrotask(() => setNeedsOnboarding(true));
      return;
    }

    let cancelled = false;

    const loadOnboardingStatus = async () => {
      setNeedsOnboarding(null);

      try {
        const response = await fetch("/api/talent/onboarding/status", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = (await response.json().catch(() => ({}))) as {
          needsOnboarding?: boolean;
        };

        if (cancelled) return;

        if (!response.ok) {
          setNeedsOnboarding(true);
          return;
        }

        setNeedsOnboarding(payload.needsOnboarding !== false);
      } catch {
        if (!cancelled) setNeedsOnboarding(true);
      }
    };

    void loadOnboardingStatus();

    return () => {
      cancelled = true;
    };
  }, [authLoading, session?.access_token, user]);

  if (authLoading || !user) {
    return buildCareerLoginHref(source, landingId, abtestType);
  }

  return needsOnboarding === false
    ? CAREER_AUTHENTICATED_START_HREF
    : CAREER_ONBOARDING_HREF;
};

export function useCareerLandingStart({
  abtestType = CAREER_LANDING_ABTEST_TYPE,
  landingIdOverride,
  trackingEnabled = true,
}: UseCareerLandingStartOptions = {}) {
  const router = useRouter();
  const countryLang = useCountryLang();
  const isMobile = useIsMobile();
  const user = useAuthStore((state) => state.user);
  const session = useAuthStore((state) => state.session);
  const authLoading = useAuthStore((state) => state.loading);
  const [landingId, setLandingId] = useState("");
  const effectiveLandingId = landingIdOverride || landingId;
  const hasLoggedFirstScrollRef = useRef(false);
  const marketingSource = useMemo(() => {
    const querySource =
      typeof router.query.source === "string"
        ? normalizeCareerUtmSource(router.query.source)
        : null;
    if (querySource) return querySource;
    if (typeof window === "undefined") return CAREER_UTM_DEFAULT_SOURCE;
    return (
      normalizeCareerUtmSource(
        localStorage.getItem(CAREER_UTM_SOURCE_STORAGE_KEY)
      ) ?? CAREER_UTM_DEFAULT_SOURCE
    );
  }, [router.query.source]);
  const careerStartHref = useCareerStartHref(
    marketingSource,
    effectiveLandingId,
    abtestType
  );

  const addLandingLog = useCallback(
    async (
      type: string,
      overrides?: { localId?: string; source?: string | null }
    ) => {
      if (!trackingEnabled) return false;

      const storedLocalId =
        typeof window !== "undefined"
          ? (localStorage.getItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY) ?? "")
          : "";
      const storedSource =
        typeof window !== "undefined"
          ? localStorage.getItem(CAREER_UTM_SOURCE_STORAGE_KEY)
          : null;
      const resolvedLocalId =
        overrides?.localId || effectiveLandingId || storedLocalId;
      const resolvedSource = resolveCareerUtmSource(
        overrides?.source ?? marketingSource ?? storedSource
      );
      if (!resolvedLocalId) return false;

      try {
        const { error } = await supabase.from("landing_logs").insert({
          local_id: resolvedLocalId,
          type: withLandingLogSource(type, resolvedSource),
          abtest_type: abtestType,
          is_mobile: isMobile,
          country_lang: countryLang,
        });

        if (error) {
          console.error("career landing log insert error:", error);
          return false;
        }

        return true;
      } catch (error) {
        console.error("career landing log insert error:", error);
        return false;
      }
    },
    [
      abtestType,
      countryLang,
      effectiveLandingId,
      isMobile,
      marketingSource,
      trackingEnabled,
    ]
  );

  useEffect(() => {
    if (!trackingEnabled) return;
    if (typeof window === "undefined") return;
    // The signup-flow experiment is only shown before authentication. Waiting
    // for auth resolution also prevents an existing user from being recorded
    // as a new experiment entrant while their session is still loading.
    if (authLoading || user) return;

    const querySource = readCareerUtmSourceFromSearch(window.location.search);
    const savedSource = normalizeCareerUtmSource(
      localStorage.getItem(CAREER_UTM_SOURCE_STORAGE_KEY)
    );
    const resolvedSource =
      querySource ?? savedSource ?? CAREER_UTM_DEFAULT_SOURCE;
    localStorage.setItem(CAREER_UTM_SOURCE_STORAGE_KEY, resolvedSource);

    const savedId =
      landingIdOverride ||
      localStorage.getItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY);
    const savedAbtestType = localStorage.getItem(
      CAREER_LANDING_LAST_ABTEST_TYPE_KEY
    );
    const resolvedLandingId = savedId || createCareerLandingId();

    if (!savedId) {
      localStorage.setItem(
        CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
        resolvedLandingId
      );
      localStorage.setItem(CAREER_LANDING_LAST_ABTEST_TYPE_KEY, abtestType);
      localStorage.setItem(
        CAREER_LANDING_LAST_VISIT_AT_KEY,
        Date.now().toString()
      );
      void addLandingLog("new_visit", {
        localId: resolvedLandingId,
        source: resolvedSource,
      });
    }

    queueMicrotask(() => setLandingId(resolvedLandingId));

    if (savedId && !savedAbtestType) {
      localStorage.setItem(CAREER_LANDING_LAST_ABTEST_TYPE_KEY, abtestType);
      localStorage.setItem(
        CAREER_LANDING_LAST_VISIT_AT_KEY,
        Date.now().toString()
      );
      void addLandingLog("new_visit", {
        localId: savedId,
        source: resolvedSource,
      });
      return;
    }

    if (savedId && savedAbtestType !== abtestType) {
      localStorage.setItem(CAREER_LANDING_LAST_ABTEST_TYPE_KEY, abtestType);
      localStorage.setItem(
        CAREER_LANDING_LAST_VISIT_AT_KEY,
        Date.now().toString()
      );
      void addLandingLog("new_session", {
        localId: savedId,
        source: resolvedSource,
      });
      return;
    }

    if (savedId && querySource && querySource !== savedSource) {
      localStorage.setItem(
        CAREER_LANDING_LAST_VISIT_AT_KEY,
        Date.now().toString()
      );
      void addLandingLog("new_session", {
        localId: savedId,
        source: querySource,
      });
    }
  }, [
    abtestType,
    addLandingLog,
    authLoading,
    landingIdOverride,
    router.asPath,
    trackingEnabled,
    user,
  ]);

  useEffect(() => {
    if (!trackingEnabled) return;
    if (!effectiveLandingId || typeof window === "undefined") return;

    const now = Date.now();
    const lastVisitRaw = localStorage.getItem(CAREER_LANDING_LAST_VISIT_AT_KEY);
    const lastVisitAt = lastVisitRaw ? Number(lastVisitRaw) : null;

    if (
      lastVisitAt &&
      Number.isFinite(lastVisitAt) &&
      now - lastVisitAt >= CAREER_LANDING_SESSION_GAP_MS
    ) {
      void addLandingLog("new_session");
    }

    localStorage.setItem(CAREER_LANDING_LAST_VISIT_AT_KEY, now.toString());
  }, [addLandingLog, effectiveLandingId, trackingEnabled]);

  useEffect(() => {
    if (!trackingEnabled) return;
    if (!effectiveLandingId || typeof window === "undefined") return;

    const handleScroll = () => {
      if (hasLoggedFirstScrollRef.current || window.scrollY <= 0) return;

      hasLoggedFirstScrollRef.current = true;
      void addLandingLog("first_scroll_down");
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [addLandingLog, effectiveLandingId, trackingEnabled]);

  useEffect(() => {
    if (!trackingEnabled) return;
    if (
      !effectiveLandingId ||
      !user?.id ||
      !user.email ||
      typeof window === "undefined"
    ) {
      return;
    }

    const email = user.email;
    const source = resolveCareerUtmSource(marketingSource);
    const storageKey = `${CAREER_UTM_LOGIN_LOGGED_STORAGE_PREFIX}:${user.id}:${effectiveLandingId}:${source}`;
    if (localStorage.getItem(storageKey)) return;

    void (async () => {
      const didLog = await addLandingLog(
        buildLandingLoginEmailType(email, source)
      );
      if (didLog) localStorage.setItem(storageKey, "1");
    })();
  }, [
    addLandingLog,
    effectiveLandingId,
    marketingSource,
    trackingEnabled,
    user?.email,
    user?.id,
  ]);

  const handleCareerStartClick = useCallback(
    async (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      void addLandingLog("click_start");

      if (authLoading || !user) {
        void router.push(careerStartHref);
        return;
      }

      const token = session?.access_token;
      if (!token) {
        void router.push(CAREER_ONBOARDING_HREF);
        return;
      }

      try {
        const response = await fetch("/api/talent/onboarding/status", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = (await response.json().catch(() => ({}))) as {
          needsOnboarding?: boolean;
        };

        void router.push(
          response.ok && payload.needsOnboarding === false
            ? CAREER_AUTHENTICATED_START_HREF
            : CAREER_ONBOARDING_HREF
        );
      } catch {
        void router.push(CAREER_ONBOARDING_HREF);
      }
    },
    [
      addLandingLog,
      authLoading,
      careerStartHref,
      router,
      session?.access_token,
      user,
    ]
  );

  return {
    addLandingLog,
    careerStartHref,
    countryLang,
    handleCareerStartClick,
    isMobile,
    landingId: effectiveLandingId,
    marketingSource,
  };
}
