import { useCallback } from "react";
import {
  formatCareerMessage,
  formatCareerMessageByKey,
} from "@/i18n/careerMessage";
import { useMessages } from "@/i18n/useMessage";

export type CareerMessageParams = Record<string, string | number>;
export type CareerMessageDescriptor = {
  key: string;
  ko: string;
};
export type CareerMessageSource = string | CareerMessageDescriptor;

function isCareerHookMessage(
  source: CareerMessageSource
): source is CareerMessageDescriptor {
  return (
    typeof source === "object" &&
    source !== null &&
    typeof source.key === "string" &&
    typeof source.ko === "string"
  );
}

export function useCareerMessageFormatter() {
  const { m } = useMessages();

  return useCallback(
    (source: CareerMessageSource, params?: CareerMessageParams) =>
      isCareerHookMessage(source)
        ? formatCareerMessageByKey(m, source.key, source.ko, params)
        : formatCareerMessage(m, source, params),
    [m]
  );
}
