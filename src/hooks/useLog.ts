import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";

// hooks/useLogEvent.ts
export function useLogEvent() {
  const { companyUser } = useCompanyUserStore();
  const { user, session } = useAuthStore();

  return async (type: string) => {
    const trimmedType = String(type ?? "").trim();
    if (!trimmedType) return;

    try {
      let accessToken = session?.access_token;
      let sessionUserId = session?.user?.id;
      if (!accessToken) {
        const {
          data: { session: latestSession },
        } = await supabase.auth.getSession();
        accessToken = latestSession?.access_token;
        sessionUserId = latestSession?.user?.id;
      }

      if (!accessToken) {
        console.error("logEvent failed: missing access token");
        return;
      }

      const userId = companyUser?.user_id ?? user?.id ?? sessionUserId;
      if (!userId) {
        console.error("logEvent failed: missing user id");
        return;
      }

      const response = await fetch("/api/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ type: trimmedType, userId }),
        keepalive: true,
      });

      if (!response.ok) {
        const message = await response.text().catch(() => "");
        console.error("logEvent failed:", response.status, message);
      }
    } catch (error) {
      console.error("logEvent failed:", error);
    }
  };
}
