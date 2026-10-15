import { useMemo } from "react";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  billingErrorCopy,
  formatBillingDaysUntil,
  formatBillingMoney,
  formatIntroCount,
  type BillingErrorCode,
} from "@/lib/org/billing/types";

// Shared server/Slack formatters keep explicit locales; Org UI binds it here.
export function useOrgBillingFormat() {
  const { locale } = useOrgLocale();
  return useMemo(() => {
    const language = locale === "ko" ? "ko-KR" : "en-US";
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
    };
    const day = new Intl.DateTimeFormat(language, options);
    const timestamp = new Intl.DateTimeFormat(language, {
      ...options,
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
    return {
      date: (value: string | null, time = false) =>
        value ? (time ? timestamp : day).format(new Date(value)) : "—",
      formatBillingMoney: (
        amount: number,
        currency: string,
        display?: Parameters<typeof formatBillingMoney>[3]
      ) => formatBillingMoney(amount, currency, locale, display),
      formatBillingDaysUntil: (
        value: string | null | undefined,
        now?: number
      ) => formatBillingDaysUntil(value, locale, now),
      formatIntroCount: (count: number | null | undefined) =>
        formatIntroCount(count, locale),
      billingErrorCopy: (code: BillingErrorCode) =>
        billingErrorCopy(code, locale),
    };
  }, [locale]);
}
