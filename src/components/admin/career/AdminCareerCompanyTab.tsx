import AdminCareerDateRangeFilter from "@/components/admin/career/AdminCareerDateRangeFilter";
import {
  type AdminCareerAnalyticsDateRange,
  useAdminCareerAnalyticsStore,
} from "@/components/admin/career/useAdminCareerAnalyticsStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ADMIN_PAGE_PASSWORD } from "@/lib/admin";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";

type CompanyDateRangeInput = {
  endDate: string;
  startDate: string;
};

type CompanyFunnelStep = {
  count: number;
  detail: string;
  key: "entry" | "search_click" | "main_click" | "any_action";
  label: string;
  rateFromEntry: number | null;
};

type CompanyAnalyticsResponse = {
  dateRange: {
    endDate: string | null;
    isActive: boolean;
    startDate: string | null;
  };
  device: {
    desktopEntryCount: number;
    mobileEntryCount: number;
    unknownEntryCount: number;
  };
  generatedAt: string;
  steps: CompanyFunnelStep[];
};

const toDateOnly = (date: Date | undefined) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateOnly = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
};

const dateRangeInputToSelection = (
  value: CompanyDateRangeInput
): DateRange | undefined => {
  const from = parseDateOnly(value.startDate);
  const to = parseDateOnly(value.endDate);
  if (!from && !to) return undefined;

  return {
    from: from ?? to,
    to: to ?? from,
  };
};

const dateRangeSelectionToInput = (
  value: DateRange | undefined
): AdminCareerAnalyticsDateRange => {
  const startDate = toDateOnly(value?.from);
  const endDate = toDateOnly(value?.to ?? value?.from);
  return { endDate, startDate };
};

const formatPercent = (value: number | null) => {
  if (value === null) return "-";
  return `${Math.round(value * 1000) / 10}%`;
};

async function fetchCompanyAnalytics(dateRange: CompanyDateRangeInput) {
  const response = await fetch("/api/admin/career/company", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": ADMIN_PAGE_PASSWORD,
    },
    body: JSON.stringify({
      dateRange:
        dateRange.startDate || dateRange.endDate ? dateRange : undefined,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as
    | CompanyAnalyticsResponse
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Company landing analytics를 불러오지 못했습니다."
    );
  }

  return payload as CompanyAnalyticsResponse;
}

export default function AdminCareerCompanyTab() {
  const appliedDateRange = useAdminCareerAnalyticsStore(
    (state) => state.dateRange
  );
  const hasHydratedDateRange = useAdminCareerAnalyticsStore(
    (state) => state.hasHydrated
  );
  const setAppliedDateRange = useAdminCareerAnalyticsStore(
    (state) => state.setDateRange
  );
  const resetAppliedDateRange = useAdminCareerAnalyticsStore(
    (state) => state.resetDateRange
  );
  const [draftDateRange, setDraftDateRange] = useState<DateRange | undefined>();

  const query = useQuery({
    queryKey: [
      "admin-career-company",
      appliedDateRange.startDate,
      appliedDateRange.endDate,
    ],
    queryFn: () => fetchCompanyAnalytics(appliedDateRange),
    enabled: hasHydratedDateRange,
    placeholderData: (previousData) => previousData,
  });

  const appliedDateRangeSelection = useMemo(
    () => dateRangeInputToSelection(appliedDateRange),
    [appliedDateRange]
  );
  const selectedDateRange = draftDateRange ?? appliedDateRangeSelection;
  const maxCount = Math.max(...(query.data?.steps ?? []).map((s) => s.count), 1);

  const applyDateRange = () => {
    setAppliedDateRange(dateRangeSelectionToInput(selectedDateRange));
    setDraftDateRange(undefined);
  };

  const resetDateRange = () => {
    setDraftDateRange(undefined);
    resetAppliedDateRange();
  };

  return (
    <div className="space-y-4">
      <AdminCareerDateRangeFilter
        appliedEndDate={appliedDateRange.endDate}
        appliedStartDate={appliedDateRange.startDate}
        description="/company 랜딩의 진입, Search 이동, 메인 CTA 클릭을 선택 기간 기준으로 봅니다."
        isFetching={query.isFetching}
        onApply={applyDateRange}
        onChange={setDraftDateRange}
        onReset={resetDateRange}
        title="Company landing 기간"
        value={selectedDateRange}
      />

      {query.error ? (
        <Card className="rounded-md border-red-200 bg-red-50 shadow-none">
          <CardContent className="p-4 text-[12px] text-red-700">
            {query.error instanceof Error
              ? query.error.message
              : "Company landing analytics를 불러오지 못했습니다."}
          </CardContent>
        </Card>
      ) : null}

      <Card className="rounded-md border-black/10 shadow-none">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-[14px] font-semibold text-black">
            Company Landing Funnel
          </CardTitle>
          <div className="mt-1 text-[12px] leading-5 text-black/50">
            /company 진입 대비 Search 이동과 메인 버튼 클릭 비율입니다.
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-2">
          {!hasHydratedDateRange || query.isLoading ? (
            <div className="text-[12px] text-black/50">
              Company landing analytics를 불러오는 중입니다.
            </div>
          ) : null}

          {query.data?.steps.map((step, index) => {
            const width = `${Math.max(
              (step.count / maxCount) * 100,
              step.count > 0 ? 4 : 0
            )}%`;

            return (
              <div
                key={step.key}
                className="grid gap-2 md:grid-cols-[180px_1fr_130px] md:items-center"
              >
                <div>
                  <div className="text-[12px] font-medium text-black">
                    {index + 1}. {step.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-black/40">
                    {step.detail}
                  </div>
                </div>
                <div className="h-8 border border-black/10 bg-black/[0.03]">
                  <div
                    className="h-full bg-black"
                    style={{ width }}
                    aria-hidden="true"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 md:block md:text-right">
                  <div className="text-[15px] font-semibold leading-5 text-black">
                    {step.count.toLocaleString("ko-KR")}
                  </div>
                  <div className="text-[11px] leading-4 text-black/45">
                    entry {formatPercent(step.rateFromEntry)}
                  </div>
                </div>
              </div>
            );
          })}

          {query.data?.steps.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-black/45">
              선택 기간에 /company landing log가 없습니다.
            </div>
          ) : null}
        </CardContent>
      </Card>

      {query.data ? (
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["Desktop entry", query.data.device.desktopEntryCount],
            ["Mobile entry", query.data.device.mobileEntryCount],
            ["Unknown entry", query.data.device.unknownEntryCount],
          ].map(([label, value]) => (
            <div key={label} className="border border-black/10 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-black/35">
                {label}
              </div>
              <div className="mt-2 text-[18px] font-semibold text-black">
                {Number(value).toLocaleString("ko-KR")}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {query.data?.generatedAt ? (
        <div className="text-[11px] text-black/40">
          Generated {new Date(query.data.generatedAt).toLocaleString("ko-KR")}
          {query.isFetching ? " · refreshing" : ""}
        </div>
      ) : null}
    </div>
  );
}
