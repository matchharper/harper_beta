import { supabase } from "@/lib/supabase";

export type LogEventMetadata = Record<string, string | number | boolean | null>;

type PostLogEventOptions = {
  accessToken?: string | null;
  metadata?: LogEventMetadata;
};

function getIsMobileViewport() {
  if (typeof window === "undefined") return undefined;
  return window.innerWidth <= 600;
}

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
      body: JSON.stringify({
        isMobile: getIsMobileViewport(),
        type: trimmedType,
        ...(options.metadata ? { metadata: options.metadata } : {}),
      }),
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
