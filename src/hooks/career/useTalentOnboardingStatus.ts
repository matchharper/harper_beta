import { useEffect } from "react";
import { useRouter } from "next/router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { CAREER_EMAIL_ONBOARDING_TOKEN_PARAM } from "@/lib/careerEmailOnboarding/constants";
import { normalizeCareerUtmSource } from "@/lib/career/utm";
import {
  OFFICIAL_JOBS_ONBOARDING_COMPANY_PARAM,
  OFFICIAL_JOBS_ONBOARDING_JOB_PARAM,
  OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM,
} from "@/lib/officialJobs";

type OnboardingStatus = {
  needsOnboarding: boolean;
};

const getSingleQueryParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

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
  const officialJobTitle =
    getSingleQueryParam(
      router.query[OFFICIAL_JOBS_ONBOARDING_JOB_PARAM]
    )?.trim() || "";
  const officialJobCompanyName =
    getSingleQueryParam(
      router.query[OFFICIAL_JOBS_ONBOARDING_COMPANY_PARAM]
    )?.trim() || "";
  const officialJobSlug =
    getSingleQueryParam(
      router.query[OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM]
    )?.trim() || "";
  const startQuery = getSingleQueryParam(router.query.start);
  const localId = getSingleQueryParam(router.query.lid)?.trim() || "";
  const source = normalizeCareerUtmSource(
    getSingleQueryParam(router.query.source)
  );

  useEffect(() => {
    if (!needsOnboarding) return;

    const query: Record<string, string> = {};
    if (inviteToken) query.invite = inviteToken;
    if (mail) query.mail = mail;
    if (emailOnboardingToken) {
      query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM] = emailOnboardingToken;
    }
    if (startQuery === "call" || startQuery === "chat") {
      query.start = startQuery;
    }
    if (localId) {
      query.lid = localId;
    }
    if (source) query.source = source;
    if (officialJobCompanyName) {
      query[OFFICIAL_JOBS_ONBOARDING_COMPANY_PARAM] = officialJobCompanyName;
    }
    if (officialJobTitle) {
      query[OFFICIAL_JOBS_ONBOARDING_JOB_PARAM] = officialJobTitle;
    }
    if (officialJobSlug) {
      query[OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM] = officialJobSlug;
    }

    void router.replace({
      pathname: "/career/onboarding",
      query: Object.keys(query).length > 0 ? query : undefined,
    });
  }, [
    emailOnboardingToken,
    inviteToken,
    localId,
    mail,
    needsOnboarding,
    officialJobCompanyName,
    officialJobSlug,
    officialJobTitle,
    router,
    source,
    startQuery,
  ]);

  return {
    isOnboardingStatusReady:
      statusQuery.isSuccess && statusQuery.isFetchedAfterMount,
    needsOnboarding,
  };
}
