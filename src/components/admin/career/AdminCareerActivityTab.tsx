import { OpsDateRangeFilter } from "@/components/ops/OpsDateRangeFilter";
import { MuteButton } from "@/components/ui/button";
import { ADMIN_PAGE_PASSWORD } from "@/lib/admin";
import {
  ADMIN_CAREER_ACTIVITY_DEFAULT_START_DATE,
  getKstTodayDate,
} from "@/lib/adminCareerActivity/utils";
import type {
  AdminCareerActivityBucket,
  AdminCareerActivityInterval,
  AdminCareerActivityResponse,
} from "@/lib/adminCareerActivity/types";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AdminCareerActivityTabProps = {
  excludedEmails: string[];
};

type DateRangeValue = {
  from: string;
  to: string;
};

const INTERVALS: Array<{
  label: string;
  value: AdminCareerActivityInterval;
}> = [
  { label: "일별", value: "day" },
  { label: "주별", value: "week" },
  { label: "월별", value: "month" },
];

const tooltipStyle = {
  background: "var(--color-bg-floating)",
  border: "1px solid var(--color-neutral-1000-a10)",
  borderRadius: "8px",
  boxShadow:
    "0 16px 36px color-mix(in srgb, var(--color-neutral-1000) 12%, transparent)",
  color: "var(--color-neutral-primary)",
  fontSize: "12px",
};

function formatCount(value: number) {
  return Math.round(Number.isFinite(value) ? value : 0).toLocaleString("ko-KR");
}

function parseDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
  );
}

function formatDateOnly(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function shiftDateOnly(value: string, amount: number) {
  const date = parseDateOnly(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDateOnly(date);
}

function getMonthStart(value: string) {
  const date = parseDateOnly(value);
  if (!date) return value;
  date.setUTCDate(1);
  return formatDateOnly(date);
}

async function fetchCareerActivity(args: {
  dateRange: DateRangeValue;
  excludedEmails: string[];
}) {
  const response = await fetch("/api/admin/career/activity", {
    body: JSON.stringify({
      endDate: args.dateRange.to,
      excludedEmails: args.excludedEmails,
      startDate: args.dateRange.from,
    }),
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": ADMIN_PAGE_PASSWORD,
    },
    method: "POST",
  });
  const payload = (await response.json().catch(() => ({}))) as
    | AdminCareerActivityResponse
    | { error?: string };
  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Career activity 지표를 불러오지 못했습니다."
    );
  }
  return payload as AdminCareerActivityResponse;
}

function MetricCard({
  description,
  label,
  value,
}: {
  description: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md bg-bg-floating px-4 py-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-neutral-00)_75%,transparent)]">
      <div className="text-[12px] font-medium text-neutral-muted">{label}</div>
      <div className="mt-2 text-[26px] font-semibold tabular-nums tracking-[-0.04em] text-neutral-primary">
        {formatCount(value)}
      </div>
      <div className="mt-1 text-[11px] leading-4 text-neutral-soft">
        {description}
      </div>
    </div>
  );
}

function bucketTooltipLabel(bucket: AdminCareerActivityBucket | undefined) {
  if (!bucket) return "";
  return bucket.startDate === bucket.endDate
    ? bucket.startDate
    : `${bucket.startDate} ~ ${bucket.endDate}`;
}

export default function AdminCareerActivityTab({
  excludedEmails,
}: AdminCareerActivityTabProps) {
  const today = getKstTodayDate();
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => ({
    from:
      ADMIN_CAREER_ACTIVITY_DEFAULT_START_DATE <= today
        ? ADMIN_CAREER_ACTIVITY_DEFAULT_START_DATE
        : today,
    to: today,
  }));
  const [interval, setInterval] = useState<AdminCareerActivityInterval>("week");

  const query = useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: () => fetchCareerActivity({ dateRange, excludedEmails }),
    queryKey: [
      "admin-career-activity",
      dateRange.from,
      dateRange.to,
      excludedEmails,
    ],
    staleTime: 60_000,
  });
  const buckets = useMemo(
    () => query.data?.series[interval] ?? [],
    [interval, query.data]
  );
  const activityData = query.data;
  const totals = activityData?.totals;

  const applyPreset = (preset: "all" | "month" | "30d" | "7d") => {
    if (preset === "all") {
      setDateRange({
        from: ADMIN_CAREER_ACTIVITY_DEFAULT_START_DATE,
        to: today,
      });
      return;
    }
    if (preset === "month") {
      setDateRange({ from: getMonthStart(today), to: today });
      return;
    }
    setDateRange({
      from: shiftDateOnly(today, preset === "7d" ? -6 : -29),
      to: today,
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-bg-default/90 p-4 shadow-[0_14px_40px_color-mix(in_srgb,var(--color-neutral-1000)_7%,transparent)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[13px] font-semibold text-neutral-primary">
              기간과 집계 단위
            </div>
            <div className="mt-1 text-[12px] leading-5 text-neutral-muted">
              날짜는 KST 기준입니다. 범위 전체 고유 인원과 각 버킷의 고유 인원을
              따로 계산합니다.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OpsDateRangeFilter
              align="end"
              emptyLabel="기간 선택"
              from={dateRange.from}
              numberOfMonths={2}
              onChange={(from, to) => {
                if (!from) return;
                setDateRange({ from, to: to || from });
              }}
              prefix="KST"
              to={dateRange.to}
            />
            <MuteButton
              aria-label="지표 새로고침"
              size="sm"
              variant="neutral"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  query.isFetching && "animate-spin"
                )}
                aria-hidden
              />
              새로고침
            </MuteButton>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 border-t border-neutral-1000-a05 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            <MuteButton
              size="sm"
              variant="transparent"
              onClick={() => applyPreset("7d")}
            >
              최근 7일
            </MuteButton>
            <MuteButton
              size="sm"
              variant="transparent"
              onClick={() => applyPreset("30d")}
            >
              최근 30일
            </MuteButton>
            <MuteButton
              size="sm"
              variant="transparent"
              onClick={() => applyPreset("month")}
            >
              이번 달
            </MuteButton>
            <MuteButton
              size="sm"
              variant="transparent"
              onClick={() => applyPreset("all")}
            >
              4월부터
            </MuteButton>
          </div>
          <div className="flex gap-1.5" aria-label="집계 단위">
            {INTERVALS.map((item) => (
              <MuteButton
                key={item.value}
                aria-pressed={interval === item.value}
                size="sm"
                variant={interval === item.value ? "dark" : "neutral"}
                onClick={() => setInterval(item.value)}
              >
                {item.label}
              </MuteButton>
            ))}
          </div>
        </div>
      </section>

      {query.error ? (
        <div
          role="alert"
          className="rounded-md bg-critical-faded px-4 py-3 text-[12px] text-critical"
        >
          {query.error instanceof Error
            ? query.error.message
            : "Career activity 지표를 불러오지 못했습니다."}
        </div>
      ) : null}

      {!query.data && query.isLoading ? (
        <div className="rounded-md bg-bg-weak px-4 py-10 text-center text-[13px] text-neutral-muted">
          Career activity 지표를 집계하고 있습니다.
        </div>
      ) : activityData && totals ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard
              description="talent_users 생성 고유 인원"
              label="Signup"
              value={totals.signupCount}
            />
            <MetricCard
              description="/career를 연 고유 인원"
              label="Career 방문자"
              value={totals.careerVisitorCount}
            />
            <MetricCard
              description="대화·메일·피드백·포지션 확인 고유 인원"
              label="Interaction 인원"
              value={totals.interactingTalentCount}
            />
            <MetricCard
              description="가입·로그인·방문·interaction 합집합"
              label="Live DB 인원"
              value={totals.liveDbTalentCount}
            />
            <MetricCard
              description="사용자 주도 activity 전체 건수"
              label="Activity"
              value={totals.activityCount}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-lg bg-bg-default/90 p-4 shadow-[0_14px_40px_color-mix(in_srgb,var(--color-neutral-1000)_7%,transparent)]">
              <div className="text-[13px] font-semibold text-neutral-primary">
                인원 추이
              </div>
              <div className="mt-1 text-[11px] text-neutral-soft">
                같은 사람이 한 버킷에서 여러 번 활동해도 인원은 1명입니다.
              </div>
              <div className="mt-4 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={buckets}
                    margin={{ left: 0, right: 8, top: 8 }}
                  >
                    <CartesianGrid
                      stroke="color-mix(in srgb, var(--color-neutral-1000) 6%, transparent)"
                      vertical={false}
                    />
                    <XAxis
                      axisLine={false}
                      dataKey="label"
                      minTickGap={22}
                      tick={{ fill: "var(--color-neutral-soft)", fontSize: 11 }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tick={{ fill: "var(--color-neutral-soft)", fontSize: 11 }}
                      tickFormatter={(value) => formatCount(Number(value))}
                      tickLine={false}
                      width={48}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value, name) => [
                        formatCount(Number(value ?? 0)),
                        name,
                      ]}
                      labelFormatter={(_, payload) =>
                        bucketTooltipLabel(payload?.[0]?.payload)
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Line
                      dataKey="signupCount"
                      dot={false}
                      name="Signup"
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      type="monotone"
                    />
                    <Line
                      dataKey="careerVisitorCount"
                      dot={false}
                      name="Career 방문자"
                      stroke="var(--color-action)"
                      strokeWidth={2}
                      type="monotone"
                    />
                    <Line
                      dataKey="interactingTalentCount"
                      dot={false}
                      name="Interaction 인원"
                      stroke="var(--color-positive)"
                      strokeWidth={2}
                      type="monotone"
                    />
                    <Line
                      dataKey="liveDbTalentCount"
                      dot={false}
                      name="Live DB 인원"
                      stroke="var(--color-neutral-800)"
                      strokeWidth={2}
                      type="monotone"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-lg bg-bg-default/90 p-4 shadow-[0_14px_40px_color-mix(in_srgb,var(--color-neutral-1000)_7%,transparent)]">
              <div className="text-[13px] font-semibold text-neutral-primary">
                Activity 구성
              </div>
              <div className="mt-1 text-[11px] text-neutral-soft">
                채팅 + voice + 수신 메일 + 저장된 피드백 + 포지션 확인
              </div>
              <div className="mt-4 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={buckets}
                    margin={{ left: 0, right: 8, top: 8 }}
                  >
                    <CartesianGrid
                      stroke="color-mix(in srgb, var(--color-neutral-1000) 6%, transparent)"
                      vertical={false}
                    />
                    <XAxis
                      axisLine={false}
                      dataKey="label"
                      minTickGap={22}
                      tick={{ fill: "var(--color-neutral-soft)", fontSize: 11 }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tick={{ fill: "var(--color-neutral-soft)", fontSize: 11 }}
                      tickFormatter={(value) => formatCount(Number(value))}
                      tickLine={false}
                      width={48}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value, name) => [
                        formatCount(Number(value ?? 0)),
                        name,
                      ]}
                      labelFormatter={(_, payload) =>
                        bucketTooltipLabel(payload?.[0]?.payload)
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar
                      dataKey="textChatCount"
                      fill="var(--color-primary)"
                      name="채팅"
                      stackId="activity"
                    />
                    <Bar
                      dataKey="voiceCount"
                      fill="var(--color-action)"
                      name="Voice"
                      stackId="activity"
                    />
                    <Bar
                      dataKey="emailCount"
                      fill="var(--color-info)"
                      name="메일"
                      stackId="activity"
                    />
                    <Bar
                      dataKey="feedbackCount"
                      fill="var(--color-positive)"
                      name="피드백"
                      stackId="activity"
                    />
                    <Bar
                      dataKey="positionViewCount"
                      fill="var(--color-neutral-700)"
                      name="포지션 확인"
                      stackId="activity"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg bg-bg-default/90 shadow-[0_14px_40px_color-mix(in_srgb,var(--color-neutral-1000)_7%,transparent)]">
            <div className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[13px] font-semibold text-neutral-primary">
                버킷별 원본 수치
              </div>
              <div className="text-[11px] text-neutral-soft">
                {activityData.startDate} ~ {activityData.endDate} · KST · 제외
                이메일 {activityData.excludedEmails.length}개
              </div>
            </div>
            <div className="overflow-x-auto border-t border-neutral-1000-a05">
              <table className="w-full min-w-[1080px] border-collapse text-left text-[12px]">
                <thead className="bg-bg-weak text-neutral-muted">
                  <tr>
                    {[
                      "기간",
                      "Signup",
                      "방문자",
                      "Interaction",
                      "Live DB",
                      "Activity",
                      "채팅",
                      "Voice",
                      "메일",
                      "피드백",
                      "포지션 확인",
                    ].map((label, index) => (
                      <th
                        key={label}
                        className={cn(
                          "whitespace-nowrap px-3 py-3 font-medium",
                          index > 0 && "text-right"
                        )}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((bucket) => (
                    <tr
                      key={`${bucket.startDate}-${bucket.endDate}`}
                      className="border-t border-neutral-1000-a05"
                    >
                      <td className="whitespace-nowrap px-3 py-3 text-neutral-muted">
                        {bucket.startDate === bucket.endDate
                          ? bucket.startDate
                          : `${bucket.startDate} ~ ${bucket.endDate}`}
                      </td>
                      {[
                        bucket.signupCount,
                        bucket.careerVisitorCount,
                        bucket.interactingTalentCount,
                        bucket.liveDbTalentCount,
                        bucket.activityCount,
                        bucket.textChatCount,
                        bucket.voiceCount,
                        bucket.emailCount,
                        bucket.feedbackCount,
                        bucket.positionViewCount,
                      ].map((value, index) => (
                        <td
                          key={index}
                          className="px-3 py-3 text-right tabular-nums text-neutral-primary"
                        >
                          {formatCount(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg bg-bg-default/90 p-4 text-[12px] leading-5 text-neutral-muted shadow-[0_14px_40px_color-mix(in_srgb,var(--color-neutral-1000)_7%,transparent)]">
            <div className="font-semibold text-neutral-primary">지표 정의</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <span className="font-medium text-neutral-primary">
                  사람 수
                </span>
                <p className="mt-1">
                  Signup은 talent_users의 created_at, 방문자는 career_app_opened
                  로그 기준입니다. Interaction은 사용자 채팅, call transcript,
                  수신 메일, 추천 like/dislike, 포지션 상세/JD 열기 중 하나가
                  있는 고유 talent입니다. Live DB는 같은 기간의
                  Signup·login·방문·Interaction 합집합입니다.
                </p>
              </div>
              <div>
                <span className="font-medium text-neutral-primary">
                  Activity 수
                </span>
                <p className="mt-1">
                  사용자 발화만 세며 Harper의 답장은 제외합니다. 메일은 수신
                  성공 건, 피드백은 DB에 저장된 like/dislike 건, 포지션 확인은
                  상세 또는 JD 열기 로그 건입니다. 한 사람이 여러 번 행동하면
                  Activity에는 모두 반영됩니다.
                </p>
              </div>
            </div>
            <div className="mt-3 border-t border-neutral-1000-a05 pt-3 text-[11px] text-neutral-soft">
              생성{" "}
              {new Date(activityData.generatedAt).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
              })}{" "}
              KST
              {query.isFetching ? " · 갱신 중" : ""}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
