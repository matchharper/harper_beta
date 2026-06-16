import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useCareerMessageFormatter } from "@/i18n/useCareerMessageFormatter";
import { CAREER_HOOK_MESSAGES as H } from "./careerHookMessages";

export type FetchWithAuth = (
  url: string,
  init?: RequestInit
) => Promise<Response>;

export const useCareerApi = () => {
  const tCareer = useCareerMessageFormatter();
  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const fetchWithAuth = useCallback<FetchWithAuth>(
    async (url, init) => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error(tCareer(H.loginSessionMissing));
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      const incomingHeaders = init?.headers as
        | Record<string, string>
        | undefined;
      if (incomingHeaders) {
        Object.assign(headers, incomingHeaders);
      }
      if (
        init?.body &&
        !headers["Content-Type"] &&
        !(typeof FormData !== "undefined" && init.body instanceof FormData)
      ) {
        headers["Content-Type"] = "application/json";
      }

      return fetch(url, {
        ...init,
        headers,
      });
    },
    [getAccessToken, tCareer]
  );

  return {
    fetchWithAuth,
  };
};
