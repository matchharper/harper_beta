import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loading } from "@/components/ui/loading";
import {
  SEARCH_LANDING_LOG_ABTEST_TYPE,
  summarizeSearchLandingFunnel,
  type SearchLandingLog,
} from "@/lib/searchLandingLogs";

const SEARCH_LANDING_FETCH_BATCH_SIZE = 1000;

type SearchLandingFunnelPanelProps = {
  enabled: boolean;
  refreshToken?: number;
};

function formatPercent(numerator: number, denominator: number) {
  if (denominator === 0) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatLoadedAt(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border border-black/10 p-4" style={{ borderRadius: 0 }}>
      <div className="text-[12px] text-black/55">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-black">{value}</div>
      <div className="mt-1 text-[12px] text-black/60">{detail}</div>
    </div>
  );
}

export default function SearchLandingFunnelPanel({
  enabled,
  refreshToken = 0,
}: SearchLandingFunnelPanelProps) {
  const [logs, setLogs] = useState<SearchLandingLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      let from = 0;
      const allLogs: SearchLandingLog[] = [];

      while (true) {
        const to = from + SEARCH_LANDING_FETCH_BATCH_SIZE - 1;
        const { data, error } = await supabase
          .from("landing_logs")
          .select(
            "id,local_id,type,created_at,abtest_type,is_mobile,country_lang"
          )
          .eq("abtest_type", SEARCH_LANDING_LOG_ABTEST_TYPE)
          .order("id", { ascending: true })
          .range(from, to);

        if (error) throw error;

        const rows = (
          (data ?? []) as Array<{
            id: number | null;
            local_id: string | null;
            type: string | null;
            created_at: string;
            abtest_type: string | null;
            is_mobile: boolean | null;
            country_lang: string | null;
          }>
        ).flatMap((row) => {
          if (
            row.id === null ||
            typeof row.local_id !== "string" ||
            typeof row.type !== "string"
          ) {
            return [];
          }

          return [
            {
              id: row.id,
              local_id: row.local_id,
              type: row.type,
              created_at: row.created_at,
              abtest_type: row.abtest_type,
              is_mobile: row.is_mobile,
              country_lang: row.country_lang,
            } satisfies SearchLandingLog,
          ];
        });

        allLogs.push(...rows);

        if ((data ?? []).length < SEARCH_LANDING_FETCH_BATCH_SIZE) {
          break;
        }

        from += SEARCH_LANDING_FETCH_BATCH_SIZE;
      }

      setLogs(allLogs);
      setLoadedAt(new Date().toISOString());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to load search landing analytics"
      );
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void fetchLogs();
  }, [enabled, fetchLogs, refreshToken]);

  const summary = useMemo(() => summarizeSearchLandingFunnel(logs), [logs]);

  return (
    <div
      className="mb-4 border border-black/10 p-4 text-[13px] text-black/80"
      style={{ borderRadius: 0 }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold text-black">Search landing funnel</div>
          <div className="mt-1 text-[12px] text-black/55">
            `/search` 기준 · 고유 유저는 `local_id` 기준
          </div>
        </div>

        {loading ? (
          <Loading
            size="sm"
            label="Loading…"
            className="text-[12px] text-black/55"
            inline={true}
          />
        ) : (
          <div className="text-right text-[12px] text-black/55">
            <div>Logs: {logs.length}</div>
            <div>Updated: {formatLoadedAt(loadedAt)}</div>
          </div>
        )}
      </div>

      {error ? (
        <div className="mt-3 border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard
          label="들어온 유저"
          value={`${summary.totalUsers}`}
          detail="new_visit / new_session 포함 전체 local_id"
        />
        <MetricCard
          label="스크롤 내린 비율"
          value={formatPercent(summary.scrolledUsers, summary.totalUsers)}
          detail={`${summary.scrolledUsers} / ${summary.totalUsers} 유저`}
        />
        <MetricCard
          label="시작 버튼 누른 비율"
          value={formatPercent(summary.startClickedUsers, summary.totalUsers)}
          detail={`${summary.startClickedUsers} / ${summary.totalUsers} 유저`}
        />
        <MetricCard
          label="로그인 완료 비율"
          value={formatPercent(summary.loggedInUsers, summary.totalUsers)}
          detail={`${summary.loggedInUsers} / ${summary.totalUsers} 유저`}
        />
      </div>
    </div>
  );
}
