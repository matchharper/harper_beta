import { useCallback, useState } from "react";
import type { SessionResponse } from "@/components/career/types";
import { getErrorMessage } from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";

type SessionPayload = SessionResponse & { error?: string };

type UseCareerSessionArgs = {
  fetchWithAuth: FetchWithAuth;
  inviteToken?: string | null;
  mail?: string | null;
};

export const useCareerSession = ({
  fetchWithAuth,
  inviteToken,
  mail,
}: UseCareerSessionArgs) => {
  const [sessionPending, setSessionPending] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initialMessagePage, setInitialMessagePage] = useState<
    Pick<SessionResponse, "messages" | "nextBeforeMessageId"> | null
  >(null);

  const loadSession = useCallback(async () => {
    setSessionPending(true);
    setSessionError("");
    try {
      const bootstrapRes = await fetchWithAuth("/api/talent/auth/bootstrap", {
        method: "POST",
        body: JSON.stringify({
          inviteToken: inviteToken?.trim() || undefined,
          mail: mail?.trim() || undefined,
        }),
      });
      if (!bootstrapRes.ok) {
        const payload = await bootstrapRes.json().catch(() => ({}));
        throw new Error(
          getErrorMessage(payload, "talent_users 초기화에 실패했습니다.")
        );
      }

      const sessionRes = await fetchWithAuth(
        "/api/talent/session?messageLimit=20&allowReengagement=1"
      );
      const payload = (await sessionRes
        .json()
        .catch(() => ({}))) as SessionPayload;
      if (!sessionRes.ok) {
        throw new Error(getErrorMessage(payload, "세션을 불러오지 못했습니다."));
      }

      setConversationId(payload.conversation.id);
      setInitialMessagePage({
        messages: Array.isArray(payload.messages) ? payload.messages : [],
        nextBeforeMessageId:
          typeof payload.nextBeforeMessageId === "number"
            ? payload.nextBeforeMessageId
            : null,
      });
      return payload;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "세션을 불러오지 못했습니다.";
      setSessionError(message);
      return null;
    } finally {
      setSessionPending(false);
    }
  }, [fetchWithAuth, inviteToken, mail]);

  const resetSessionState = useCallback(() => {
    setConversationId(null);
    setInitialMessagePage(null);
    setSessionPending(false);
    setSessionError("");
  }, []);

  return {
    conversationId,
    initialMessagePage,
    sessionPending,
    sessionError,
    loadSession,
    resetSessionState,
  };
};
