import AdminAccessGuard from "@/components/admin/AdminAccessGuard";
import AdminMetricsNavigation from "@/components/admin/AdminMetricsNavigation";
import AdminCareerDateRangeFilter from "@/components/admin/career/AdminCareerDateRangeFilter";
import { useAdminMetricsStore } from "@/components/admin/metrics/useAdminMetricsStore";
import { ADMIN_PAGE_PASSWORD } from "@/lib/admin";
import { useQuery } from "@tanstack/react-query";
import Head from "next/head";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

type TopFunnelDateRangeInput = {
  endDate: string;
  startDate: string;
};

type TopFunnelStep = {
  count: number;
  detail: string;
  key: string;
  label: string;
  rateFromEntry: number | null;
  rateFromPrevious: number | null;
};

type TopFunnelResponse = {
  dateRange: TopFunnelDateRangeInput;
  excludedEmailCount: number;
  generatedAt: string;
  steps: TopFunnelStep[];
};

const toDateOnly = (date: Date | undefined) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const defaultDraftDateRange = (): DateRange => {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
  return {
    from: start,
    to: end,
  };
};

const dateRangeFromDraft = (
  value: DateRange | undefined
): TopFunnelDateRangeInput => ({
  endDate: toDateOnly(value?.to ?? value?.from),
  startDate: toDateOnly(value?.from),
});

const formatPercent = (value: number | null) => {
  if (value === null) return "-";
  return `${Math.round(value * 1000) / 10}%`;
};

const careerTabs = [
  {
    active: false,
    href: "/admin/career?tab=overview",
    label: "Overview",
  },
  {
    active: false,
    href: "/admin/career?tab=activity",
    label: "Users & Activity",
  },
  {
    active: false,
    href: "/admin/career?tab=utm",
    label: "UTM",
  },
  {
    active: false,
    href: "/admin/career?tab=jobs",
    label: "Jobs",
  },
  {
    active: false,
    href: "/admin/career?tab=company",
    label: "Company",
  },
  {
    active: true,
    href: "/admin/career/top_funnel",
    label: "Top Funnel",
  },
];

async function fetchTopFunnel(
  excludedEmails: string[],
  dateRange: TopFunnelDateRangeInput
) {
  const response = await fetch("/api/admin/career/top_funnel", {
    body: JSON.stringify({ dateRange, excludedEmails }),
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": ADMIN_PAGE_PASSWORD,
    },
    method: "POST",
  });
  const payload = (await response.json().catch(() => ({}))) as
    | TopFunnelResponse
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "top funnel을 불러오지 못했습니다."
    );
  }

  return payload as TopFunnelResponse;
}

function AdminCareerTopFunnelContent() {
  const { excludedEmails } = useAdminMetricsStore();
  const [draftDateRange, setDraftDateRange] = useState<DateRange | undefined>(
    defaultDraftDateRange
  );
  const [appliedRange, setAppliedRange] = useState<TopFunnelDateRangeInput>(
    () => dateRangeFromDraft(defaultDraftDateRange())
  );

  const query = useQuery({
    queryKey: [
      "admin-career-top-funnel",
      excludedEmails,
      appliedRange.startDate,
      appliedRange.endDate,
    ],
    queryFn: () => fetchTopFunnel(excludedEmails, appliedRange),
    placeholderData: (previousData) => previousData,
  });

  const applyDateRange = () => {
    setAppliedRange(dateRangeFromDraft(draftDateRange));
  };

  const resetDateRange = () => {
    const nextDateRange = defaultDraftDateRange();
    setDraftDateRange(nextDateRange);
    setAppliedRange(dateRangeFromDraft(nextDateRange));
  };

  return (
    <>
      <Head>
        <title>Career Top Funnel | Harper Admin</title>
      </Head>
      <main className="min-h-svh bg-white text-black">
        <AdminMetricsNavigation
          activeSection="career"
          title="Career Top Funnel"
          subtitle="career 진입 -> 로그인 클릭 -> 가입 -> 제출 -> 온보딩 완료 흐름입니다."
          tabs={careerTabs}
        />

        <div className="mx-auto max-w-[1180px] px-4 py-5 md:px-6">
          <AdminCareerDateRangeFilter
            appliedEndDate={appliedRange.endDate}
            appliedStartDate={appliedRange.startDate}
            isFetching={query.isFetching}
            onApply={applyDateRange}
            onChange={setDraftDateRange}
            onReset={resetDateRange}
            title="Top funnel 기간"
            value={draftDateRange}
          />

          {query.error ? (
            <div className="mt-4 border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">
              {query.error instanceof Error
                ? query.error.message
                : "데이터를 불러오지 못했습니다."}
            </div>
          ) : null}

          <section className="mt-4 overflow-hidden border border-black/10">
            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
              <div className="text-[13px] font-semibold">
                {query.data?.dateRange.startDate ?? appliedRange.startDate} ~{" "}
                {query.data?.dateRange.endDate ?? appliedRange.endDate}
              </div>
              <div className="text-[12px] text-black/45">
                {query.isFetching
                  ? "loading"
                  : `excluded ${query.data?.excludedEmailCount ?? excludedEmails.length}`}
              </div>
            </div>

            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="bg-black/[0.03] text-[11px] uppercase tracking-[0.12em] text-black/45">
                <tr>
                  <th className="px-4 py-3 font-medium">Step</th>
                  <th className="px-4 py-3 text-right font-medium">Count</th>
                  <th className="px-4 py-3 text-right font-medium">
                    From prev
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    From entry
                  </th>
                </tr>
              </thead>
              <tbody>
                {query.data?.steps.map((step) => (
                  <tr key={step.key} className="border-t border-black/10">
                    <td className="px-4 py-4">
                      <div className="font-medium text-black">{step.label}</div>
                      <div className="mt-1 text-[11px] text-black/40">
                        {step.detail}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-[15px]">
                      {step.count.toLocaleString("ko-KR")}
                    </td>
                    <td className="px-4 py-4 text-right font-mono">
                      {formatPercent(step.rateFromPrevious)}
                    </td>
                    <td className="px-4 py-4 text-right font-mono">
                      {formatPercent(step.rateFromEntry)}
                    </td>
                  </tr>
                ))}

                {!query.data?.steps.length ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-[13px] text-black/45"
                    >
                      {query.isLoading ? "불러오는 중입니다." : "데이터 없음"}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          {query.data?.generatedAt ? (
            <div className="mt-3 text-[11px] text-black/40">
              Generated{" "}
              {new Date(query.data.generatedAt).toLocaleString("ko-KR")}
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}

const AdminCareerTopFunnelPage = () => (
  <AdminAccessGuard>{() => <AdminCareerTopFunnelContent />}</AdminAccessGuard>
);

export default AdminCareerTopFunnelPage;
