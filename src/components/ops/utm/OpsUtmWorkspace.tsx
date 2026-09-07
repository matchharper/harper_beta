import { showToast } from "@/components/toast/toast";
import { cx, opsTheme } from "@/components/ops/theme";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useOpsUtmSourceDetail, useOpsUtmSources } from "@/hooks/ops/useOpsUtm";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { isInternalEmail, canViewOpsUtm } from "@/lib/internalAccess";
import {
  buildOpsUtmUrlQuery,
  OPS_UTM_DIMENSIONS,
  parseOpsUtmUrlState,
  readOpsUtmSearchQuery,
} from "@/lib/ops/utm";
import type {
  OpsUtmChartBucket,
  OpsUtmDimension,
  OpsUtmFilters,
  OpsUtmGranularity,
  OpsUtmLandingCompositionRow,
  OpsUtmPeriod,
  OpsUtmSourceMutationResponse,
  OpsUtmSourceRow,
} from "@/lib/ops/utm";
import { useOpsInternalDataExclusionStore } from "@/store/useOpsInternalDataExclusionStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import {
  Check,
  Copy,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PERIOD_TABS = [
  { label: "최근 7일", value: "7d" },
  { label: "30일", value: "30d" },
  { label: "3개월", value: "3m" },
  { label: "12개월", value: "12m" },
] as const;

const GRANULARITY_TABS = [
  { label: "일별", value: "day" },
  { label: "주별", value: "week" },
] as const;

const UTM_DIMENSION_LABELS: Record<OpsUtmDimension, string> = {
  utm_campaign: "Campaign",
  utm_content: "Content",
  utm_medium: "Medium",
  utm_term: "Term",
};

const ALL_UTM_VALUES = "__all_utm_values__";

type EditorMode = "create" | "edit" | null;

type ChartRow = OpsUtmChartBucket & {
  landingOnly: number;
  signupOnly: number;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "기록 없음";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "기록 없음";
  return date.toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatRate = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "–"
    : `${Math.round(value * 100).toLocaleString("ko-KR")}%`;

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const signupRate = row.landing > 0 ? row.signup / row.landing : null;
  const onboardingRate =
    row.landing > 0 ? row.onboardingCompleted / row.landing : null;

  return (
    <div className="min-w-[190px] rounded-md border border-neutral-1000-a10 bg-bg-floating p-3 shadow-xl">
      <div className="text-xs font-medium text-neutral-primary">
        {row.label}
      </div>
      <div className="mt-3 space-y-2 text-xs">
        <MetricLine
          color="bg-neutral-300"
          label="Landing"
          value={row.landing}
        />
        <MetricLine
          color="bg-action"
          label="가입"
          rate={signupRate}
          value={row.signup}
        />
        <MetricLine
          color="bg-positive"
          label="온보딩 완료"
          rate={onboardingRate}
          value={row.onboardingCompleted}
        />
      </div>
    </div>
  );
}

function MetricLine({
  color,
  label,
  rate,
  value,
}: {
  color: string;
  label: string;
  rate?: number | null;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-5">
      <span className="inline-flex items-center gap-2 text-neutral-muted">
        <span className={cx("h-2.5 w-2.5 rounded-sm", color)} />
        {label}
      </span>
      <span className="font-medium tabular-nums text-neutral-primary">
        {value.toLocaleString("ko-KR")}
        {rate === undefined ? "" : ` · ${formatRate(rate)}`}
      </span>
    </div>
  );
}

function ChartLegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cx("h-2.5 w-2.5 rounded-sm", color)} />
      {label}
    </span>
  );
}

function compactCompositionRows(
  rows: OpsUtmLandingCompositionRow[],
  maxRows = 4
) {
  if (rows.length <= maxRows) return rows;
  const visible = rows.slice(0, maxRows - 1);
  const remainder = rows.slice(maxRows - 1);
  const includesUnknown = remainder.some((row) => row.key === "unknown");
  return [
    ...visible,
    {
      count: remainder.reduce((sum, row) => sum + row.count, 0),
      key: "other",
      label: includesUnknown ? "기타 / 알 수 없음" : "기타",
      rate: remainder.reduce((sum, row) => sum + row.rate, 0),
    },
  ];
}

function LandingCompositionCard({
  columnCount = 1,
  maxRows = 4,
  rows,
  subtitle,
  title,
}: {
  columnCount?: 1 | 2;
  maxRows?: number;
  rows: OpsUtmLandingCompositionRow[];
  subtitle?: string;
  title: string;
}) {
  const compactRows = compactCompositionRows(rows, maxRows);

  return (
    <div className="rounded-md bg-bg-weak p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-medium text-neutral-primary">{title}</h4>
        {subtitle ? (
          <span className="text-[10px] text-neutral-soft">{subtitle}</span>
        ) : null}
      </div>
      {compactRows.length === 0 ? (
        <div className="mt-3 text-xs text-neutral-soft">기록 없음</div>
      ) : (
        <div
          className={cx(
            "mt-3 gap-x-3 gap-y-2.5",
            columnCount === 2 ? "grid grid-cols-2" : "flex flex-col"
          )}
        >
          {compactRows.map((row) => (
            <div key={row.key}>
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="min-w-0 truncate text-neutral-muted">
                  {row.label}
                </span>
                <span className="shrink-0 tabular-nums text-neutral-primary">
                  {row.count.toLocaleString("ko-KR")} · {formatRate(row.rate)}
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-1000-a05">
                <div
                  className="h-full rounded-full bg-neutral-800"
                  style={{ width: `${Math.min(row.rate * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceListRow({
  active,
  onSelect,
  row,
}: {
  active: boolean;
  onSelect: () => void;
  row: OpsUtmSourceRow;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        "w-full rounded-md px-3 py-3 text-left transition",
        active
          ? "bg-neutral-1000 text-neutral-00"
          : "bg-bg-floating hover:bg-bg-weak"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-[13px] font-medium">
            {row.source}
          </div>
          {row.description ? (
            <div
              className={cx(
                "mt-1 truncate text-xs",
                active ? "text-neutral-00/60" : "text-neutral-soft"
              )}
            >
              {row.description}
            </div>
          ) : null}
        </div>
        <span
          className={cx(
            "shrink-0 rounded px-2 py-1 text-[10px] font-medium",
            active
              ? "bg-neutral-00/10 text-neutral-00"
              : row.isRegistered
                ? "bg-primary-faded text-primary"
                : "bg-bg-weak text-neutral-muted"
          )}
        >
          {row.isRegistered ? "등록" : "자동 감지"}
        </span>
      </div>
      <div
        className={cx(
          "mt-3 flex items-center justify-between text-[11px] tabular-nums",
          active ? "text-neutral-00/60" : "text-neutral-soft"
        )}
      >
        <span>Landing {row.entryCount.toLocaleString("ko-KR")}</span>
        <span>{formatDateTime(row.lastEnteredAt)}</span>
      </div>
    </button>
  );
}

function SourceEditor({
  initialSource,
  initialDescription,
  mode,
  onCancel,
  onSaved,
  sourceId,
}: {
  initialSource: string;
  initialDescription: string;
  mode: Exclude<EditorMode, null>;
  onCancel: () => void;
  onSaved: (source: OpsUtmSourceRow) => void;
  sourceId: string | null;
}) {
  const [source, setSource] = useState(initialSource);
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!source.trim() || saving) return;
    setSaving(true);
    try {
      const response =
        await fetchWithInternalAuth<OpsUtmSourceMutationResponse>(
          "/api/internal/ops/utm",
          {
            body: JSON.stringify({
              description,
              id: sourceId,
              source,
            }),
            headers: { "Content-Type": "application/json" },
            method: mode === "create" ? "POST" : "PATCH",
          }
        );
      onSaved(response.source);
      showToast({
        message:
          mode === "create"
            ? "Source를 등록했습니다."
            : "Source를 수정했습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "저장하지 못했습니다.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md bg-bg-weak p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-neutral-primary">
          {mode === "create" ? "Source 등록" : "Source 정보 수정"}
        </div>
        <MuteButton
          aria-label="닫기"
          onClick={onCancel}
          variant="transparent"
          size="sm"
        >
          <X className="h-4 w-4" />
        </MuteButton>
      </div>
      <label className="mt-3 block text-xs font-medium text-neutral-muted">
        Source
        <Input
          autoFocus
          className="mt-1.5 font-mono"
          onChange={(event) => setSource(event.target.value)}
          placeholder="contents05"
          value={source}
        />
      </label>
      <label className="mt-3 block text-xs font-medium text-neutral-muted">
        설명
        <Textarea
          className="mt-1.5 min-h-[78px]"
          onChange={(event) => setDescription(event.target.value)}
          placeholder="이 source를 어디에서 사용하는지 적어두세요."
          value={description}
        />
      </label>
      <div className="mt-3 flex justify-end gap-2">
        <MuteButton onClick={onCancel} variant="transparent" size="sm">
          취소
        </MuteButton>
        <MuteButton
          disabled={!source.trim() || saving}
          onClick={() => void save()}
          variant="dark"
          size="sm"
        >
          {saving ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          저장
        </MuteButton>
      </div>
    </div>
  );
}

export default function OpsUtmWorkspace() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const authLoading = useAuthStore((state) => state.loading);
  const userEmail = useAuthStore((state) => state.user?.email);
  const excludedEmails = useOpsInternalDataExclusionStore(
    (state) => state.emailExclusionTerms
  );
  const canFetch = !authLoading && canViewOpsUtm(userEmail);
  const canManage = !authLoading && isInternalEmail(userEmail);
  const [queryInput, setQueryInput] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [editorSource, setEditorSource] = useState("");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorSourceId, setEditorSourceId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const urlState = useMemo(
    () => parseOpsUtmUrlState(router.query),
    [router.query]
  );
  const query = router.isReady
    ? readOpsUtmSearchQuery(router.query.q)
    : "";
  const { filters, granularity, period } = urlState;

  useEffect(() => {
    if (!router.isReady) return;
    queueMicrotask(() => setQueryInput(query));
  }, [query, router.isReady]);

  useEffect(() => {
    if (!router.isReady || queryInput.trim() === query) return;
    const timeout = window.setTimeout(() => {
      void router.replace(
        {
          pathname: router.pathname,
          query: buildOpsUtmUrlQuery(urlState, queryInput),
        },
        undefined,
        { shallow: true, scroll: false }
      );
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [query, queryInput, router, urlState]);

  const sourcesQuery = useOpsUtmSources({
    enabled: canFetch,
    excludedEmails,
    query,
  });
  const rows = useMemo(
    () => sourcesQuery.data?.pages.flatMap((page) => page.rows) ?? [],
    [sourcesQuery.data]
  );
  const totalSources = sourcesQuery.data?.pages[0]?.total ?? 0;

  const effectiveSelectedSource = urlState.source ?? rows[0]?.source ?? null;
  const selectedListRow = rows.find(
    (row) => row.source === effectiveSelectedSource
  );
  const detailQuery = useOpsUtmSourceDetail({
    enabled: canFetch,
    excludedEmails,
    filters,
    granularity,
    period,
    source: effectiveSelectedSource,
  });
  const detail = detailQuery.data;
  const selectedRow = detail?.source ?? selectedListRow ?? null;
  const chartRows = useMemo<ChartRow[]>(
    () =>
      (detail?.buckets ?? []).map((bucket) => ({
        ...bucket,
        landingOnly: Math.max(bucket.landing - bucket.signup, 0),
        signupOnly: Math.max(bucket.signup - bucket.onboardingCompleted, 0),
      })),
    [detail?.buckets]
  );
  const chartWidth = Math.max(
    720,
    chartRows.length * (granularity === "day" ? 22 : 54)
  );

  const navigate = useCallback(
    (
      patch: Partial<{
        filters: OpsUtmFilters;
        granularity: OpsUtmGranularity;
        period: OpsUtmPeriod;
        source: string | null;
      }>,
      method: "push" | "replace" = "push"
    ) => {
      if (!router.isReady) return;
      const nextState = {
        ...urlState,
        ...patch,
      };
      void router[method](
        {
          pathname: router.pathname,
          query: buildOpsUtmUrlQuery(nextState, query),
        },
        undefined,
        { shallow: true, scroll: false }
      );
    },
    [query, router, urlState]
  );

  useEffect(() => {
    if (!router.isReady || urlState.source || !rows[0]?.source) return;
    navigate({ source: rows[0].source }, "replace");
  }, [navigate, router.isReady, rows, urlState.source]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["ops-utm-sources"] });
    void queryClient.invalidateQueries({ queryKey: ["ops-utm-detail"] });
  }, [queryClient]);

  const startCreate = (source = "") => {
    setEditorMode("create");
    setEditorSource(source);
    setEditorDescription("");
    setEditorSourceId(null);
  };

  const startEdit = () => {
    if (!selectedRow?.id) return;
    setEditorMode("edit");
    setEditorSource(selectedRow.source);
    setEditorDescription(selectedRow.description ?? "");
    setEditorSourceId(selectedRow.id);
  };

  const selectSource = (source: string) => {
    setEditorMode(null);
    navigate({ filters: {}, source });
  };

  const selectDimension = (key: OpsUtmDimension, value: string) => {
    const nextFilters: OpsUtmFilters = { ...filters };
    if (value === ALL_UTM_VALUES) {
      delete nextFilters[key];
    } else {
      nextFilters[key] = value;
    }
    const selectedIndex = OPS_UTM_DIMENSIONS.indexOf(key);
    for (const downstreamKey of OPS_UTM_DIMENSIONS.slice(selectedIndex + 1)) {
      delete nextFilters[downstreamKey];
    }
    navigate({ filters: nextFilters });
  };

  const copyUrl = async () => {
    if (!effectiveSelectedSource) return;
    try {
      const utmUrl = new URL("https://matchharper.com");
      utmUrl.searchParams.set("utm_source", effectiveSelectedSource);
      for (const key of OPS_UTM_DIMENSIONS) {
        const value = filters[key];
        if (value) utmUrl.searchParams.set(key, value);
      }
      await navigator.clipboard.writeText(utmUrl.toString());
      showToast({ message: "UTM 링크를 복사했습니다.", variant: "white" });
    } catch {
      showToast({ message: "링크를 복사하지 못했습니다.", variant: "error" });
    }
  };

  const deleteSource = async () => {
    if (!selectedRow?.id || deleting) return;
    if (
      !window.confirm(
        `${selectedRow.source}의 등록 정보만 삭제할까요? 유입 기록은 유지됩니다.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await fetchWithInternalAuth<{ ok: boolean }>("/api/internal/ops/utm", {
        body: JSON.stringify({ id: selectedRow.id }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      });
      showToast({ message: "등록 정보를 삭제했습니다.", variant: "white" });
      setEditorMode(null);
      refresh();
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "삭제하지 못했습니다.",
        variant: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section
        className={cx(
          opsTheme.panel,
          "p-5 shadow-[0_20px_55px_color-mix(in_srgb,var(--color-neutral-1000)_7%,transparent)]"
        )}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-hedvig text-[2rem] leading-none tracking-[-0.06em] text-neutral-primary">
              UTM
            </h1>
            <p className="mt-2 text-sm leading-6 text-neutral-muted">
              어디서든 URL에 ?utm_source= 를 붙인 뒤 원하는 변수명을 넣으면
              트래킹이 시작됩니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MuteButton onClick={refresh} variant="default">
              <RefreshCw
                className={cx(
                  "h-4 w-4",
                  (sourcesQuery.isFetching || detailQuery.isFetching) &&
                    "animate-spin"
                )}
              />
              새로고침
            </MuteButton>
            {canManage ? (
              <MuteButton onClick={() => startCreate()} variant="dark">
                <Plus className="h-4 w-4" />
                Source 등록
              </MuteButton>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid min-h-[680px] gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
        <aside className={cx(opsTheme.panel, "flex min-h-0 flex-col p-3")}>
          <div className="flex items-center justify-between gap-3 px-1 py-1">
            <div>
              <div className="text-sm font-medium text-neutral-primary">
                Sources
              </div>
              <div className="mt-0.5 text-xs tabular-nums text-neutral-soft">
                {totalSources.toLocaleString("ko-KR")}개 발견
              </div>
            </div>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
            <Input
              aria-label="UTM source 검색"
              className="pl-9"
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="source 또는 설명 검색"
              value={queryInput}
            />
          </div>

          {editorMode ? (
            <div className="mt-3">
              <SourceEditor
                key={`${editorMode}:${editorSourceId ?? "new"}:${editorSource}`}
                initialDescription={editorDescription}
                initialSource={editorSource}
                mode={editorMode}
                onCancel={() => setEditorMode(null)}
                onSaved={(source) => {
                  setEditorMode(null);
                  navigate({ filters: {}, source: source.source });
                  refresh();
                }}
                sourceId={editorSourceId}
              />
            </div>
          ) : null}

          <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 xl:max-h-[760px]">
            {sourcesQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-muted">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Source를 불러오는 중입니다.
              </div>
            ) : sourcesQuery.error ? (
              <div className={opsTheme.errorNotice}>
                {sourcesQuery.error instanceof Error
                  ? sourcesQuery.error.message
                  : "Source를 불러오지 못했습니다."}
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-md bg-bg-weak px-4 py-10 text-center text-sm text-neutral-muted">
                조건에 맞는 source가 없습니다.
              </div>
            ) : (
              rows.map((row) => (
                <SourceListRow
                  active={effectiveSelectedSource === row.source}
                  key={row.source}
                  onSelect={() => selectSource(row.source)}
                  row={row}
                />
              ))
            )}
          </div>
          {sourcesQuery.hasNextPage ? (
            <MuteButton
              className="mt-3 w-full"
              disabled={sourcesQuery.isFetchingNextPage}
              onClick={() => void sourcesQuery.fetchNextPage()}
              variant="neutral"
            >
              {sourcesQuery.isFetchingNextPage ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
              더 보기
            </MuteButton>
          ) : null}
        </aside>

        <main className="min-w-0 space-y-4">
          {!effectiveSelectedSource ? (
            <section
              className={cx(
                opsTheme.panel,
                "flex min-h-[420px] items-center justify-center p-8 text-center text-sm text-neutral-muted"
              )}
            >
              왼쪽에서 source를 선택하세요.
            </section>
          ) : detailQuery.isLoading ? (
            <section
              className={cx(
                opsTheme.panel,
                "flex min-h-[420px] items-center justify-center gap-2 p-8 text-sm text-neutral-muted"
              )}
            >
              <LoaderCircle className="h-4 w-4 animate-spin" />
              전환 데이터를 불러오는 중입니다.
            </section>
          ) : detailQuery.error || !detail ? (
            <section className={cx(opsTheme.panel, "p-5")}>
              <div className={opsTheme.errorNotice}>
                {detailQuery.error instanceof Error
                  ? detailQuery.error.message
                  : "전환 데이터를 불러오지 못했습니다."}
              </div>
            </section>
          ) : (
            <>
              <section className={cx(opsTheme.panel, "p-5")}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-mono text-xl font-medium text-neutral-primary">
                        {detail.source.source}
                      </h2>
                      <span
                        className={cx(
                          opsTheme.badge,
                          detail.source.isRegistered
                            ? "bg-primary-faded text-primary"
                            : "text-neutral-muted"
                        )}
                      >
                        {detail.source.isRegistered ? "등록됨" : "자동 감지"}
                      </span>
                    </div>
                    {detail.source.description ? (
                      <p className="mt-2 text-sm text-neutral-muted">
                        {detail.source.description}
                      </p>
                    ) : null}
                    <div className="mt-2 text-xs text-neutral-soft">
                      최근 진입 {formatDateTime(detail.source.lastEnteredAt)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <MuteButton
                      onClick={() => void copyUrl()}
                      variant="default"
                    >
                      <Copy className="h-4 w-4" />
                      링크 복사
                    </MuteButton>
                    {canManage && !detail.source.isRegistered ? (
                      <MuteButton
                        onClick={() => startCreate(detail.source.source)}
                        variant="neutral"
                      >
                        <Plus className="h-4 w-4" />
                        등록
                      </MuteButton>
                    ) : null}
                    {canManage && detail.source.isRegistered ? (
                      <>
                        <MuteButton onClick={startEdit} variant="neutral">
                          <Pencil className="h-4 w-4" />
                          수정
                        </MuteButton>
                        <MuteButton
                          disabled={deleting}
                          onClick={() => void deleteSource()}
                          variant="warn"
                        >
                          <Trash2 className="h-4 w-4" />
                          등록 삭제
                        </MuteButton>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 border-t border-neutral-1000-a05 pt-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-medium text-neutral-primary">
                        UTM 상세 필터
                      </div>
                      <p className="mt-1 text-xs leading-5 text-neutral-muted">
                        Source 아래에서 Medium, Campaign, Content, Term 순으로
                        유입을 좁혀 볼 수 있습니다.
                      </p>
                    </div>
                    {Object.keys(filters).length > 0 ? (
                      <MuteButton
                        onClick={() => navigate({ filters: {} })}
                        size="sm"
                        variant="transparent"
                      >
                        필터 초기화
                      </MuteButton>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {detail.breakdowns.map((breakdown) => {
                      const selectedValue =
                        breakdown.selectedValue ?? ALL_UTM_VALUES;
                      const hasSelectedOption = breakdown.options.some(
                        (option) => option.value === breakdown.selectedValue
                      );
                      return (
                        <label
                          className="grid gap-1.5 text-xs font-medium text-neutral-muted"
                          key={breakdown.key}
                        >
                          {UTM_DIMENSION_LABELS[breakdown.key]}
                          <Select
                            disabled={
                              breakdown.options.length === 0 &&
                              !breakdown.selectedValue
                            }
                            onValueChange={(value) => {
                              if (value) {
                                selectDimension(breakdown.key, value);
                              }
                            }}
                            value={selectedValue}
                          >
                            <SelectTrigger size="sm">
                              <SelectValue>
                                {breakdown.selectedValue ?? "전체"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent
                              align="start"
                              alignItemWithTrigger={false}
                            >
                              <SelectGroup>
                                <SelectItem value={ALL_UTM_VALUES}>
                                  전체
                                </SelectItem>
                                {breakdown.selectedValue &&
                                !hasSelectedOption ? (
                                  <SelectItem value={breakdown.selectedValue}>
                                    {breakdown.selectedValue} · 0
                                  </SelectItem>
                                ) : null}
                                {breakdown.options.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.value} · {option.entryCount}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 border-t border-neutral-1000-a05 pt-4 lg:flex-row lg:items-center lg:justify-between">
                  <Tabs
                    activeValue={period}
                    className="w-fit max-w-full overflow-x-auto"
                    items={[...PERIOD_TABS]}
                    onValueChange={(value) =>
                      navigate({ period: value as OpsUtmPeriod })
                    }
                    size="small"
                    variant="pills"
                  />
                  <Tabs
                    activeValue={granularity}
                    className="w-fit"
                    items={[...GRANULARITY_TABS]}
                    onValueChange={(value) =>
                      navigate({ granularity: value as OpsUtmGranularity })
                    }
                    size="small"
                    variant="pills"
                  />
                </div>
              </section>

              <section className={cx(opsTheme.panel, "p-5")}>
                <h3 className="text-base font-medium text-neutral-primary">
                  선택 기간 전환
                </h3>
                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  {[
                    {
                      color: "bg-neutral-300",
                      label: "Landing",
                      metric: detail.totals.landing,
                    },
                    {
                      color: "bg-action",
                      label: "가입",
                      metric: detail.totals.signup,
                    },
                    {
                      color: "bg-positive",
                      label: "온보딩 완료",
                      metric: detail.totals.onboardingCompleted,
                    },
                  ].map((item) => (
                    <div className="rounded-md bg-bg-weak p-4" key={item.label}>
                      <div className="flex items-center gap-2 text-xs text-neutral-muted">
                        <span
                          className={cx("h-2.5 w-2.5 rounded-sm", item.color)}
                        />
                        {item.label}
                      </div>
                      <div className="mt-2 flex items-end gap-2">
                        <span className="text-2xl font-medium tabular-nums text-neutral-primary">
                          {item.metric.count.toLocaleString("ko-KR")}
                        </span>
                        <span className="pb-0.5 text-xs tabular-nums text-neutral-soft">
                          {item.label === "Landing"
                            ? "100%"
                            : formatRate(item.metric.rateFromLanding)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className={cx(opsTheme.panel, "overflow-hidden p-5")}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <h3 className="text-base font-medium text-neutral-primary">
                    {granularity === "day" ? "일별" : "주별"} Landing 구성
                  </h3>
                  <div className="flex flex-wrap gap-4 text-xs text-neutral-muted">
                    <ChartLegendItem color="bg-neutral-300" label="방문만" />
                    <ChartLegendItem color="bg-action" label="가입" />
                    <ChartLegendItem color="bg-positive" label="온보딩 완료" />
                  </div>
                </div>
                <div className="mt-5 overflow-x-auto pb-2">
                  <div className="h-[330px]" style={{ width: chartWidth }}>
                    <ResponsiveContainer height="100%" width="100%">
                      <BarChart
                        data={chartRows}
                        margin={{ bottom: 0, left: 0, right: 12, top: 8 }}
                      >
                        <CartesianGrid
                          stroke="color-mix(in srgb, var(--color-neutral-1000) 6%, transparent)"
                          vertical={false}
                        />
                        <XAxis
                          axisLine={false}
                          dataKey="label"
                          fontSize={11}
                          interval="preserveStartEnd"
                          minTickGap={18}
                          tick={{ fill: "var(--color-neutral-soft)" }}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          axisLine={false}
                          fontSize={11}
                          tick={{ fill: "var(--color-neutral-soft)" }}
                          tickLine={false}
                          width={34}
                        />
                        <Tooltip
                          content={<ChartTooltip />}
                          cursor={{
                            fill: "color-mix(in srgb, var(--color-neutral-1000) 4%, transparent)",
                          }}
                        />
                        <Bar
                          dataKey="onboardingCompleted"
                          fill="var(--color-positive)"
                          maxBarSize={42}
                          stackId="landing"
                        />
                        <Bar
                          dataKey="signupOnly"
                          fill="var(--color-action)"
                          maxBarSize={42}
                          stackId="landing"
                        />
                        <Bar
                          dataKey="landingOnly"
                          fill="var(--color-neutral-300)"
                          maxBarSize={42}
                          radius={[3, 3, 0, 0]}
                          stackId="landing"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 border-t border-neutral-1000-a05 pt-4 md:grid-cols-3">
                  <LandingCompositionCard
                    rows={detail.landingComposition?.countries ?? []}
                    title="국가"
                  />
                  <LandingCompositionCard
                    columnCount={2}
                    maxRows={8}
                    rows={detail.landingComposition?.timeRanges ?? []}
                    subtitle="KST"
                    title="유입 시간대"
                  />
                  <LandingCompositionCard
                    rows={detail.landingComposition?.devices ?? []}
                    title="기기"
                  />
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
