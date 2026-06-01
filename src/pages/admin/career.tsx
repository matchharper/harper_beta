import AdminAccessGuard from "@/components/admin/AdminAccessGuard";
import AdminCareerDateRangeFilter from "@/components/admin/career/AdminCareerDateRangeFilter";
import AdminCareerDeviceComparisonPanel from "@/components/admin/career/AdminCareerDeviceComparisonPanel";
import AdminCareerFunnelPanel from "@/components/admin/career/AdminCareerFunnelPanel";
import AdminCareerMetricGrid from "@/components/admin/career/AdminCareerMetricGrid";
import AdminCareerJobsTab from "@/components/admin/career/AdminCareerJobsTab";
import AdminCareerQuickSignalPanel from "@/components/admin/career/AdminCareerQuickSignalPanel";
import AdminCareerUtmTab from "@/components/admin/career/AdminCareerUtmTab";
import AdminCareerUserTable from "@/components/admin/career/AdminCareerUserTable";
import AdminMetricsExcludedEmails from "@/components/admin/metrics/AdminMetricsExcludedEmails";
import { useAdminMetricsStore } from "@/components/admin/metrics/useAdminMetricsStore";
import { showToast } from "@/components/toast/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ADMIN_PAGE_PASSWORD } from "@/lib/admin";
import { normalizeExcludedEmails } from "@/lib/adminMetrics/utils";
import type { AdminCareerAnalyticsResponse } from "@/lib/adminCareerAnalytics/types";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Send } from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import React, { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";

type CareerAnalyticsDateRangeInput = {
  endDate: string;
  startDate: string;
};

type CareerAdminTab = "overview" | "utm" | "jobs";

const emptyDateRange: CareerAnalyticsDateRangeInput = {
  endDate: "",
  startDate: "",
};

const toDateOnly = (date: Date | undefined) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

async function fetchCareerAnalytics(
  excludedEmails: string[],
  dateRange: CareerAnalyticsDateRangeInput
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
  dateRange: CareerAnalyticsDateRangeInput
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
  const { excludedEmails, setExcludedEmails, resetExcludedEmails } =
    useAdminMetricsStore();
  const [isExcludedEmailsModalOpen, setIsExcludedEmailsModalOpen] =
    useState(false);
  const [draftDateRange, setDraftDateRange] = useState<DateRange | undefined>();
  const [appliedDateRange, setAppliedDateRange] =
    useState<CareerAnalyticsDateRangeInput>(emptyDateRange);
  const [isSendingSlackSummary, setIsSendingSlackSummary] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<CareerAdminTab>("overview");

  const query = useQuery({
    queryKey: [
      "admin-career-analytics",
      excludedEmails,
      appliedDateRange.startDate,
      appliedDateRange.endDate,
    ],
    queryFn: () => fetchCareerAnalytics(excludedEmails, appliedDateRange),
    enabled: activeTab === "overview",
    placeholderData: (previousData) => previousData,
  });

  const filteredUsers = useMemo(() => {
    const users = query.data?.users ?? [];
    const keyword = search.trim().toLowerCase();
    if (!keyword) return users;

    return users.filter((user) => {
      const haystack = [
        user.name,
        user.email,
        user.userId,
        user.lastMeaningfulAction,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [query.data?.users, search]);

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
    const startDate = toDateOnly(draftDateRange?.from);
    const endDate = toDateOnly(draftDateRange?.to ?? draftDateRange?.from);
    setAppliedDateRange({ endDate, startDate });
  };

  const resetDateRange = () => {
    setDraftDateRange(undefined);
    setAppliedDateRange(emptyDateRange);
  };

  const handleSendSlackSummary = async () => {
    if (isSendingSlackSummary) return;

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
        <title>Career Analytics Admin</title>
      </Head>
      <main className="min-h-svh bg-white text-black">
        <header className="sticky top-0 z-10 border-b border-black/10 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
            <div>
              <div className="text-[15px] font-semibold tracking-tight">
                Career Analytics
              </div>
              <div className="mt-1 text-[12px] leading-5 text-black/50">
                랜딩부터 온보딩, 추천 소비와 피드백까지 내부 이메일 제외
                기준으로 봅니다.
              </div>
              <nav className="mt-3 flex flex-wrap gap-2">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-none border-black/15 bg-white text-[12px] text-black shadow-none"
                >
                  <Link href="/admin">Admin index</Link>
                </Button>
                <Button
                  variant={activeTab === "overview" ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-8 rounded-none text-[12px]",
                    activeTab !== "overview" &&
                      "border-black/15 bg-white text-black shadow-none"
                  )}
                  onClick={() => setActiveTab("overview")}
                >
                  Career
                </Button>
                <Button
                  variant={activeTab === "utm" ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-8 rounded-none text-[12px]",
                    activeTab !== "utm" &&
                      "border-black/15 bg-white text-black shadow-none"
                  )}
                  onClick={() => setActiveTab("utm")}
                >
                  UTM
                </Button>
                <Button
                  variant={activeTab === "jobs" ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-8 rounded-none text-[12px]",
                    activeTab !== "jobs" &&
                      "border-black/15 bg-white text-black shadow-none"
                  )}
                  onClick={() => setActiveTab("jobs")}
                >
                  Jobs
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-none border-black/15 bg-white text-[12px] text-black shadow-none"
                >
                  <Link href="/admin/career/top_funnel">Top funnel</Link>
                </Button>
              </nav>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-none border-black/15 bg-white text-[12px] text-black shadow-none"
                onClick={() => setIsExcludedEmailsModalOpen(true)}
              >
                Excluded emails ({excludedEmails.length})
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-none border-black/15 bg-white text-[12px] text-black shadow-none"
                onClick={() => void handleSendSlackSummary()}
                disabled={isSendingSlackSummary || query.isLoading}
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
                variant="outline"
                size="sm"
                className="h-8 rounded-none border-black/15 bg-white text-[12px] text-black shadow-none"
                onClick={() => query.refetch()}
                disabled={query.isFetching}
              >
                Refresh
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1180px] space-y-4 px-4 py-5 md:px-6">
          {activeTab === "utm" ? (
            <AdminCareerUtmTab excludedEmails={excludedEmails} />
          ) : activeTab === "jobs" ? (
            <AdminCareerJobsTab excludedEmails={excludedEmails} />
          ) : query.error ? (
            <Card className="rounded-md border-red-200 bg-red-50 shadow-none">
              <CardContent className="p-4 text-[12px] text-red-700">
                {query.error instanceof Error
                  ? query.error.message
                  : "데이터를 불러오지 못했습니다."}
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "overview" && query.isLoading ? (
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
                value={draftDateRange}
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

              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-[12px] text-black/45">
                  Generated{" "}
                  {new Date(query.data.generatedAt).toLocaleString("ko-KR")}
                  {query.isFetching ? " · refreshing" : ""}
                </div>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="이름, 이메일, 액션 검색"
                  className="h-8 max-w-[320px] rounded-none border-black/15 bg-white text-[12px]"
                />
              </div>

              <AdminCareerUserTable users={filteredUsers} />
            </>
          ) : null}
        </div>

        {isExcludedEmailsModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
            <button
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
                  variant="outline"
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
