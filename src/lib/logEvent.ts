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
      console.error("postLogEvent failed: missing access token");
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
      const message = await response.text().catch(() => "");
      console.error("postLogEvent failed:", response.status, message);
      return false;
    }

    return true;
  } catch (error) {
    console.error("postLogEvent failed:", error);
    return false;
  }
}
