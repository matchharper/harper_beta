import { useCallback } from "react";
import { formatCareerMessage } from "@/i18n/careerMessage";
import { useMessages } from "@/i18n/useMessage";

export type CareerMessageParams = Record<string, string | number>;

export function useCareerMessageFormatter() {
  const { m } = useMessages();

  return useCallback(
    (koSource: string, params?: CareerMessageParams) =>
      formatCareerMessage(m, koSource, params),
    [m]
  );
}
