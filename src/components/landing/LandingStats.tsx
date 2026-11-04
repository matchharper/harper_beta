import { useQuery } from "@tanstack/react-query";
import type { Locale } from "@/i18n/useMessage";
import {
  COMPANY_LANDING_STATS_CACHE_SECONDS,
  type CompanyLandingStats,
} from "@/lib/companyLandingStats";
import { cn } from "@/lib/utils";

export function LandingStats({
  locale,
  className,
  align = "start",
}: {
  locale: Locale;
  className?: string;
  align?: "start" | "center";
}) {
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const { data: stats } = useQuery<CompanyLandingStats>({
    queryKey: ["company-landing-stats", "daily-snapshot-v1"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/company/landing-stats", { signal });
      if (!response.ok) throw new Error("Could not load statistics");
      return response.json();
    },
    staleTime: COMPANY_LANDING_STATS_CACHE_SECONDS * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const formatStat = (value: number | null | undefined, unit: string) =>
    value == null ? "—" : `${value.toLocaleString(locale)}${unit}`;
  return (
    <div
      data-landing-stats
      className={cn("md:grid md:grid-cols-3 md:gap-6", className)}
    >
      {[
        {
          label: c(
            "Harper와 직접 이야기 나눈 인재",
            "Candidates who’ve spoken with Harper"
          ),
          value: formatStat(stats?.talentCount, c("명", " people")),
        },
        {
          label: c(
            "한 명과 주고받은 평균 메시지",
            "Average messages per candidate"
          ),
          value: formatStat(
            stats?.averageConversationMessages,
            c("개", " messages")
          ),
        },
        {
          label: c("인재와 포지션을 맞춰본 횟수", "Candidate–role matches assessed"),
          value: formatStat(stats?.assessedPairCount, c("건", "")),
        },
      ].map(({ label, value }) => (
        <div
          key={label}
          className={cn(
            "py-4 md:block md:p-0",
            align === "center"
              ? "text-center"
              : "flex items-baseline justify-between gap-[18px]"
          )}
        >
          <span
            className="block text-2xl leading-[1.2] font-medium whitespace-nowrap text-neutral-primary tabular-nums md:text-[27px]"
            aria-label={
              value === "—"
                ? c("집계 준비 중", "Statistics unavailable")
                : undefined
            }
          >
            {value}
          </span>
          <span
            className={cn(
              "block text-xs break-keep text-neutral-muted md:mt-2 md:text-[13px]",
              align === "center" ? "mt-2 text-center" : "text-right md:text-left"
            )}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
