import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ADMIN_PAGE_PASSWORD } from "@/lib/admin";
import type {
  AdminCareerJobFunnelStep,
  AdminCareerJobsResponse,
} from "@/lib/adminCareerAnalytics/types";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

type AdminCareerJobsTabProps = {
  excludedEmails: string[];
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "-";
  return new Date(time).toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

const formatRate = (value: number | null) => {
  if (value === null) return "-";
  return `${Math.round(value * 100).toLocaleString("ko-KR")}%`;
};

async function fetchCareerJobAnalytics(args: {
  excludedEmails: string[];
  selectedJobSlug: string | null;
}) {
  const params = new URLSearchParams();
  if (args.selectedJobSlug) params.set("jobSlug", args.selectedJobSlug);
  for (const email of args.excludedEmails) {
    params.append("excludedEmail", email);
  }

  const response = await fetch(`/api/admin/career/jobs?${params.toString()}`, {
    headers: {
      "x-admin-password": ADMIN_PAGE_PASSWORD,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as
    | AdminCareerJobsResponse
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Job analytics를 불러오지 못했습니다."
    );
  }

  return payload as AdminCareerJobsResponse;
}

function JobFunnel({ steps }: { steps: AdminCareerJobFunnelStep[] }) {
  const maxCount = Math.max(...steps.map((step) => step.count), 1);

  return (
    <div className="space-y-2">
      {steps.map((step, index) => {
        const width = `${Math.max(
          (step.count / maxCount) * 100,
          step.count > 0 ? 4 : 0
        )}%`;

        return (
          <div
            key={step.key}
            className="grid gap-2 md:grid-cols-[150px_1fr_86px] md:items-center"
          >
            <div>
              <div className="text-[12px] font-medium text-black">
                {index + 1}. {step.label}
              </div>
              <div className="text-[11px] text-black/40">{step.detail}</div>
            </div>
            <div className="h-7 border border-black/10 bg-black/[0.03]">
              <div className="h-full bg-black" style={{ width }} />
            </div>
            <div className="flex items-center justify-between gap-2 md:block md:text-right">
              <div className="text-[14px] font-semibold text-black">
                {step.count.toLocaleString("ko-KR")}
              </div>
              <div className="text-[11px] text-black/45">
                {formatRate(step.rateFromView)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminCareerJobsTab({
  excludedEmails,
}: AdminCareerJobsTabProps) {
  const [selectedJobSlug, setSelectedJobSlug] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["admin-career-jobs", selectedJobSlug, excludedEmails],
    queryFn: () =>
      fetchCareerJobAnalytics({ excludedEmails, selectedJobSlug }),
    placeholderData: (previousData) => previousData,
  });

  const effectiveSelectedJobSlug =
    selectedJobSlug ?? query.data?.selectedJob?.jobSlug ?? null;

  const filteredJobs = useMemo(() => {
    const jobs = query.data?.jobs ?? [];
    const keyword = search.trim().toLowerCase();
    if (!keyword) return jobs;

    return jobs.filter((job) =>
      [job.roleTitle, job.companyName, job.jobSlug]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [query.data?.jobs, search]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
      <Card className="rounded-md border-black/10 shadow-none">
        <CardHeader className="flex flex-row items-start justify-between gap-2 p-4 pb-2">
          <div>
            <CardTitle className="text-[14px] font-semibold text-black">
              Job analytics
            </CardTitle>
            <div className="mt-1 text-[12px] text-black/45">
              landing_logs 기준 job별 unique view와 Talk to Harper 클릭입니다.
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-none border-black/15 bg-white text-[12px] text-black shadow-none"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            {query.isFetching ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-2">
          {query.error ? (
            <div className="border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
              {query.error instanceof Error
                ? query.error.message
                : "Job analytics를 불러오지 못했습니다."}
            </div>
          ) : null}

          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="role, company, slug 검색"
            className="h-8 max-w-[360px] rounded-none border-black/15 bg-white text-[12px]"
          />

          <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow className="border-black/10 hover:bg-transparent">
                  <TableHead className="h-8 px-2 text-[11px]">Job</TableHead>
                  <TableHead className="h-8 px-2 text-[11px]">
                    상태
                  </TableHead>
                  <TableHead className="h-8 px-2 text-right text-[11px]">
                    Views
                  </TableHead>
                  <TableHead className="h-8 px-2 text-right text-[11px]">
                    Talk clicks
                  </TableHead>
                  <TableHead className="h-8 px-2 text-right text-[11px]">
                    Rate
                  </TableHead>
                  <TableHead className="h-8 px-2 text-right text-[11px]">
                    Login
                  </TableHead>
                  <TableHead className="h-8 px-2 text-[11px]">
                    최근 조회
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="px-2 py-6 text-center text-[12px] text-black/45"
                    >
                      Job analytics를 불러오는 중입니다.
                    </TableCell>
                  </TableRow>
                ) : filteredJobs.length ? (
                  filteredJobs.map((job) => {
                    const isSelected =
                      effectiveSelectedJobSlug === job.jobSlug;

                    return (
                      <TableRow
                        key={job.jobSlug}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          "cursor-pointer border-black/10",
                          isSelected && "bg-black/[0.04]"
                        )}
                        onClick={() => setSelectedJobSlug(job.jobSlug)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") {
                            return;
                          }
                          event.preventDefault();
                          setSelectedJobSlug(job.jobSlug);
                        }}
                      >
                        <TableCell className="px-2 py-2">
                          <div className="max-w-[340px] truncate text-[12px] font-medium text-black">
                            {job.roleTitle}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-black/45">
                            {job.companyName} · {job.jobSlug}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-2 text-[11px] text-black/55">
                          {job.isPublished ? "Published" : "Hidden"}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-right text-[12px] font-medium text-black">
                          {job.viewCount.toLocaleString("ko-KR")}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-right text-[12px] font-medium text-black">
                          {job.talkClickCount.toLocaleString("ko-KR")}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-right text-[12px] text-black/60">
                          {formatRate(job.talkClickRate)}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-right text-[12px] text-black/60">
                          {job.loginCount.toLocaleString("ko-KR")}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-[11px] text-black/55">
                          {formatDateTime(job.lastViewedAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="px-2 py-6 text-center text-[12px] text-black/45"
                    >
                      표시할 job 데이터가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-md border-black/10 shadow-none">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-[14px] font-semibold text-black">
            Job funnel
          </CardTitle>
          <div className="mt-1 text-[12px] text-black/45">
            {query.data?.selectedJob
              ? `${query.data.selectedJob.roleTitle} · ${query.data.selectedJob.companyName}`
              : "왼쪽에서 job row를 선택하세요."}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-2">
          {query.data?.selectedJob ? (
            <>
              <JobFunnel steps={query.data.selectedJob.steps} />
              <div className="border-t border-black/10 pt-3">
                <div className="mb-2 text-[12px] font-medium text-black">
                  본 사람들
                </div>
                <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                  {query.data.selectedJob.people.length === 0 ? (
                    <div className="border border-black/10 bg-black/[0.02] p-3 text-[12px] text-black/45">
                      아직 이 job을 본 사람이 없습니다.
                    </div>
                  ) : (
                    query.data.selectedJob.people.map((person) => (
                      <div
                        key={person.localId}
                        className="border border-black/10 bg-white p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-semibold text-black">
                              {person.email || "Anonymous"}
                            </div>
                            <div className="mt-0.5 truncate font-mono text-[11px] text-black/40">
                              {person.localId}
                            </div>
                          </div>
                          <span className="shrink-0 border border-black/10 bg-black/[0.03] px-2 py-1 text-[11px] font-medium text-black/65">
                            {person.currentStepLabel}
                          </span>
                        </div>
                        <div className="mt-2 text-[11px] text-black/42">
                          view {formatDateTime(person.firstViewedAt)} · talk{" "}
                          {formatDateTime(person.talkClickedAt)} · login{" "}
                          {formatDateTime(person.loginAt)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="border border-black/10 bg-black/[0.02] p-4 text-[12px] text-black/45">
              job view 로그가 쌓이면 여기에서 퍼널을 볼 수 있습니다.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
