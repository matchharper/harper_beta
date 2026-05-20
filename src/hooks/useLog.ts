import { useAuthStore } from "@/store/useAuthStore";
import { postLogEvent } from "@/lib/logEvent";
import { useCallback } from "react";

// hooks/useLogEvent.ts
export function useLogEvent() {
  const { session } = useAuthStore();

  return useCallback(
    async (type: string) => {
      await postLogEvent(type, { accessToken: session?.access_token ?? null });
    },
    [session?.access_token]
  );
}
