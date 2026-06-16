import { en } from "@/lang/en";
import { ko } from "@/lang/ko";
import { normalizeCareerPromptLocale } from "@/lib/career/promptLocale";

type CareerMessageParams = Record<string, string | number | null | undefined>;

function interpolate(value: string, params: CareerMessageParams | undefined) {
  if (!params) return value;
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) return match;
    const nextValue = params[name];
    return nextValue === null || nextValue === undefined
      ? ""
      : String(nextValue);
  });
}

export function getTranslatedCareerMessage({
  fallback,
  key,
  locale,
  params,
}: {
  fallback: string;
  key: string;
  locale?: string | null;
  params?: CareerMessageParams;
}) {
  const dictionary = normalizeCareerPromptLocale(locale) === "en" ? en : ko;
  const value = (dictionary.career as Record<string, string | undefined>)[key];
  const template = typeof value === "string" && value.trim() ? value : fallback;

  return interpolate(template, params);
}

export function careerT(
  locale: string | null | undefined,
  key: string,
  koSource: string,
  options?: { values?: CareerMessageParams }
) {
  return getTranslatedCareerMessage({
    fallback: koSource,
    key,
    locale,
    params: options?.values,
  });
}
