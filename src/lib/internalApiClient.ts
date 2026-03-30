import { supabase } from "@/lib/supabase";

export async function getInternalAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

export async function fetchWithInternalAuth<T>(
  input: string,
  init?: RequestInit
) {
  const accessToken = await getInternalAccessToken();
  if (!accessToken) {
    throw new Error("로그인 세션을 찾지 못했습니다. 다시 로그인해 주세요.");
  }

  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "요청을 처리하지 못했습니다.");
  }

  return payload;
}
