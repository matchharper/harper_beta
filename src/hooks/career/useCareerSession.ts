import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SessionResponse } from "@/components/career/types";
import { getErrorMessage } from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";

type SessionPayload = SessionResponse & { error?: string };
type LoadSessionOptions = {
  force?: boolean;
};

type UseCareerSessionArgs = {
  enabled: boolean;
  fetchWithAuth: FetchWithAuth;
  inviteToken?: string | null;
  mail?: string | null;
  userId: string | null;
};

const CAREER_SESSION_GC_TIME = 30 * 60_000;

export const careerSessionKey = (
  userId: string | null,
  inviteToken?: string | null,
  mail?: string | null
) =>
  [
    "career-session",
    userId,
    inviteToken?.trim() || null,
    mail?.trim() || null,
  ] as const;

export const useCareerSession = ({
  enabled,
  fetchWithAuth,
  inviteToken,
  mail,
  userId,
}: UseCareerSessionArgs) => {
  const queryClient = useQueryClient();
  const normalizedInviteToken = inviteToken?.trim() || null;
  const normalizedMail = mail?.trim() || null;
  const queryKey = useMemo(
    () => careerSessionKey(userId, normalizedInviteToken, normalizedMail),
    [normalizedInviteToken, normalizedMail, userId]
  );

  const fetchSession = useCallback(async () => {
    const bootstrapRes = await fetchWithAuth("/api/talent/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        inviteToken: normalizedInviteToken || undefined,
        mail: normalizedMail || undefined,
      }),
    });
    if (!bootstrapRes.ok) {
      const payload = await bootstrapRes.json().catch(() => ({}));
      throw new Error(
        getErrorMessage(payload, "talent_users 초기화에 실패했습니다.")
      );
    }

    const sessionParams = new URLSearchParams({
      allowReengagement: "1",
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
      throw new Error(getErrorMessage(payload, "세션을 불러오지 못했습니다."));
    }

    return payload;
  }, [fetchWithAuth, normalizedInviteToken, normalizedMail]);

  const sessionQuery = useQuery({
    queryKey,
    enabled: enabled && Boolean(userId),
    queryFn: fetchSession,
    gcTime: CAREER_SESSION_GC_TIME,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
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
      : "세션을 불러오지 못했습니다."
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
