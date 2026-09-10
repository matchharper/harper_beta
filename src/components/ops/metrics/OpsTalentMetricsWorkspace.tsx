import dynamic from "next/dynamic";
import { useEffect } from "react";
import { AlertTriangle, Info, LoaderCircle, RefreshCw } from "lucide-react";
import { OpsDateRangeFilter } from "@/components/ops/OpsDateRangeFilter";
import { cx, opsTheme } from "@/components/ops/theme";
import { MuteButton } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Tooltips } from "@/components/ui/tooltip";
import { useOpsTalentMetrics } from "@/hooks/ops/useOpsTalentMetrics";
import type {
  OpsTalentMetricConversionSummary,
  OpsTalentMetricInterval,
} from "@/lib/ops/talentMetrics";
import { isInternalEmail } from "@/lib/internalAccess";
import { useAuthStore } from "@/store/useAuthStore";
import { useOpsInternalDataExclusionStore } from "@/store/useOpsInternalDataExclusionStore";
import { useOpsTalentMetricsFilterStore } from "@/store/useOpsTalentMetricsFilterStore";

function ChartLoading() {
  return (
    <div className="flex h-[320px] items-center justify-center border-t border-neutral-1000-a05 text-sm text-neutral-muted">
      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
      차트를 준비하는 중입니다.
    </div>
  );
}

const ConversionCharts = dynamic(
  () =>
    import("@/components/ops/metrics/OpsTalentMetricsCharts").then(
      (module) => module.OpsTalentMetricsConversionCharts
    ),
  { loading: ChartLoading, ssr: false }
);

const EngagementCharts = dynamic(
  () =>
    import("@/components/ops/metrics/OpsTalentMetricsCharts").then(
      (module) => module.OpsTalentMetricsEngagementCharts
    ),
  { loading: ChartLoading, ssr: false }
);

const RetentionTable = dynamic(
  () =>
    import("@/components/ops/metrics/OpsTalentMetricsCharts").then(
      (module) => module.OpsTalentMetricsRetentionTable
    ),
  { loading: ChartLoading, ssr: false }
);

const QUICK_RANGE_DAYS = [30, 90, 180] as const;

function formatNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return value.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatRatio(summary: OpsTalentMetricConversionSummary) {
  if (summary.recommendationRejectedCount === 0) {
    return summary.recommendationAcceptedCount > 0
      ? `${summary.recommendationAcceptedCount} : 0`
      : "-";
  }
  return `${formatNumber(summary.recommendationAcceptRejectRatio, 2)} : 1`;
}

function Delta({
  current,
  previous,
  percent = false,
}: {
  current: number | null | undefined;
  percent?: boolean;
  previous: number | null | undefined;
}) {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  ) {
    return <span>직전 동기간 비교 없음</span>;
  }
  const delta = percent ? (current - previous) * 100 : current - previous;
  const prefix = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return (
    <span>
      직전 동기간 {prefix}
      {Math.abs(delta).toLocaleString("ko-KR", {
        maximumFractionDigits: 1,
      })}
      {percent ? "%p" : ""}
    </span>
  );
}

function MetricInfoLabel({ detail, label }: { detail: string; label: string }) {
  return (
    <div className={`${opsTheme.eyebrow} flex items-center gap-0.5`}>
      <span>{label}</span>
      <Tooltips side="top" text={detail}>
        <MuteButton
          aria-label={`${label} 설명`}
          className="-my-1"
          size="sm"
          variant="transparent"
        >
          <Info className="h-3 w-3" aria-hidden />
        </MuteButton>
      </Tooltips>
    </div>
  );
}

function MetricCell({
  children,
  current,
  detail,
  label,
  percentDelta = false,
  previous,
}: {
  children: React.ReactNode;
  current?: number | null;
  detail: string;
  label: string;
  percentDelta?: boolean;
  previous?: number | null;
}) {
  return (
    <div className="min-w-0 px-1 py-4 md:px-5">
      <MetricInfoLabel detail={detail} label={label} />
      <div className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-neutral-primary">
        {children}
      </div>
      <div className="mt-3 text-[11px] text-neutral-soft">
        <Delta current={current} percent={percentDelta} previous={previous} />
      </div>
    </div>
  );
}

function MetricRow({
  children,
  columns = 5,
}: {
  children: React.ReactNode;
  columns?: 4 | 5;
}) {
  return (
    <div
      className={cx(
        "grid border-t border-neutral-1000-a05 md:grid-cols-2 md:divide-x md:divide-neutral-1000-a05",
        columns === 4 ? "xl:grid-cols-4" : "xl:grid-cols-5"
      )}
    >
      {children}
    </div>
  );
}

function SectionState({
  error,
  label,
  onRetry,
}: {
  error: Error | null;
  label: string;
  onRetry: () => void;
}) {
  if (!error) {
    return (
      <div className="flex min-h-40 items-center justify-center border-b border-neutral-1000-a05 text-sm text-neutral-muted">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        {label} 집계 중
      </div>
    );
  }
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-3 border-b border-critical/25 py-5 text-sm text-critical">
      <span>{error.message}</span>
      <MuteButton onClick={onRetry} size="sm" variant="transparent">
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />이 영역 다시 불러오기
      </MuteButton>
    </div>
  );
}

export default function OpsTalentMetricsWorkspace() {
  const from = useOpsTalentMetricsFilterStore((state) => state.from);
  const hasHydratedFilters = useOpsTalentMetricsFilterStore(
    (state) => state.hasHydrated
  );
  const interval = useOpsTalentMetricsFilterStore((state) => state.interval);
  const setDateRange = useOpsTalentMetricsFilterStore(
    (state) => state.setDateRange
  );
  const setInterval = useOpsTalentMetricsFilterStore(
    (state) => state.setInterval
  );
  const setQuickRange = useOpsTalentMetricsFilterStore(
    (state) => state.setQuickRange
  );
  const to = useOpsTalentMetricsFilterStore((state) => state.to);
  const authLoading = useAuthStore((state) => state.loading);
  const userEmail = useAuthStore((state) => state.user?.email);
  const exclusionTerms = useOpsInternalDataExclusionStore(
    (state) => state.emailExclusionTerms
  );
  const canFetch =
    !authLoading &&
    hasHydratedFilters &&
    Boolean(from && to) &&
    isInternalEmail(userEmail);
  const queries = useOpsTalentMetrics(canFetch, {
    excludedEmails: exclusionTerms,
    from,
    interval,
    to,
  });
  const conversion = queries.conversion.data;
  const engagement = queries.engagement.data;
  const retention = queries.retention.data;
  const isFetching =
    queries.conversion.isFetching ||
    queries.engagement.isFetching ||
    queries.retention.isFetching;
  const sourceLimitReached =
    conversion?.sourceLimitReached ||
    engagement?.sourceLimitReached ||
    retention?.sourceLimitReached;

  useEffect(() => {
    if (!hasHydratedFilters || (from && to)) return;
    setQuickRange(90);
  }, [from, hasHydratedFilters, setQuickRange, to]);

  const refreshAll = () => {
    void Promise.all([
      queries.conversion.refetch(),
      queries.engagement.refetch(),
      queries.retention.refetch(),
    ]);
  };

  return (
    <div className="space-y-0">
      <header className="border-b border-neutral-1000-a05 pb-5 pt-2">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className={opsTheme.eyebrow}>System · Talent</div>
            <h1 className="mt-1 font-hedvig text-[2rem] leading-none tracking-[-0.06em] text-neutral-primary">
              Talent 지표
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-muted">
              활동량보다 실제 양면 연결을 중심에 두고, 같은 기간의
              대화·유지·추천·온보딩 지표로 변화를 설명합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_RANGE_DAYS.map((days) => (
              <MuteButton
                key={days}
                onClick={() => setQuickRange(days)}
                size="sm"
                variant="transparent"
              >
                {days}일
              </MuteButton>
            ))}
            <OpsDateRangeFilter
              activeButtonClassName="border-neutral-1000-a10 bg-transparent text-neutral-primary"
              emptyLabel="기간 선택"
              from={from}
              inactiveButtonClassName="border-neutral-1000-a10 bg-transparent text-neutral-muted hover:text-neutral-primary"
              onChange={(nextFrom, nextTo) => {
                if (!nextFrom || !nextTo) return;
                setDateRange(nextFrom, nextTo);
              }}
              to={to}
            />
            <Tabs
              activeValue={interval}
              className="w-fit"
              items={[
                { label: "일", value: "day" },
                { label: "주", value: "week" },
                { label: "월", value: "month" },
              ]}
              onValueChange={(value) =>
                setInterval(value as OpsTalentMetricInterval)
              }
              size="small"
              variant="borderless"
            />
            <MuteButton
              aria-label="지표 새로고침"
              disabled={!canFetch}
              onClick={refreshAll}
              variant="transparent"
            >
              <RefreshCw
                className={cx("h-4 w-4", isFetching && "animate-spin")}
              />
            </MuteButton>
          </div>
        </div>
      </header>

      {isFetching ? (
        <div className="h-0.5 w-full overflow-hidden bg-bg-weak">
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      ) : null}
      {sourceLimitReached ? (
        <div className="flex items-center gap-2 border-b border-info/25 py-3 text-xs text-neutral-muted">
          <AlertTriangle className="h-4 w-4 shrink-0 text-info" />
          일부 원천 행이 조회 한도에 도달했습니다. 기간을 줄여 다시 확인해
          주세요.
        </div>
      ) : null}

      {conversion ? (
        <>
          <section className="grid border-b border-neutral-1000-a05 lg:grid-cols-[minmax(0,1.35fr)_minmax(420px,1fr)] lg:divide-x lg:divide-neutral-1000-a05">
            <div className="py-7 pr-0 lg:pr-8">
              <MetricInfoLabel
                detail="선택 기간에 상호 연결 단계로 들어간 고유 talent 수를, 같은 기간의 서비스 가능 시간을 90일 단위 talent 수로 환산한 값으로 나눈 뒤 100을 곱합니다."
                label="검증된 연결 산출률"
              />
              <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
                <span className="text-[48px] font-semibold leading-none tracking-[-0.07em] text-neutral-primary">
                  {formatNumber(
                    conversion.summary
                      .verifiedConnectionYieldPer100TalentQuarters,
                    2
                  )}
                </span>
                <span className="pb-1 text-sm font-medium text-neutral-muted">
                  / talent 100명·분기
                </span>
              </div>
              <div className="mt-3 text-xs text-neutral-soft">
                <Delta
                  current={
                    conversion.summary
                      .verifiedConnectionYieldPer100TalentQuarters
                  }
                  previous={
                    conversion.comparison
                      .verifiedConnectionYieldPer100TalentQuarters
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-neutral-1000-a05 py-7 lg:pl-8">
              <div className="pr-4">
                <MetricInfoLabel
                  detail="현재 internal 추천을 받을 수 있고 프로필 공유가 허용되어 있으며, 선택 기간 종료 전 온보딩을 완료한 고유 talent입니다."
                  label="서비스 가능"
                />
                <div className="mt-2 text-2xl font-semibold tabular-nums text-neutral-primary">
                  {conversion.summary.serviceReadyTalentCount.toLocaleString(
                    "ko-KR"
                  )}
                </div>
              </div>
              <div className="px-4">
                <MetricInfoLabel
                  detail="선택 기간에 후보자 수락과 Harper 확인을 거쳐 연결 대기 단계에 처음 들어간 고유 talent입니다."
                  label="연결 대기"
                />
                <div className="mt-2 text-2xl font-semibold tabular-nums text-neutral-primary">
                  {conversion.summary.pendingConnectionTalentCount.toLocaleString(
                    "ko-KR"
                  )}
                </div>
              </div>
              <div className="pl-4">
                <MetricInfoLabel
                  detail="선택 기간에 회사와 talent가 모두 수락해 실제 연결 단계에 들어간 고유 talent입니다."
                  label="상호 연결"
                />
                <div className="mt-2 text-2xl font-semibold tabular-nums text-primary">
                  {conversion.summary.connectedTalentCount.toLocaleString(
                    "ko-KR"
                  )}
                </div>
              </div>
            </div>
          </section>

          <section aria-label="Talent 전환 지표">
            <MetricRow columns={4}>
              <MetricCell
                current={conversion.summary.recommendationAcceptRejectRatio}
                detail={`선택 기간의 최신 명시적 결정 기준으로 ${conversion.summary.recommendationAcceptedCount.toLocaleString("ko-KR")}건 수락 / ${conversion.summary.recommendationRejectedCount.toLocaleString("ko-KR")}건 거절입니다. 표시값은 거절 1건당 수락 건수입니다.`}
                label="추천 수락 : 거절"
                previous={conversion.comparison.recommendationAcceptRejectRatio}
              >
                {formatRatio(conversion.summary)}
              </MetricCell>
              <MetricCell
                current={conversion.summary.internalAcceptanceRate}
                detail={`14일 이상 성숙한 internal 추천 ${conversion.summary.internalAcceptedCount.toLocaleString("ko-KR")} / ${conversion.summary.internalMaturedRecommendationCount.toLocaleString("ko-KR")}쌍`}
                label="Internal 매칭 수락률"
                percentDelta
                previous={conversion.comparison.internalAcceptanceRate}
              >
                {formatPercent(conversion.summary.internalAcceptanceRate)}
              </MetricCell>
              <MetricCell
                current={conversion.summary.pendingConnectionTalentCount}
                detail="후보자 수락과 Harper 확인을 거쳐 연결 대기에 처음 진입한 고유 talent"
                label="연결 대기 진입"
                previous={conversion.comparison.pendingConnectionTalentCount}
              >
                {conversion.summary.pendingConnectionTalentCount.toLocaleString(
                  "ko-KR"
                )}
              </MetricCell>
              <MetricCell
                current={conversion.summary.onboardingCompletionRate}
                detail={`가입 후 14일이 지난 cohort ${conversion.summary.onboardingCompletedWithin14DaysCount.toLocaleString("ko-KR")} / ${conversion.summary.onboardingMaturedSignupCount.toLocaleString("ko-KR")}명`}
                label="온보딩 14일 완료율"
                percentDelta
                previous={conversion.comparison.onboardingCompletionRate}
              >
                {formatPercent(conversion.summary.onboardingCompletionRate)}
              </MetricCell>
            </MetricRow>
          </section>
          <ConversionCharts trend={conversion.trend} />
        </>
      ) : (
        <SectionState
          error={
            queries.conversion.error instanceof Error
              ? queries.conversion.error
              : null
          }
          label="연결·전환 지표"
          onRetry={() => void queries.conversion.refetch()}
        />
      )}

      {engagement ? (
        <>
          <section aria-label="Talent 활동 지표">
            <MetricRow>
              <MetricCell
                current={engagement.summary.messageCount}
                detail={`선택 기간에 talent가 보낸 user 역할 메시지의 전체 개수입니다. 발신 talent는 ${engagement.summary.messageSenderCount.toLocaleString("ko-KR")}명입니다.`}
                label="사용자 메시지"
                previous={engagement.comparison.messageCount}
              >
                {formatNumber(engagement.summary.messageCount, 0)}
              </MetricCell>
              <MetricCell
                current={engagement.summary.messageCharacterCount}
                detail="선택 기간에 talent가 보낸 user 역할 메시지 본문의 Unicode 글자 수 합계입니다. 가입 이후 누적값이 아닙니다."
                label="사용자 메시지 글자"
                previous={engagement.comparison.messageCharacterCount}
              >
                {formatNumber(engagement.summary.messageCharacterCount, 0)}
              </MetricCell>
              <MetricCell
                current={engagement.summary.interactionTalentCount}
                detail="메시지, Career 행동, 추천 열람·클릭·피드백 고유 talent"
                label="상호작용 talent"
                previous={engagement.comparison.interactionTalentCount}
              >
                {engagement.summary.interactionTalentCount.toLocaleString(
                  "ko-KR"
                )}
              </MetricCell>
              <MetricCell
                current={engagement.summary.dau}
                detail="선택 기간의 마지막 KST 날짜에 활동한 고유 talent"
                label="DAU"
                previous={engagement.comparison.dau}
              >
                {engagement.summary.dau.toLocaleString("ko-KR")}
              </MetricCell>
              <MetricCell
                current={engagement.summary.wau}
                detail="마지막 KST 날짜를 포함한 최근 7개 날짜의 고유 활성 talent"
                label="WAU"
                previous={engagement.comparison.wau}
              >
                {engagement.summary.wau.toLocaleString("ko-KR")}
              </MetricCell>
            </MetricRow>
          </section>
          <EngagementCharts
            dailyActivity={engagement.dailyActivity}
            retention={engagement.retention}
            trend={engagement.trend}
          />
        </>
      ) : (
        <SectionState
          error={
            queries.engagement.error instanceof Error
              ? queries.engagement.error
              : null
          }
          label="메시지·활동 지표"
          onRetry={() => void queries.engagement.refetch()}
        />
      )}

      {retention ? (
        <RetentionTable cohorts={retention.weeklyRetentionCohorts} />
      ) : (
        <SectionState
          error={
            queries.retention.error instanceof Error
              ? queries.retention.error
              : null
          }
          label="주간 리텐션"
          onRetry={() => void queries.retention.refetch()}
        />
      )}
    </div>
  );
}
