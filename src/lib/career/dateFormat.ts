import type { Locale } from "@/i18n/useMessage";

const CAREER_DATE_FORMATTERS: Record<Locale, Intl.DateTimeFormat> = {
  ko: new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }),
  en: new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }),
};

export const formatCareerDate = (
  value: string | Date | null | undefined,
  locale: Locale
) => {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return CAREER_DATE_FORMATTERS[locale].format(date);
};
