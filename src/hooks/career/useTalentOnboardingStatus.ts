import { useEffect } from "react";
import { useRouter } from "next/router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { CAREER_EMAIL_ONBOARDING_TOKEN_PARAM } from "@/lib/careerEmailOnboarding/constants";
import { normalizeCareerUtmSource } from "@/lib/careerUtm";

type OnboardingStatus = {
  needsOnboarding: boolean;
};

export function talentOnboardingStatusQueryOptions(
  fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response>,
  enabled: boolean
) {
  return queryOptions({
    queryKey: ["talentOnboardingStatus"] as const,
    queryFn: async (): Promise<OnboardingStatus> => {
      const response = await fetchWithAuth("/api/talent/onboarding/status");
      if (!response.ok) {
        return { needsOnboarding: false };
      }
      const payload = (await response.json().catch(() => ({}))) as {
        needsOnboarding?: boolean;
      };
      return { needsOnboarding: payload.needsOnboarding === true };
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useTalentOnboardingStatus(enabled: boolean) {
  const { fetchWithAuth } = useCareerApi();
  return useQuery(talentOnboardingStatusQueryOptions(fetchWithAuth, enabled));
}

export function useTalentOnboardingRedirect({
  emailOnboardingToken,
  enabled,
  inviteToken,
  mail,
}: {
  emailOnboardingToken?: string | null;
  enabled: boolean;
  inviteToken: string | null;
  mail: string | null;
}) {
  const router = useRouter();
  const { data } = useTalentOnboardingStatus(enabled);
  const needsOnboarding = data?.needsOnboarding === true;

  useEffect(() => {
    if (!needsOnboarding) return;

    const query: Record<string, string> = {};
    if (inviteToken) query.invite = inviteToken;
    if (mail) query.mail = mail;
    if (emailOnboardingToken) {
      query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM] = emailOnboardingToken;
    }
    if (router.query.start === "call" || router.query.start === "chat") {
      query.start = router.query.start;
    }
    if (typeof router.query.lid === "string" && router.query.lid.trim()) {
      query.lid = router.query.lid.trim();
    }
    if (typeof router.query.source === "string") {
      const source = normalizeCareerUtmSource(router.query.source);
      if (source) query.source = source;
    }

    void router.replace({
      pathname: "/career/onboarding",
      query: Object.keys(query).length > 0 ? query : undefined,
    });
  }, [
    emailOnboardingToken,
    inviteToken,
    mail,
    needsOnboarding,
    router,
    router.query.lid,
    router.query.start,
    router.query.source,
  ]);
}
