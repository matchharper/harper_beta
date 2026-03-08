import { useCallback } from "react";
import { supabase } from "@/lib/supabase";

export type FetchWithAuth = (url: string, init?: RequestInit) => Promise<Response>;

export const useCareerApi = () => {
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
        throw new Error("로그인 세션을 확인할 수 없습니다. 다시 로그인해 주세요.");
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      const incomingHeaders = init?.headers as Record<string, string> | undefined;
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
    [getAccessToken]
  );

  return {
    fetchWithAuth,
  };
};
