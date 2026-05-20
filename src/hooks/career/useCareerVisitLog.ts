import { useEffect, useRef } from "react";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";

const CAREER_APP_OPENED_EVENT = "app_opened";

export function useCareerVisitLog(enabled: boolean) {
  const loggedRef = useRef(false);
  const logCareerEvent = useCareerLogEvent();

  useEffect(() => {
    if (!enabled || loggedRef.current) return;

    loggedRef.current = true;
    logCareerEvent(CAREER_APP_OPENED_EVENT);
  }, [enabled, logCareerEvent]);
}
