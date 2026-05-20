import { supabase } from "@/lib/supabase";

type PostLogEventOptions = {
  accessToken?: string | null;
};

export async function postLogEvent(
  type: string,
  options: PostLogEventOptions = {}
) {
  const trimmedType = String(type ?? "").trim();
  if (!trimmedType) return false;

  try {
    let accessToken = options.accessToken ?? null;

    if (!accessToken) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      accessToken = session?.access_token ?? null;
    }

    if (!accessToken) {
      return false;
    }

    const response = await fetch("/api/logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ type: trimmedType }),
      keepalive: true,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 204) return false;

      const message = await response.text().catch(() => "");
      console.warn("postLogEvent failed:", response.status, message);
      return false;
    }

    return true;
  } catch (error) {
    console.warn("postLogEvent failed:", error);
    return false;
  }
}
