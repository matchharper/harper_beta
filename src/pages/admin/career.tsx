import AdminAccessGuard from "@/components/admin/AdminAccessGuard";
import AdminMetricsNavigation from "@/components/admin/AdminMetricsNavigation";
import AdminCareerAbtestPanel from "@/components/admin/career/AdminCareerAbtestPanel";
import AdminCareerActivityTab from "@/components/admin/career/AdminCareerActivityTab";
import AdminCareerDateRangeFilter from "@/components/admin/career/AdminCareerDateRangeFilter";
import AdminCareerDeviceComparisonPanel from "@/components/admin/career/AdminCareerDeviceComparisonPanel";
import AdminCareerExperimentTab from "@/components/admin/career/AdminCareerExperimentTab";
import AdminCareerFunnelPanel from "@/components/admin/career/AdminCareerFunnelPanel";
import AdminCareerMetricGrid from "@/components/admin/career/AdminCareerMetricGrid";
import AdminCareerCompanyTab from "@/components/admin/career/AdminCareerCompanyTab";
import AdminCareerJobsTab from "@/components/admin/career/AdminCareerJobsTab";
import AdminCareerQuickSignalPanel from "@/components/admin/career/AdminCareerQuickSignalPanel";
import AdminCareerUtmTab from "@/components/admin/career/AdminCareerUtmTab";
import {
  type AdminCareerAnalyticsDateRange,
  useAdminCareerAnalyticsStore,
} from "@/components/admin/career/useAdminCareerAnalyticsStore";
import AdminMetricsExcludedEmails from "@/components/admin/metrics/AdminMetricsExcludedEmails";
import { useAdminMetricsStore } from "@/components/admin/metrics/useAdminMetricsStore";
import { showToast } from "@/components/toast/toast";
import { Button, BareButton } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ADMIN_PAGE_PASSWORD } from "@/lib/admin";
import { normalizeExcludedEmails } from "@/lib/adminMetrics/utils";
import type { AdminCareerAnalyticsResponse } from "@/lib/adminCareerAnalytics/types";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Send } from "lucide-react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";

type CareerAdminTab =
  | "overview"
  | "activity"
  | "experiment"
  | "utm"
  | "jobs"
  | "company";
const CAREER_ADMIN_TABS: CareerAdminTab[] = [
  "overview",
  "activity",
  "experiment",
  "utm",
  "jobs",
  "company",
];

const CAREER_ADMIN_TAB_META: Record<
  CareerAdminTab,
  {
    label: string;
    title: string;
    subtitle: string;
  }
> = {
  overview: {
    label: "Overview",
    title: "Career Analytics",
    subtitle: "랜딩부터 온보딩, 추천 소비와 피드백까지 봅니다.",
  },
  activity: {
    label: "Users & Activity",
    title: "Career Users & Activity",
    subtitle:
      "Signup, Career 방문, Live DB와 사용자 activity를 일·주·월로 봅니다.",
  },
  experiment: {
    label: "Experiment",
    title: "Career Experiment",
    subtitle: "",
  },
  utm: {
    label: "UTM",
    title: "Career UTM",
    subtitle: "career 랜딩 source별 진입과 전환을 봅니다.",
  },
  jobs: {
    label: "Jobs",
    title: "Career Jobs",
    subtitle: "jobs 페이지별 view, CTA click, login 흐름을 봅니다.",
  },
  company: {
    label: "Company",
    title: "Company Landing",
    subtitle: "/company 랜딩 진입 대비 Search 이동과 메인 CTA 클릭을 봅니다.",
  },
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

const readQueryValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
};

const normalizeCareerAdminTab = (value: string | string[] | undefined) => {
  const normalized = readQueryValue(value).trim();
  return CAREER_ADMIN_TABS.includes(normalized as CareerAdminTab)
    ? (normalized as CareerAdminTab)
    : "overview";
};

const dateRangeInputToSelection = (
  value: AdminCareerAnalyticsDateRange
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

async function fetchCareerAnalytics(
  excludedEmails: string[],
  dateRange: AdminCareerAnalyticsDateRange
) {
  const response = await fetch("/api/admin/career", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": ADMIN_PAGE_PASSWORD,
    },
    body: JSON.stringify({
      dateRange:
        dateRange.startDate || dateRange.endDate ? dateRange : undefined,
      excludedEmails,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as
    | AdminCareerAnalyticsResponse
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Career analytics를 불러오지 못했습니다."
    );
  }

  return payload as AdminCareerAnalyticsResponse;
}

async function sendCareerAnalyticsSlackSummary(
  excludedEmails: string[],
  dateRange: AdminCareerAnalyticsDateRange
) {
  const response = await fetch("/api/admin/career", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": ADMIN_PAGE_PASSWORD,
    },
    body: JSON.stringify({
      dateRange:
        dateRange.startDate || dateRange.endDate ? dateRange : undefined,
      excludedEmails,
      sendSlackSummary: true,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as
    | AdminCareerAnalyticsResponse
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Slack 요약을 보내지 못했습니다."
    );
  }

  return payload as AdminCareerAnalyticsResponse;
}

function AdminCareerContent() {
  const router = useRouter();
  const activeTab = normalizeCareerAdminTab(router.query.tab);
  const { excludedEmails, setExcludedEmails, resetExcludedEmails } =
    useAdminMetricsStore();
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
  const [isExcludedEmailsModalOpen, setIsExcludedEmailsModalOpen] =
    useState(false);
  const [draftDateRange, setDraftDateRange] = useState<DateRange | undefined>();
  const [isSendingSlackSummary, setIsSendingSlackSummary] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const rawTab = readQueryValue(router.query.tab).trim();
    if (rawTab === "" || CAREER_ADMIN_TABS.includes(rawTab as CareerAdminTab)) {
      return;
    }

    void router.replace(
      {
        pathname: "/admin/career",
        query: {
          tab: activeTab,
        },
      },
      undefined,
      { shallow: true }
    );
  }, [activeTab, router]);

  const query = useQuery({
    queryKey: [
      "admin-career-analytics",
      excludedEmails,
      appliedDateRange.startDate,
      appliedDateRange.endDate,
    ],
    queryFn: () => fetchCareerAnalytics(excludedEmails, appliedDateRange),
    enabled: activeTab === "overview" && hasHydratedDateRange,
    placeholderData: (previousData) => previousData,
  });

  const appliedDateRangeSelection = useMemo(
    () => dateRangeInputToSelection(appliedDateRange),
    [appliedDateRange]
  );
  const selectedDateRange = draftDateRange ?? appliedDateRangeSelection;

  const saveExcludedEmails = (value: string) => {
    const nextValue = normalizeExcludedEmails(value);
    setExcludedEmails(nextValue);
    setIsExcludedEmailsModalOpen(false);
    showToast({
      message: `Excluded emails saved (${nextValue.length})`,
      variant: "white",
    });
  };

  const resetExcludedEmailSettings = () => {
    resetExcludedEmails();
    setIsExcludedEmailsModalOpen(false);
    showToast({
      message: "Excluded emails reset to defaults",
      variant: "white",
    });
  };

  const applyDateRange = () => {
    setAppliedDateRange(dateRangeSelectionToInput(selectedDateRange));
    setDraftDateRange(undefined);
  };

  const resetDateRange = () => {
    setDraftDateRange(undefined);
    resetAppliedDateRange();
  };

  const handleSendSlackSummary = async () => {
    if (isSendingSlackSummary || !hasHydratedDateRange) return;

    setIsSendingSlackSummary(true);
    try {
      const payload = await sendCareerAnalyticsSlackSummary(
        excludedEmails,
        appliedDateRange
      );
      showToast({
        message: payload.slackSummary
          ? "Slack internal 알림을 보냈습니다."
          : "Slack internal 알림 요청이 완료되었습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "Slack 요약을 보내지 못했습니다.",
        variant: "error",
      });
    } finally {
      setIsSendingSlackSummary(false);
    }
  };

  return (
    <>
      <Head>
        <title>{CAREER_ADMIN_TAB_META[activeTab].title} | Harper Admin</title>
      </Head>
      <main className="min-h-svh bg-white text-black">
        <AdminMetricsNavigation
          activeSection="career"
          title={CAREER_ADMIN_TAB_META[activeTab].title}
          subtitle={CAREER_ADMIN_TAB_META[activeTab].subtitle}
          tabs={[
            ...CAREER_ADMIN_TABS.map((tab) => ({
              active: activeTab === tab,
              href: `/admin/career?tab=${tab}`,
              label: CAREER_ADMIN_TAB_META[tab].label,
            })),
            {
              active: false,
              href: "/admin/career/top_funnel",
              label: "Top Funnel",
            },
          ]}
          actions={
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 rounded-none border-black/15 bg-white text-[12px] text-black shadow-none"
                onClick={() => setIsExcludedEmailsModalOpen(true)}
              >
                Excluded emails ({excludedEmails.length})
              </Button>
              {activeTab === "overview" ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-none border-black/15 bg-white text-[12px] text-black shadow-none"
                    onClick={() => void handleSendSlackSummary()}
                    disabled={
                      isSendingSlackSummary ||
                      !hasHydratedDateRange ||
                      query.isLoading
                    }
                  >
                    {isSendingSlackSummary ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Slack 요약
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-none border-black/15 bg-white text-[12px] text-black shadow-none"
                    onClick={() => query.refetch()}
                    disabled={!hasHydratedDateRange || query.isFetching}
                  >
                    Refresh
                  </Button>
                </>
              ) : null}
            </>
          }
        />

        <div className="mx-auto w-full max-w-[1180px] space-y-4 px-4 py-5 md:px-6">
          {activeTab === "activity" ? (
            <AdminCareerActivityTab excludedEmails={excludedEmails} />
          ) : activeTab === "utm" ? (
            <AdminCareerUtmTab excludedEmails={excludedEmails} />
          ) : activeTab === "experiment" ? (
            <AdminCareerExperimentTab excludedEmails={excludedEmails} />
          ) : activeTab === "jobs" ? (
            <AdminCareerJobsTab excludedEmails={excludedEmails} />
          ) : activeTab === "company" ? (
            <AdminCareerCompanyTab />
          ) : query.error ? (
            <Card className="rounded-md border-red-200 bg-red-50 shadow-none">
              <CardContent className="p-4 text-[12px] text-red-700">
                {query.error instanceof Error
                  ? query.error.message
                  : "데이터를 불러오지 못했습니다."}
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "overview" &&
          (!hasHydratedDateRange || query.isLoading) ? (
            <Card className="rounded-md border-black/10 shadow-none">
              <CardContent className="p-4 text-[12px] text-black/50">
                Career analytics를 불러오는 중입니다.
              </CardContent>
            </Card>
          ) : activeTab === "overview" && query.data ? (
            <>
              <AdminCareerDateRangeFilter
                appliedEndDate={appliedDateRange.endDate}
                appliedStartDate={appliedDateRange.startDate}
                isFetching={query.isFetching}
                onApply={applyDateRange}
                onChange={setDraftDateRange}
                onReset={resetDateRange}
                value={selectedDateRange}
              />
              <AdminCareerAbtestPanel
                variants={query.data.landingVariants ?? []}
              />
              <AdminCareerQuickSignalPanel
                signals={query.data.quickSignals ?? []}
              />
              <AdminCareerDeviceComparisonPanel
                rows={query.data.deviceComparison ?? []}
              />
              <AdminCareerMetricGrid metrics={query.data.summary} />
              <AdminCareerFunnelPanel
                landingSources={query.data.landingSources ?? []}
                steps={query.data.funnel}
              />

              <div className="text-[12px] text-black/45">
                Generated{" "}
                {new Date(query.data.generatedAt).toLocaleString("ko-KR")}
                {query.isFetching ? " · refreshing" : ""}
              </div>
            </>
          ) : null}
        </div>

        {isExcludedEmailsModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
            <BareButton
              type="button"
              aria-label="Close excluded emails modal"
              className="absolute inset-0 bg-black/35"
              onClick={() => setIsExcludedEmailsModalOpen(false)}
            />
            <div
              className={cn(
                "relative z-10 w-full max-w-[640px] border border-black/15 bg-white p-5 shadow-2xl"
              )}
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-[14px] font-semibold text-black">
                    Excluded emails
                  </div>
                  <div className="mt-1 text-[12px] leading-5 text-black/55">
                    Career Analytics에도 같은 제외 이메일 목록을 적용합니다.
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-none border-black/15 bg-white text-[12px] text-black shadow-none"
                  onClick={() => setIsExcludedEmailsModalOpen(false)}
                >
                  Close
                </Button>
              </div>
              <AdminMetricsExcludedEmails
                excludedEmails={excludedEmails}
                onSave={saveExcludedEmails}
                onReset={resetExcludedEmailSettings}
              />
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}

const AdminCareerPage = () => (
  <AdminAccessGuard>{() => <AdminCareerContent />}</AdminAccessGuard>
);

export default AdminCareerPage;
