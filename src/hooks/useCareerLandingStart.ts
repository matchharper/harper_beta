import {
  CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
  CAREER_UTM_DEFAULT_SOURCE,
  CAREER_UTM_SOURCE_STORAGE_KEY,
  normalizeCareerUtmSource,
  resolveCareerUtmSource,
} from "@/lib/careerUtm";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";

const CAREER_AUTHENTICATED_START_HREF = "/career";
const CAREER_ONBOARDING_HREF = "/career/onboarding";

const buildCareerLoginHref = (source: string, landingId: string) => {
  const params = new URLSearchParams({
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

const useCareerStartHref = (source: string, landingId: string) => {
  const user = useAuthStore((state) => state.user);
  const session = useAuthStore((state) => state.session);
  const authLoading = useAuthStore((state) => state.loading);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

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
    return buildCareerLoginHref(source, landingId);
  }

  if (needsOnboarding !== false) {
    return CAREER_ONBOARDING_HREF;
  }

  return CAREER_AUTHENTICATED_START_HREF;
};

export function useCareerLandingStart() {
  const router = useRouter();
  const [landingId, setLandingId] = useState("");
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
  const careerStartHref = useCareerStartHref(marketingSource, landingId);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const querySource =
      typeof router.query.source === "string"
        ? normalizeCareerUtmSource(router.query.source)
        : null;
    const savedSource = normalizeCareerUtmSource(
      localStorage.getItem(CAREER_UTM_SOURCE_STORAGE_KEY)
    );
    const resolvedSource =
      querySource ?? savedSource ?? CAREER_UTM_DEFAULT_SOURCE;
    localStorage.setItem(CAREER_UTM_SOURCE_STORAGE_KEY, resolvedSource);

    const savedId = localStorage.getItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY);
    const resolvedLandingId = savedId || createCareerLandingId();

    if (!savedId) {
      localStorage.setItem(
        CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
        resolvedLandingId
      );
    }

    queueMicrotask(() => setLandingId(resolvedLandingId));
  }, [router.query.source]);

  const handleCareerStartClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      void router.push(careerStartHref);
    },
    [careerStartHref, router]
  );

  return { careerStartHref, handleCareerStartClick };
}
