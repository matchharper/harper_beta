import { useEffect } from "react";
import { useRouter } from "next/router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { CAREER_EMAIL_ONBOARDING_TOKEN_PARAM } from "@/lib/careerEmailOnboarding/constants";
import { normalizeCareerUtmSource } from "@/lib/career/utm";

type OnboardingStatus = {
  needsOnboarding: boolean;
};

export const talentOnboardingStatusQueryKey = (userId?: string | null) =>
  ["talentOnboardingStatus", userId?.trim() || "anonymous"] as const;

export function talentOnboardingStatusQueryOptions(
  fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response>,
  enabled: boolean,
  userId?: string | null
) {
  return queryOptions({
    queryKey: talentOnboardingStatusQueryKey(userId),
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
    refetchOnMount: "always",
    staleTime: 0,
  });
}

export function useTalentOnboardingStatus(
  enabled: boolean,
  userId?: string | null
) {
  const { fetchWithAuth } = useCareerApi();
  return useQuery(
    talentOnboardingStatusQueryOptions(fetchWithAuth, enabled, userId)
  );
}

export function useTalentOnboardingRedirect({
  emailOnboardingToken,
  enabled,
  inviteToken,
  mail,
  userId,
}: {
  emailOnboardingToken?: string | null;
  enabled: boolean;
  inviteToken: string | null;
  mail: string | null;
  userId?: string | null;
}) {
  const router = useRouter();
  const statusQuery = useTalentOnboardingStatus(enabled, userId);
  const needsOnboarding =
    statusQuery.isSuccess &&
    statusQuery.isFetchedAfterMount &&
    statusQuery.data?.needsOnboarding === true;

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
