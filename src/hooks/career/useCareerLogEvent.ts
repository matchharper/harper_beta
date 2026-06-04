import { useCallback } from "react";
import { useLogEvent } from "@/hooks/useLog";
import type { LogEventMetadata } from "@/lib/logEvent";

const CAREER_LOG_PREFIX = "career_";

export function useCareerLogEvent() {
  const logEvent = useLogEvent();

  return useCallback(
    (type: string, metadata?: LogEventMetadata) => {
      const trimmedType = String(type ?? "").trim();
      if (!trimmedType) return;

      const eventType = trimmedType.startsWith(CAREER_LOG_PREFIX)
        ? trimmedType
        : `${CAREER_LOG_PREFIX}${trimmedType}`;

      // Keep metadata minimal: store only stable IDs needed for analytics
      // (for example, companyId), never names, URLs, payloads, or full objects.
      void logEvent(eventType, metadata);
    },
    [logEvent]
  );
}
