import { useCallback } from "react";
import { useLogEvent } from "@/hooks/useLog";

const CAREER_LOG_PREFIX = "career_";

export function useCareerLogEvent() {
  const logEvent = useLogEvent();

  return useCallback(
    (type: string) => {
      const trimmedType = String(type ?? "").trim();
      if (!trimmedType) return;

      const eventType = trimmedType.startsWith(CAREER_LOG_PREFIX)
        ? trimmedType
        : `${CAREER_LOG_PREFIX}${trimmedType}`;

      void logEvent(eventType);
    },
    [logEvent]
  );
}
