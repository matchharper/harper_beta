import type { ReactNode } from "react";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { formatCareerLocation } from "@/lib/career/locationDisplay";
import {
  getReliableHeadcount,
  smoothHeadcountMonths,
  type CompanyProfile,
} from "@/lib/career/companyProfileTypes";
import { cn } from "@/lib/utils";
import { formatEmployeeCountRange } from "../watchlist/watchlistFormatters";
import { HeadcountSparkline, formatMonthLabel } from "./CompanyProfileCharts";

export type CompanyBasics = {
  employeeCountRange?: unknown;
  foundedYear?: number | null;
  location?: string | null;
};

type Fact = {
  aside?: ReactNode;
  key: string;
  label: string;
  sub?: ReactNode;
  value: string;
};

export function formatSignedPercent(rate: number) {
  const percent = Math.round(rate * 100);
  return `${percent > 0 ? "+" : percent < 0 ? "−" : ""}${Math.abs(percent)}%`;
}

/**
 * 인원 · 최근 투자 · 채용 중 · 본사, shown the same way on an opportunity and
 * on the company page. A fact shows only when its data exists.
 */
export default function CompanyFactsGrid({
  basics,
  className,
  profile,
}: {
  basics: CompanyBasics;
  className?: string;
  profile: CompanyProfile | null | undefined;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const facts: Fact[] = [];

  const months = profile ? smoothHeadcountMonths(profile.headcount) : [];
  const headcount = getReliableHeadcount(months);
  if (headcount) {
    facts.push({
      key: "headcount",
      label: t("career.company.page.headcount", "인원"),
      value: t("career.company.page.people_count", "{count}명", {
        values: { count: headcount.current.toLocaleString() },
      }),
      sub:
        headcount.changeRate !== null
          ? headcount.monthCount >= 12
            ? t("career.company.page.headcount_yoy", "1년 전보다 {rate}", {
                values: { rate: formatSignedPercent(headcount.changeRate) },
              })
            : t(
                "career.company.page.headcount_change",
                "{months}개월 전보다 {rate}",
                {
                  values: {
                    months: headcount.monthCount - 1,
                    rate: formatSignedPercent(headcount.changeRate),
                  },
                }
              )
          : undefined,
      aside: <HeadcountSparkline months={months} />,
    });
  } else if (profile?.linkedin?.employeeCount) {
    facts.push({
      key: "headcount",
      label: t("career.company.page.headcount", "인원"),
      value: t("career.company.page.people_count", "{count}명", {
        values: { count: profile.linkedin.employeeCount.toLocaleString() },
      }),
      sub: t("career.company.page.headcount_linkedin", "LinkedIn 기준"),
    });
  } else {
    const range = formatEmployeeCountRange(
      basics.employeeCountRange,
      locale,
      t
    );
    if (range) {
      facts.push({
        key: "headcount",
        label: t("career.company.page.headcount", "인원"),
        value: range,
      });
    }
  }

  const funding = profile?.funding;
  const lastRound = funding?.lastRound;
  if (lastRound?.amount || lastRound?.stage || funding?.total) {
    const value = lastRound?.amount ?? lastRound?.stage ?? funding?.total ?? "";
    const sub = [
      lastRound?.amount ? lastRound.stage : null,
      lastRound?.date ? formatMonthLabel(lastRound.date, locale) : null,
      funding?.total && value !== funding.total
        ? t("career.company.page.funding_total_short", "누적 {total}", {
            values: { total: funding.total },
          })
        : null,
    ].filter(Boolean);
    facts.push({
      key: "funding",
      label: lastRound
        ? t("career.company.page.latest_funding", "최근 투자")
        : t("career.company.page.total_funding", "누적 투자"),
      value,
      sub: sub.length > 0 ? sub.join(", ") : undefined,
    });
  }

  if (profile && profile.hiring.active > 0) {
    facts.push({
      key: "hiring",
      label: t("career.company.page.hiring", "채용 중"),
      value: t("career.company.page.role_count", "{count}개", {
        values: { count: profile.hiring.active.toLocaleString() },
      }),
      sub:
        profile.hiring.recent > 0 ? (
          <span className="text-neutral-primary">
            {t("career.company.page.hiring_recent", "최근 2주 새 {count}개", {
              values: { count: profile.hiring.recent },
            })}
          </span>
        ) : undefined,
    });
  }

  const location = formatCareerLocation(basics.location ?? null, locale);
  if (location || basics.foundedYear) {
    facts.push({
      key: "hq",
      label: location
        ? t("career.company.headquarters", "본사")
        : t("career.company.company_detail_view.02ioip6", "설립 연도"),
      value:
        location ||
        t("career.company.page.founded_year", "{year}년", {
          values: { year: basics.foundedYear ?? "" },
        }),
      sub:
        location && basics.foundedYear
          ? t("career.company.page.founded", "{year}년 설립", {
              values: { year: basics.foundedYear },
            })
          : undefined,
    });
  }

  if (facts.length === 0) return null;

  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-6 gap-y-5",
        facts.length >= 4
          ? "sm:grid-cols-4"
          : facts.length === 3 && "sm:grid-cols-3",
        className
      )}
    >
      {facts.map((fact) => (
        <div key={fact.key} className="min-w-0">
          <dt className="text-[12.5px] text-neutral-muted">{fact.label}</dt>
          <dd className="mt-1 min-w-0">
            <div className="truncate text-[18px] font-semibold leading-tight tracking-[-0.02em] text-neutral-primary">
              {fact.value}
            </div>
            {fact.sub ? (
              <div className="mt-1 line-clamp-2 text-[12.5px] leading-[1.45] text-neutral-muted">
                {fact.sub}
              </div>
            ) : null}
            {fact.aside ? <div className="mt-1.5">{fact.aside}</div> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
