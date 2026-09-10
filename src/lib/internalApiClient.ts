import { supabase } from "@/lib/supabase";

export async function getInternalAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

export async function refreshInternalAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.refreshSession();

  return session?.access_token ?? null;
}

export async function fetchWithInternalAuth<T>(
  input: string,
  init?: RequestInit
) {
  let accessToken = await getInternalAccessToken();
  if (!accessToken) {
    accessToken = await refreshInternalAccessToken();
  }

  if (!accessToken) {
    throw new Error("로그인 세션을 찾지 못했습니다. 다시 로그인해 주세요.");
  }

  const fetchWithToken = (token: string) =>
    fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });

  let response = await fetchWithToken(accessToken);
  if (response.status === 401) {
    const refreshedAccessToken = await refreshInternalAccessToken();
    if (refreshedAccessToken && refreshedAccessToken !== accessToken) {
      response = await fetchWithToken(refreshedAccessToken);
    }
  }

  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "요청을 처리하지 못했습니다.");
  }

  return payload;
}

export async function fetchWithOpsUtmAccess<T>(
  input: string,
  init?: RequestInit
) {
  const fetchRequest = (accessToken?: string | null) =>
    fetch(input, {
      ...init,
      credentials: "same-origin",
      headers: {
        ...(init?.headers ?? {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

  let accessToken = await getInternalAccessToken();
  let response = await fetchRequest(accessToken);
  if (response.status === 401) {
    const refreshedAccessToken = await refreshInternalAccessToken();
    if (refreshedAccessToken && refreshedAccessToken !== accessToken) {
      accessToken = refreshedAccessToken;
      response = await fetchRequest(accessToken);
    }
  }

  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "요청을 처리하지 못했습니다.");
  }

  return payload;
}
