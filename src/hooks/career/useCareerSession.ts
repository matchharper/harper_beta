import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SessionResponse } from "@/components/career/types";
import { getErrorMessage } from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";
import { getCareerSignupAttributionPayload } from "@/lib/career/signupAttribution";
import { useCareerMessageFormatter } from "@/i18n/useCareerMessageFormatter";
import { getInitialClientLocalePreference } from "@/i18n/useMessage";
import { CAREER_HOOK_MESSAGES as H } from "./careerHookMessages";

type SessionPayload = SessionResponse & { error?: string };
type LoadSessionOptions = {
  force?: boolean;
};

type UseCareerSessionArgs = {
  emailOnboardingToken?: string | null;
  enabled: boolean;
  fetchWithAuth: FetchWithAuth;
  inviteToken?: string | null;
  locale: string;
  mail?: string | null;
  userId: string | null;
};

const CAREER_SESSION_GC_TIME = 30 * 60_000;
const CAREER_SESSION_MAX_RETRIES = 2;

const shouldRetryCareerSession = (failureCount: number, error: unknown) => {
  if (failureCount >= CAREER_SESSION_MAX_RETRIES) return false;

  const message = error instanceof Error ? error.message : String(error ?? "");
  return !(
    /Unauthorized|login session/i.test(message) ||
    message.includes(H.loginSessionMissing.ko)
  );
};

export const careerSessionKey = (
  userId: string | null,
  locale?: string | null,
  inviteToken?: string | null,
  mail?: string | null,
  emailOnboardingToken?: string | null
) =>
  [
    "career-session",
    userId,
    locale?.trim() || null,
    inviteToken?.trim() || null,
    mail?.trim() || null,
    emailOnboardingToken?.trim() || null,
  ] as const;

export const useCareerSession = ({
  emailOnboardingToken,
  enabled,
  fetchWithAuth,
  inviteToken,
  locale,
  mail,
  userId,
}: UseCareerSessionArgs) => {
  const tCareer = useCareerMessageFormatter();
  const queryClient = useQueryClient();
  const normalizedInviteToken = inviteToken?.trim() || null;
  const normalizedMail = mail?.trim() || null;
  const normalizedEmailOnboardingToken = emailOnboardingToken?.trim() || null;
  const requestLocale = useMemo(
    () =>
      typeof window === "undefined" ? locale : getInitialClientLocalePreference(),
    [locale]
  );
  const queryKey = useMemo(
    () =>
      careerSessionKey(
        userId,
        requestLocale,
        normalizedInviteToken,
        normalizedMail,
        normalizedEmailOnboardingToken
      ),
    [
      normalizedEmailOnboardingToken,
      normalizedInviteToken,
      normalizedMail,
      requestLocale,
      userId,
    ]
  );

  const fetchSession = useCallback(async () => {
    const bootstrapRes = await fetchWithAuth("/api/talent/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        ...getCareerSignupAttributionPayload(),
        emailOnboardingToken: normalizedEmailOnboardingToken || undefined,
        inviteToken: normalizedInviteToken || undefined,
        locale: requestLocale,
        mail: normalizedMail || undefined,
      }),
    });
    if (!bootstrapRes.ok) {
      const payload = await bootstrapRes.json().catch(() => ({}));
      throw new Error(
        getErrorMessage(payload, tCareer(H.sessionBootstrapFailed))
      );
    }

    const sessionParams = new URLSearchParams({
      locale: requestLocale,
      messageLimit: "20",
      opportunityLimit: "20",
    });
    const sessionRes = await fetchWithAuth(
      `/api/talent/session?${sessionParams.toString()}`
    );
    const payload = (await sessionRes
      .json()
      .catch(() => ({}))) as SessionPayload;
    if (!sessionRes.ok) {
      throw new Error(getErrorMessage(payload, tCareer(H.sessionLoadFailed)));
    }

    return payload;
  }, [
    fetchWithAuth,
    normalizedEmailOnboardingToken,
    normalizedInviteToken,
    normalizedMail,
    requestLocale,
    tCareer,
  ]);

  const sessionQuery = useQuery({
    queryKey,
    enabled: enabled && Boolean(userId),
    queryFn: fetchSession,
    gcTime: CAREER_SESSION_GC_TIME,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: shouldRetryCareerSession,
    retryDelay: (attemptIndex) => Math.min(1000 * (attemptIndex + 1), 2500),
    staleTime: Infinity,
  });

  const loadSession = useCallback(
    async (options?: LoadSessionOptions) => {
      if (!enabled || !userId) return null;

      try {
        if (options?.force) {
          return await queryClient.fetchQuery({
            queryKey,
            queryFn: fetchSession,
            gcTime: CAREER_SESSION_GC_TIME,
            staleTime: 0,
          });
        }

        return await queryClient.ensureQueryData({
          queryKey,
          queryFn: fetchSession,
          gcTime: CAREER_SESSION_GC_TIME,
          staleTime: Infinity,
        });
      } catch {
        return null;
      }
    },
    [enabled, fetchSession, queryClient, queryKey, userId]
  );

  const initialMessagePage = useMemo(() => {
    const payload = sessionQuery.data;
    if (!payload) return null;

    return {
      messages: Array.isArray(payload.messages) ? payload.messages : [],
      nextBeforeMessageId:
        typeof payload.nextBeforeMessageId === "number"
          ? payload.nextBeforeMessageId
          : null,
    };
  }, [sessionQuery.data]);

  const resetSessionState = useCallback(() => {
    queryClient.removeQueries({ queryKey: ["career-session"] });
  }, [queryClient]);

  const sessionError = sessionQuery.error
    ? sessionQuery.error instanceof Error
      ? sessionQuery.error.message
      : tCareer(H.sessionLoadFailed)
    : "";

  return {
    conversationId: sessionQuery.data?.conversation.id ?? null,
    initialMessagePage,
    sessionData: sessionQuery.data ?? null,
    sessionPending: sessionQuery.isPending && !sessionQuery.data,
    sessionError,
    loadSession,
    resetSessionState,
  };
};
