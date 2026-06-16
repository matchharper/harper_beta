"use client";

import { useCallback } from "react";
import { ko } from "@/lang/ko";
import { useMessages } from "@/i18n/useMessage";

type CareerTValues = Record<string, string | number | null | undefined>;

export type CareerTOptions = {
  /**
   * Temporary sync hint. `pnpm translation:sync` uses this to regenerate
   * non-Korean values, then removes the flag from source code.
   */
  meaningChanged?: boolean;
  /**
   * Alias for meaningChanged, kept for readability in short-lived edits.
   */
  retranslate?: boolean;
  values?: CareerTValues;
};

function interpolate(value: string, params: CareerTValues | undefined) {
  if (!params) return value;
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) return match;
    const nextValue = params[name];
    return nextValue === null || nextValue === undefined
      ? ""
      : String(nextValue);
  });
}

export function useCareerT() {
  const { locale, m } = useMessages();

  return useCallback(
    (key: string, koSource: string, options?: CareerTOptions) => {
      const translated = m.career?.[key];

      if (locale === "ko") {
        const baseKo = ((ko.career ?? {}) as Record<string, string>)[key];
        const runtimeOverride =
          typeof translated === "string" &&
          translated.length > 0 &&
          translated !== baseKo;

        return interpolate(
          runtimeOverride ? translated : koSource,
          options?.values
        );
      }

      return interpolate(
        typeof translated === "string" && translated.length > 0
          ? translated
          : koSource,
        options?.values
      );
    },
    [locale, m]
  );
}
