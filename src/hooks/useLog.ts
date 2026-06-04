import { useAuthStore } from "@/store/useAuthStore";
import { postLogEvent, type LogEventMetadata } from "@/lib/logEvent";
import { useCallback } from "react";

// hooks/useLogEvent.ts
export function useLogEvent() {
  const { session } = useAuthStore();

  return useCallback(
    async (type: string, metadata?: LogEventMetadata) => {
      await postLogEvent(type, {
        accessToken: session?.access_token ?? null,
        metadata,
      });
    },
    [session?.access_token]
  );
}
