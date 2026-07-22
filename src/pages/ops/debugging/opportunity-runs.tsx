import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
} from "lucide-react";
import { OpsDateRangeFilter } from "@/components/ops/OpsDateRangeFilter";
import { formatKstRelativeDateTime } from "@/components/ops/dateUtils";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import {
  Select as UiSelect,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltips } from "@/components/ui/tooltip";
import { useOpsDebugOpportunityRuns } from "@/hooks/ops/useOpsDebugOpportunityRuns";
import type {
  OpsDebugOpportunityRunItem,
  OpsDebugOpportunityRunOutcome,
  OpsDebugOpportunityRunsResponse,
} from "@/lib/ops/debugOpportunityRunServer";
import {
  DebuggingPageShell,
  OPPORTUNITY_RUN_FETCH_LIMIT,
  SourceLimitNotice,
  StatTile,
  formatAbsoluteKst,
  formatDateOnlyKst,
  useCanFetchInternal,
} from "@/components/ops/debugging/shared";

const OPPORTUNITY_RUN_OUTCOME_OPTIONS = [
  { id: "all", label: "전체 결과" },
  { id: "sent", label: "발송됨" },
  { id: "skipped", label: "스킵" },
  { id: "partial", label: "Partial" },
  { id: "failed", label: "실패" },
  { id: "recommend_only", label: "추천만 저장" },
  { id: "running", label: "진행중" },
  { id: "queued", label: "대기" },
  { id: "no_action", label: "액션 없음" },
] as const satisfies readonly {
  id: OpsDebugOpportunityRunOutcome;
  label: string;
}[];

function opportunityRunOutcomeClass(outcome: string) {
  if (outcome === "sent") return "bg-positive-faded text-positive";
  if (outcome === "skipped") return "bg-bg-weak text-neutral-muted";
  if (outcome === "recommend_only") return "bg-info-faded text-info";
  if (outcome === "failed") return "bg-critical-faded text-critical";
  if (outcome === "running") return "bg-info-faded text-info";
  if (outcome === "queued") return "bg-bg-weak text-neutral-soft";
  if (outcome === "partial") return "bg-info-faded text-info";
  return "bg-bg-weak text-neutral-soft";
}

function opportunityRunReviewClass(review: string) {
  if (review === "ok") return "bg-positive-faded text-positive";
  if (review === "retry") return "bg-critical-faded text-critical";
  if (review === "review") return "bg-info-faded text-info";
  if (review === "waiting") return "bg-info-faded text-info";
  return "bg-bg-weak text-neutral-muted";
}

function opportunityRunDeliveryClass(status: string) {
  if (status === "sent") return "bg-positive-faded text-positive";
  if (status === "failed") return "bg-critical-faded text-critical";
  if (status === "skipped") return "bg-bg-weak text-neutral-muted";
  return "bg-bg-weak text-neutral-soft";
}

function getOpportunityRunDisplayName(item: OpsDebugOpportunityRunItem) {
  return item.talent.name || item.talent.email || "이름 없음";
}

function externalRecommendationLabel(value: boolean | null) {
  if (value === true) return "오픈 포지션 받음";
  if (value === false) return "오픈 포지션 안받음";
  return "오픈 포지션 설정 없음";
}

function externalRecommendationClass(value: boolean | null) {
  if (value === true) return "bg-positive-faded text-positive";
  if (value === false) return "bg-bg-weak text-neutral-muted";
  return "bg-critical-faded text-critical";
}

function formatNullableBoolean(value: boolean | null) {
  if (value === true) return "true";
  if (value === false) return "false";
  return "값 없음";
}

function buildExternalRecommendationTooltip(item: OpsDebugOpportunityRunItem) {
  return [
    `회원가입: ${formatDateOnlyKst(item.talent.createdAt)}`,
    `최근 로그인: ${formatAbsoluteKst(item.talent.lastLoginAt)} KST`,
    `최근 action: ${formatAbsoluteKst(item.talent.latestActionAt)} KST`,
    `표시값: ${externalRecommendationLabel(
      item.talent.getExternalRecommendation
    )}`,
    `현재 talent_setting.get_external_recommendation: ${formatNullableBoolean(
      item.talent.getExternalRecommendationCurrent
    )}`,
    `run settings_snapshot.getExternalRecommendation: ${formatNullableBoolean(
      item.talent.getExternalRecommendationRunSnapshot
    )}`,
    item.talent.getExternalRecommendationUpdatedAt
      ? `설정 업데이트: ${formatAbsoluteKst(
          item.talent.getExternalRecommendationUpdatedAt
        )} KST`
      : null,
    "true면 외부 공개 오픈 포지션 추천을 받는 상태이고, false면 받지 않는 상태입니다.",
  ]
    .filter(Boolean)
    .join("\n");
}

function getRecommendationSourceType(
  recommendation: OpsDebugOpportunityRunItem["recommendations"][number]
) {
  const sourceType = recommendation.sourceType?.toLowerCase();
  if (sourceType === "internal" || sourceType === "external") {
    return sourceType;
  }
  const opportunityType = recommendation.opportunityType?.toLowerCase();
  if (
    opportunityType === "internal_recommendation" ||
    opportunityType === "intro_request"
  ) {
    return "internal";
  }
  return "external";
}

function countRecommendationSources(item: OpsDebugOpportunityRunItem) {
  return item.recommendations.reduce(
    (counts, recommendation) => {
      counts[getRecommendationSourceType(recommendation)] += 1;
      return counts;
    },
    { external: 0, internal: 0 }
  );
}

function StatSubRow({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px] text-neutral-muted">
      <span>{label}</span>
      <span className="font-mono font-semibold text-neutral-primary">
        {value}
      </span>
    </div>
  );
}

function SentStatsTile({
  stats,
}: {
  stats: OpsDebugOpportunityRunsResponse["stats"] | null;
}) {
  return (
    <StatTile label="발송 수" value={stats?.emailSentCount ?? "-"}>
      <StatSubRow
        label="External 추천 수"
        value={stats?.externalRecommendationSentCount ?? "-"}
      />
      <StatSubRow
        label="Internal 추천 수"
        value={stats?.internalRecommendationSentCount ?? "-"}
      />
      <StatSubRow
        label="추천 없는 메일 발송"
        value={stats?.sentWithoutRecommendationCount ?? "-"}
      />
    </StatTile>
  );
}

function UserStatusTags({ item }: { item: OpsDebugOpportunityRunItem }) {
  const tags = [
    item.talent.hasSubmittedMaterial ? null : "제출 미완료",
    item.talent.isOnboardingDone ? null : "온보딩 미완료",
  ].filter(Boolean) as string[];

  if (tags.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex rounded bg-critical-faded px-1.5 py-0.5 text-[10px] font-semibold text-critical"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function RecommendationSummaryCell({
  item,
}: {
  item: OpsDebugOpportunityRunItem;
}) {
  const counts = countRecommendationSources(item);

  return (
    <div>
      <div className="text-xs font-semibold tabular-nums text-neutral-primary">
        {item.recommendationCount}개
      </div>
      {item.recommendationCount > 0 ? (
        <div className="mt-2 flex flex-col gap-1">
          {counts.external > 0 ? (
            <span className="rounded bg-bg-weak px-1.5 py-0.5 text-[10px] font-semibold text-neutral-muted">
              Ext {counts.external}
            </span>
          ) : null}
          {counts.internal > 0 ? (
            <span className="rounded bg-positive-faded px-1.5 py-0.5 text-[10px] font-semibold text-positive">
              Int {counts.internal}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="mt-1 text-[11px] text-neutral-soft">없음</div>
      )}
    </div>
  );
}

function SelectedActionCell({ item }: { item: OpsDebugOpportunityRunItem }) {
  if (item.selectedActionLabels.length === 0) {
    return <span className="text-xs text-neutral-soft">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {item.selectedActionLabels.map((label) => (
        <span
          key={label}
          className="inline-flex max-w-full rounded bg-bg-weak px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-neutral-muted"
        >
          <span className="truncate">{label}</span>
        </span>
      ))}
    </div>
  );
}

function OpportunityRunsTable({
  error,
  hasNextPage,
  isFetching,
  isFetchingNextPage,
  isLoading,
  onFetchNextPage,
  onRefresh,
  runs,
}: {
  error: unknown;
  hasNextPage: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  onFetchNextPage: () => void;
  onRefresh: () => void;
  runs: OpsDebugOpportunityRunItem[];
}) {
  const renderChannelBadges = (item: OpsDebugOpportunityRunItem) => {
    const statuses = item.deliveries.map((delivery) => ({
      channel: delivery.channel,
      id: delivery.id,
      status: delivery.status,
    }));

    if (statuses.length === 0) {
      return <span className="text-xs text-neutral-soft">발송 없음</span>;
    }

    return (
      <div className="flex flex-wrap gap-1">
        {statuses.map((delivery) => (
          <span
            key={delivery.id || `${delivery.channel}-${delivery.status}`}
            className={cx(
              "inline-flex rounded px-2 py-0.5 text-[11px] font-medium",
              opportunityRunDeliveryClass(delivery.status)
            )}
          >
            {delivery.channel} {delivery.status}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className={cx(opsTheme.panel, "overflow-hidden")}>
      <div className="flex items-center justify-between gap-3 border-b border-neutral-1000-a05 px-4 py-3">
        <div>
          <div className={opsTheme.eyebrow}>Runs</div>
          <div className="mt-1 text-sm text-neutral-muted">
            {runs.length}개 로드됨
          </div>
        </div>
        <BareButton
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary disabled:opacity-50"
          aria-label="새로고침"
        >
          <RefreshCw
            className={cx("h-4 w-4", isFetching ? "animate-spin" : "")}
          />
        </BareButton>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
        </div>
      ) : error ? (
        <div className="p-4">
          <div className={opsTheme.errorNotice}>
            {error instanceof Error
              ? error.message
              : "opportunity run을 불러오지 못했습니다."}
          </div>
        </div>
      ) : runs.length === 0 ? (
        <div className="px-4 py-20 text-center">
          <BriefcaseBusiness className="mx-auto h-6 w-6 text-neutral-soft" />
          <div className="mt-3 text-sm font-medium text-neutral-primary">
            조건에 맞는 run이 없습니다.
          </div>
          <div className="mt-1 text-sm text-neutral-muted">
            날짜, 결과, 검색어를 바꿔보세요.
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-[1500px] table-fixed border-collapse text-left text-sm">
              <thead className="bg-bg-weak/70 text-[11px] uppercase tracking-[0.06em] text-neutral-soft">
                <tr>
                  <th className="w-[130px] px-4 py-3 font-medium">시간</th>
                  <th className="w-[270px] px-4 py-3 font-medium">유저</th>
                  <th className="w-[145px] px-4 py-3 font-medium">결과</th>
                  <th className="w-[165px] px-4 py-3 font-medium">액션</th>
                  <th className="w-[335px] px-4 py-3 font-medium">왜 / 맥락</th>
                  <th className="w-[92px] px-3 py-3 font-medium">추천</th>
                  <th className="w-[220px] px-4 py-3 font-medium">발송</th>
                  <th className="w-[123px] px-4 py-3 font-medium">확인</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-1000-a05">
                {runs.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-bg-weak/40">
                    <td className="px-4 py-4">
                      <div className="font-mono text-xs text-neutral-primary">
                        {formatKstRelativeDateTime(item.createdAt)}
                      </div>
                      <div className="mt-1 text-[11px] leading-4 text-neutral-soft">
                        {formatAbsoluteKst(item.createdAt)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={{
                          pathname: "/ops/career",
                          query: { userId: item.talent.userId },
                        }}
                        className="text-sm font-semibold text-neutral-primary transition hover:text-black"
                      >
                        {getOpportunityRunDisplayName(item)}
                      </Link>
                      <UserStatusTags item={item} />
                      <div className="mt-2 text-xs font-semibold leading-4 text-neutral-muted">
                        가입 {formatDateOnlyKst(item.talent.createdAt)}
                      </div>
                      <Tooltips
                        text={buildExternalRecommendationTooltip(item)}
                        side="bottom"
                      >
                        <BareButton
                          type="button"
                          className={cx(
                            "mt-1 inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold",
                            "cursor-help truncate",
                            externalRecommendationClass(
                              item.talent.getExternalRecommendation
                            )
                          )}
                        >
                          <Info className="h-3 w-3 shrink-0" aria-hidden />
                          <span className="truncate">
                            {externalRecommendationLabel(
                              item.talent.getExternalRecommendation
                            )}
                          </span>
                        </BareButton>
                      </Tooltips>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={cx(
                          "inline-flex rounded px-2 py-0.5 text-[11px] font-medium",
                          opportunityRunOutcomeClass(item.outcome.id)
                        )}
                      >
                        {item.outcome.label}
                      </span>
                      {item.status === "partial" &&
                      item.outcome.id !== "partial" ? (
                        <div className="mt-2 text-[11px] text-neutral-soft">
                          status: partial
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <SelectedActionCell item={item} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="line-clamp-2 text-xs font-medium leading-5 text-neutral-primary">
                        {item.primaryReason}
                      </div>
                      {item.deliveryMetaSummary ? (
                        <div className="mt-2 line-clamp-3 text-[11px] leading-5 text-neutral-muted">
                          {item.deliveryMetaSummary}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-4">
                      <RecommendationSummaryCell item={item} />
                    </td>
                    <td className="px-4 py-4">
                      {renderChannelBadges(item)}
                      {item.emailSubject ? (
                        <div className="mt-2 line-clamp-2 text-[11px] leading-4 text-neutral-soft">
                          {item.emailSubject}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={cx(
                          "inline-flex rounded px-2 py-0.5 text-[11px] font-medium",
                          opportunityRunReviewClass(item.reviewAction.id)
                        )}
                      >
                        {item.reviewAction.label}
                      </span>
                      {item.reviewAction.reason ? (
                        <div className="mt-2 line-clamp-3 text-[11px] leading-5 text-neutral-soft">
                          {item.reviewAction.reason}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasNextPage ? (
            <div className="flex justify-center border-t border-neutral-1000-a05 px-4 py-3">
              <BareButton
                type="button"
                onClick={onFetchNextPage}
                disabled={isFetchingNextPage}
                className={cx(opsTheme.buttonSecondary, "h-10 px-4 text-xs")}
              >
                {isFetchingNextPage ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <BriefcaseBusiness className="h-4 w-4" />
                )}
                20개 더 보기
              </BareButton>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function OpsDebuggingOpportunityRunsPage() {
  const canFetchInternal = useCanFetchInternal();
  const [runOutcome, setRunOutcome] =
    useState<OpsDebugOpportunityRunOutcome>("all");
  const [runCreatedFrom, setRunCreatedFrom] = useState("");
  const [runCreatedTo, setRunCreatedTo] = useState("");
  const [runSearchDraft, setRunSearchDraft] = useState("");
  const [runSearchQuery, setRunSearchQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRunSearchQuery(runSearchDraft.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [runSearchDraft]);

  const opportunityRunQuery = useOpsDebugOpportunityRuns(
    OPPORTUNITY_RUN_FETCH_LIMIT,
    canFetchInternal,
    {
      createdFrom: runCreatedFrom,
      createdTo: runCreatedTo,
      outcome: runOutcome,
      query: runSearchQuery,
    }
  );

  const opportunityRuns = useMemo(
    () => opportunityRunQuery.data?.pages.flatMap((page) => page.runs) ?? [],
    [opportunityRunQuery.data]
  );
  const opportunityRunStats = opportunityRunQuery.data?.pages[0]?.stats ?? null;

  const resetRunFilters = useCallback(() => {
    setRunOutcome("all");
    setRunCreatedFrom("");
    setRunCreatedTo("");
    setRunSearchDraft("");
    setRunSearchQuery("");
  }, []);

  return (
    <DebuggingPageShell
      tab="opportunityRuns"
      filters={
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
          <div>
            <label
              htmlFor="ops-debug-opportunity-run-search"
              className={opsTheme.label}
            >
              검색
            </label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
              <UiInput
                unstyled
                id="ops-debug-opportunity-run-search"
                value={runSearchDraft}
                onChange={(event) => setRunSearchDraft(event.target.value)}
                placeholder="이름, 이메일, 결과, 추천, 발송 맥락 검색"
                className={cx(opsTheme.input, "h-10 pl-9")}
              />
            </div>
          </div>

          <OpsDateRangeFilter
            emptyLabel="생성일 전체"
            from={runCreatedFrom}
            label="생성일"
            onChange={(from, to) => {
              setRunCreatedFrom(from);
              setRunCreatedTo(to);
            }}
            prefix="생성"
            to={runCreatedTo}
          />

          <div>
            <label
              htmlFor="ops-debug-opportunity-run-outcome"
              className={opsTheme.label}
            >
              결과
            </label>
            <UiSelect
              items={OPPORTUNITY_RUN_OUTCOME_OPTIONS.map((option) => ({
                label: option.label,
                value: option.id,
              }))}
              value={runOutcome}
              onValueChange={(value) =>
                setRunOutcome((value ?? "all") as OpsDebugOpportunityRunOutcome)
              }
            >
              <SelectTrigger
                id="ops-debug-opportunity-run-outcome"
                className={cx(opsTheme.input, "mt-2 h-10 min-w-[132px]")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  {OPPORTUNITY_RUN_OUTCOME_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </UiSelect>
          </div>

          <div className="flex items-end">
            <BareButton
              type="button"
              onClick={resetRunFilters}
              className={cx(opsTheme.buttonSecondary, "h-10 px-3 text-xs")}
            >
              초기화
            </BareButton>
          </div>
        </div>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="총 처리량"
          value={opportunityRunStats?.totalCount ?? "-"}
        />
        <SentStatsTile stats={opportunityRunStats} />
        <StatTile
          label="Skipped"
          value={opportunityRunStats?.skippedCount ?? "-"}
        />
        <StatTile
          label="Failed"
          value={opportunityRunStats?.failedCount ?? "-"}
        />
      </div>

      {opportunityRunStats?.sourceLimitReached ? <SourceLimitNotice /> : null}

      <OpportunityRunsTable
        error={opportunityRunQuery.error}
        hasNextPage={Boolean(opportunityRunQuery.hasNextPage)}
        isFetching={opportunityRunQuery.isFetching}
        isFetchingNextPage={opportunityRunQuery.isFetchingNextPage}
        isLoading={opportunityRunQuery.isLoading}
        onFetchNextPage={() => void opportunityRunQuery.fetchNextPage()}
        onRefresh={() => void opportunityRunQuery.refetch()}
        runs={opportunityRuns}
      />
    </DebuggingPageShell>
  );
}
