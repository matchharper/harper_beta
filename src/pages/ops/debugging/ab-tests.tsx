import { useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import {
  DebuggingPageShell,
  formatAbsoluteKst,
  useCanFetchInternal,
} from "@/components/ops/debugging/shared";
import { cx, opsTheme } from "@/components/ops/theme";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { Tooltips } from "@/components/ui/tooltip";
import { useOpsAbTests } from "@/hooks/ops/useOpsAbTests";
import type {
  OpsAbTestMetric,
  OpsAbTestSummary,
  OpsAbTestVariant,
} from "@/lib/ops/abTests";
import { useOpsInternalDataExclusionStore } from "@/store/useOpsInternalDataExclusionStore";

const DAY_OPTIONS = [7, 14, 30, 60, 90] as const;

function formatPercent(value: number | null, digits = 1) {
  return value === null ? "-" : `${(value * 100).toFixed(digits)}%`;
}

function formatSignedPercentagePoint(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value * 100).toFixed(1)}%p`;
}

function formatDuration(value: number | null) {
  if (value === null) return "-";
  const rounded = Math.max(0, Math.round(value));
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

function formatMetric(metric: OpsAbTestMetric) {
  if (metric.value === null) return "-";
  if (metric.format === "rate") return formatPercent(metric.value);
  if (metric.format === "duration_seconds") return formatDuration(metric.value);
  if (metric.format === "number") return metric.value.toFixed(1);
  return Math.round(metric.value).toLocaleString();
}

function formatDifference(metric: OpsAbTestMetric, difference: number) {
  const magnitude = Math.abs(difference);
  if (metric.format === "rate") {
    return formatSignedPercentagePoint(magnitude).replace("+", "");
  }
  if (metric.format === "duration_seconds") return formatDuration(magnitude);
  if (metric.format === "number") return magnitude.toFixed(1);
  return Math.round(magnitude).toLocaleString();
}

function getDifferenceLabel(
  metric: OpsAbTestMetric,
  firstValue: number | null,
  secondValue: number | null
) {
  if (firstValue === null || secondValue === null) return "비교 대기";
  const difference = secondValue - firstValue;
  const equalityThreshold = metric.format === "rate" ? 0.0005 : 0.05;
  if (Math.abs(difference) < equalityThreshold) return "동일";
  return `${difference > 0 ? "B" : "A"} ${formatDifference(
    metric,
    difference
  )} 높음`;
}

function ConclusionBadge({ experiment }: { experiment: OpsAbTestSummary }) {
  const state = experiment.conclusion.state;
  const props: Pick<BadgeProps, "tone" | "variant"> =
    state === "leader"
      ? { tone: "positive", variant: "faded" }
      : state === "no_clear_difference"
        ? { tone: "warning", variant: "faded" }
        : { tone: "neutral", variant: "solid" };
  return (
    <Badge {...props} size="sm">
      {state === "leader"
        ? "차이 확인"
        : state === "no_clear_difference"
          ? "결론 보류"
          : "수집 중"}
    </Badge>
  );
}

function getConclusionHeadline(experiment: OpsAbTestSummary) {
  if (experiment.conclusion.state === "collecting") return "표본 수집 중";
  if (experiment.conclusion.state === "no_clear_difference") {
    return "아직 뚜렷한 차이 없음";
  }
  return `${
    experiment.variants.find(
      (variant) => variant.id === experiment.conclusion.leaderVariantId
    )?.label ?? "우세 그룹"
  } 우세`;
}

function getConfidenceRange(experiment: OpsAbTestSummary) {
  const { confidenceHigh, confidenceLow } = experiment.conclusion;
  if (confidenceLow === null || confidenceHigh === null) return null;
  return `B−A 95% 구간 ${formatSignedPercentagePoint(confidenceLow)} ~ ${formatSignedPercentagePoint(confidenceHigh)}`;
}

function ComparisonDonut({
  centerLabel,
  firstMetric,
  secondMetric,
  size = "default",
}: {
  centerLabel: string;
  firstMetric: OpsAbTestMetric;
  secondMetric: OpsAbTestMetric;
  size?: "default" | "large";
}) {
  const firstValue = Math.max(0, firstMetric.value ?? 0);
  const secondValue = Math.max(0, secondMetric.value ?? 0);
  const total = firstValue + secondValue;
  const firstShare = total > 0 ? firstValue / total : 0;
  const secondShare = total > 0 ? secondValue / total : 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const gap = total > 0 ? 3 : 0;
  const firstLength = Math.max(0, firstShare * circumference - gap);
  const secondLength = Math.max(0, secondShare * circumference - gap);
  const sizeClass =
    size === "large"
      ? "size-[142px] sm:size-[178px]"
      : "size-[96px] sm:size-[108px]";
  const centerClass = size === "large" ? "text-[14px]" : "text-[12px]";

  return (
    <div
      aria-label={`A ${formatMetric(firstMetric)}, B ${formatMetric(
        secondMetric
      )}, ${centerLabel}`}
      className={cx("relative shrink-0", sizeClass)}
      role="img"
    >
      <svg aria-hidden="true" className="size-full" viewBox="0 0 100 100">
        <circle
          className="fill-none stroke-neutral-100"
          cx="50"
          cy="50"
          r={radius}
          strokeWidth="7"
        />
        {total > 0 ? (
          <>
            <circle
              className="fill-none stroke-action transition-[stroke-dasharray] duration-500"
              cx="50"
              cy="50"
              r={radius}
              strokeDasharray={`${firstLength} ${circumference - firstLength}`}
              strokeWidth="8"
              transform="rotate(-90 50 50)"
            />
            <circle
              className="fill-none stroke-primary transition-[stroke-dasharray,stroke-dashoffset] duration-500"
              cx="50"
              cy="50"
              r={radius}
              strokeDasharray={`${secondLength} ${circumference - secondLength}`}
              strokeDashoffset={-(firstShare * circumference)}
              strokeWidth="8"
              transform="rotate(-90 50 50)"
            />
          </>
        ) : null}
      </svg>
      <div
        aria-hidden="true"
        className="absolute inset-[18%] flex items-center justify-center text-center"
      >
        <span
          className={cx(
            "font-normal leading-[1.25] text-neutral-primary tabular-nums",
            centerClass
          )}
        >
          {centerLabel}
        </span>
      </div>
    </div>
  );
}

function VariantValue({
  index,
  unitLabel,
  variant,
}: {
  index: 0 | 1;
  unitLabel: string;
  variant: OpsAbTestVariant;
}) {
  return (
    <div className={cx("min-w-0", index === 0 ? "text-right" : "text-left")}>
      <div
        className={cx(
          "flex items-center gap-1.5",
          index === 0 ? "justify-end" : "justify-start"
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            "size-2 rounded-full",
            index === 0 ? "order-2 bg-action" : "bg-primary"
          )}
        />
        <Text className="font-normal" tone="subtle" variant="subtle">
          {variant.label}
        </Text>
      </div>
      <div className="mt-1 text-[24px] font-normal leading-none tracking-[-0.04em] text-neutral-primary tabular-nums sm:text-[30px]">
        {formatPercent(variant.primary.rate)}
      </div>
      <Text className="mt-0.5 tabular-nums" tone="subtle" variant="subtle">
        {variant.primary.numerator.toLocaleString()} /{" "}
        {variant.primary.denominator.toLocaleString()} {unitLabel}
      </Text>
    </div>
  );
}

function PrimaryComparison({ experiment }: { experiment: OpsAbTestSummary }) {
  const [first, second] = experiment.variants;
  const primaryMetric: OpsAbTestMetric = {
    format: "rate",
    label: experiment.primaryMetricLabel,
    value: first.primary.rate,
  };
  const secondPrimaryMetric: OpsAbTestMetric = {
    format: "rate",
    label: experiment.primaryMetricLabel,
    value: second.primary.rate,
  };
  const differenceLabel = getDifferenceLabel(
    primaryMetric,
    first.primary.rate,
    second.primary.rate
  );
  const confidenceRange = getConfidenceRange(experiment);

  return (
    <section className="mt-5 border-y border-neutral-1000-a05 py-5 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ConclusionBadge experiment={experiment} />
          <Text tone="muted" variant="subtle">
            1차 지표 · {experiment.primaryMetricLabel}
          </Text>
        </div>
      </div>

      <div className="mx-auto mt-5 grid max-w-[720px] grid-cols-[minmax(0,1fr)_142px_minmax(0,1fr)] items-center gap-x-2 sm:grid-cols-[minmax(0,1fr)_178px_minmax(0,1fr)] sm:gap-x-6">
        <VariantValue
          index={0}
          unitLabel={experiment.unitLabel}
          variant={first}
        />
        <ComparisonDonut
          centerLabel={differenceLabel}
          firstMetric={primaryMetric}
          secondMetric={secondPrimaryMetric}
          size="large"
        />
        <VariantValue
          index={1}
          unitLabel={experiment.unitLabel}
          variant={second}
        />
      </div>

      <Text className="mt-4 text-center" tone="subtle" variant="subtle">
        {getConclusionHeadline(experiment)}
      </Text>

      {confidenceRange ? (
        <Text
          className="mt-4 text-center tabular-nums"
          tone="subtle"
          variant="subtle"
        >
          {confidenceRange}
        </Text>
      ) : null}
    </section>
  );
}

function MetricComparison({
  firstMetric,
  secondMetric,
}: {
  firstMetric: OpsAbTestMetric;
  secondMetric: OpsAbTestMetric;
}) {
  const differenceLabel = getDifferenceLabel(
    firstMetric,
    firstMetric.value,
    secondMetric.value
  );
  return (
    <div className="rounded-md border border-neutral-1000-a05 bg-bg-floating p-4">
      <div>
        <Text className="font-normal" variant="body">
          {firstMetric.label}
        </Text>
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_108px_minmax(0,1fr)] items-center gap-2">
        <div className="text-right">
          <Text className="font-normal text-action" variant="subtle">
            A
          </Text>
          <Text className="mt-1 font-normal tabular-nums" variant="body">
            {formatMetric(firstMetric)}
          </Text>
        </div>
        <ComparisonDonut
          centerLabel={differenceLabel}
          firstMetric={firstMetric}
          secondMetric={secondMetric}
        />
        <div className="text-left">
          <Text className="font-normal text-primary" variant="subtle">
            B
          </Text>
          <Text className="mt-1 font-normal tabular-nums" variant="body">
            {formatMetric(secondMetric)}
          </Text>
        </div>
      </div>
    </div>
  );
}

function DetailMetricComparisons({
  variants,
}: {
  variants: [OpsAbTestVariant, OpsAbTestVariant];
}) {
  const [first, second] = variants;
  const comparisons = first.metrics.flatMap((firstMetric) => {
    const secondMetric = second.metrics.find(
      (metric) =>
        metric.label === firstMetric.label &&
        metric.format === firstMetric.format
    );
    return secondMetric ? [{ firstMetric, secondMetric }] : [];
  });

  if (comparisons.length === 0) return null;

  return (
    <section className="mt-5">
      <Text as="h3" className="font-normal" variant="body">
        세부 지표
      </Text>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {comparisons.map(({ firstMetric, secondMetric }) => (
          <MetricComparison
            key={`${firstMetric.label}:${firstMetric.format}`}
            firstMetric={firstMetric}
            secondMetric={secondMetric}
          />
        ))}
      </div>
    </section>
  );
}

function ExperimentCard({ experiment }: { experiment: OpsAbTestSummary }) {
  return (
    <article className={cx(opsTheme.panel, "p-4 sm:p-5")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Text as="h2" className="font-normal" variant="head2">
              {experiment.title}
            </Text>
            <Badge size="sm" tone="positive" variant="faded">
              진행 중
            </Badge>
          </div>
          <Text className="mt-1 font-mono" tone="subtle" variant="subtle">
            {experiment.id}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Badge size="sm" variant="subtle">
            {experiment.allocation}
          </Badge>
          <Tooltips text={experiment.caveat} side="left">
            <MuteButton
              aria-label={`${experiment.title} 지표 설명`}
              className="h-6 w-6 p-0 text-neutral-soft"
              size="sm"
              type="button"
              variant="transparent"
            >
              <Info className="h-3.5 w-3.5" />
            </MuteButton>
          </Tooltips>
        </div>
      </div>

      <PrimaryComparison experiment={experiment} />
      <DetailMetricComparisons variants={experiment.variants} />

      <div className="mt-3 flex flex-wrap justify-between gap-2 px-1">
        <Text tone="subtle" variant="subtle">
          첫 관측 {formatAbsoluteKst(experiment.firstObservedAt)}
        </Text>
        <Text tone="subtle" variant="subtle">
          최근 관측 {formatAbsoluteKst(experiment.lastObservedAt)}
        </Text>
      </div>
    </article>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[0, 1].map((item) => (
        <div
          key={item}
          className={cx(opsTheme.panel, "animate-pulse space-y-4 p-5")}
        >
          <div className="h-5 w-44 rounded bg-neutral-1000-a05" />
          <div className="h-28 rounded-md bg-neutral-1000-a05" />
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="h-48 rounded-md bg-neutral-1000-a05" />
            <div className="h-48 rounded-md bg-neutral-1000-a05" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OpsAbTestsPage() {
  const canFetch = useCanFetchInternal();
  const excludedEmails = useOpsInternalDataExclusionStore(
    (state) => state.emailExclusionTerms
  );
  const [days, setDays] = useState(30);
  const query = useOpsAbTests({ days, enabled: canFetch, excludedEmails });
  const experiments = query.data?.experiments ?? [];
  const clearResultCount = experiments.filter(
    (experiment) => experiment.conclusion.state === "leader"
  ).length;

  const filters = (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Select
        value={String(days)}
        onValueChange={(value) => setDays(Number(value))}
      >
        <SelectTrigger size="sm" className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DAY_OPTIONS.map((option) => (
            <SelectItem key={option} value={String(option)}>
              최근 {option}일
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <MuteButton
        aria-label="새로고침"
        size="sm"
        variant="transparent"
        onClick={() => void query.refetch()}
      >
        <RefreshCw
          className={cx("h-3.5 w-3.5", query.isFetching && "animate-spin")}
        />
      </MuteButton>
      {query.data ? (
        <Text tone="subtle" variant="subtle">
          {formatAbsoluteKst(query.data.generatedAt)} 기준
        </Text>
      ) : null}
    </div>
  );

  return (
    <DebuggingPageShell
      filters={filters}
      showContextLabel={false}
      showDescription={false}
      tab="abTests"
    >
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <div className={opsTheme.errorNotice}>
          {query.error instanceof Error
            ? query.error.message
            : "A/B Test를 불러오지 못했습니다."}
        </div>
      ) : (
        <>
          <section className="grid gap-2 sm:grid-cols-3">
            <div className={cx(opsTheme.panel, "p-4")}>
              <Text tone="subtle" variant="subtle">
                진행 중
              </Text>
              <div className="mt-2 text-2xl font-normal tabular-nums text-neutral-primary">
                {experiments.length}
              </div>
            </div>
            <div className={cx(opsTheme.panel, "p-4")}>
              <Text tone="subtle" variant="subtle">
                차이 확인
              </Text>
              <div className="mt-2 text-2xl font-normal tabular-nums text-positive">
                {clearResultCount}
              </div>
            </div>
            <div className={cx(opsTheme.panel, "p-4")}>
              <Text tone="subtle" variant="subtle">
                결론 보류
              </Text>
              <div className="mt-2 text-2xl font-normal tabular-nums text-info">
                {experiments.length - clearResultCount}
              </div>
            </div>
          </section>

          <div className="space-y-3">
            {experiments.map((experiment) => (
              <ExperimentCard key={experiment.id} experiment={experiment} />
            ))}
          </div>
        </>
      )}
    </DebuggingPageShell>
  );
}
