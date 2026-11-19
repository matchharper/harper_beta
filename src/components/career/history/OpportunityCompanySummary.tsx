import { useQuery } from "@tanstack/react-query";
import RichText from "@/components/ui/rich-text";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useMessages } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";
import type { CareerHistoryOpportunity } from "../types";

type CompanySummary = { markdown: string; checkedAt: string | null };

const formatCheckedDate = (value: string | null, locale: string) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

/**
 * The company's shared research overview with its sources. The company
 * description stays as the fallback until an overview exists.
 */
const OpportunityCompanySummary = ({
  item,
  fallbackClassName,
}: {
  item: CareerHistoryOpportunity;
  fallbackClassName?: string;
}) => {
  const t = useCareerT();
  const { locale } = useMessages();
  const { fetchWithAuth } = useCareerApi();
  const kind = item.targetKind === "company" ? "company_workspace" : "role";
  const summaryQuery = useQuery({
    queryKey: ["career-company-summary", kind, item.roleId],
    enabled: Boolean(item.roleId),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams({ kind, id: item.roleId });
      const response = await fetchWithAuth(
        `/api/talent/company-summary?${params.toString()}`
      );
      if (!response.ok) return null;
      const payload = (await response.json()) as { summary?: CompanySummary | null };
      return payload.summary ?? null;
    },
  });
  const summary = summaryQuery.data;

  if (summary?.markdown.trim()) {
    const checkedDate = formatCheckedDate(summary.checkedAt, locale);
    return (
      <div className="min-w-0">
        {checkedDate ? (
          <div className="mb-3 inline-flex rounded-full bg-bg-weak px-2.5 py-1 text-[12px] font-medium leading-none text-neutral-muted">
            {t("career.company.snapshot.investigation_date", "조사일")}{" "}
            {checkedDate}
          </div>
        ) : null}
        <RichText
          variant="career"
          content={summary.markdown}
          referenceLinks
          className="max-w-full text-neutral-primary/85 [overflow-wrap:anywhere] [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto"
        />
      </div>
    );
  }

  if (summaryQuery.isLoading) {
    return <div className="h-5 w-2/3 animate-pulse rounded bg-bg-weak" />;
  }

  return item.companyDescription?.trim() ? (
    <RichText variant="career" content={item.companyDescription} />
  ) : (
    <p className={fallbackClassName ?? "text-sm text-neutral-muted"}>
      {t("career.common.career.083cky2", "아직 회사 설명이 없습니다.")}
    </p>
  );
};

export default OpportunityCompanySummary;
