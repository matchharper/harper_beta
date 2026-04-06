import React from "react";
import type { BlogMetricRow, BlogMetricsSummary } from "@/components/admin/types";
import { Loading } from "@/components/ui/loading";

type AdminBlogMetricsTabProps = {
  summary: BlogMetricsSummary;
  rows: BlogMetricRow[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void | Promise<void>;
};

export default function AdminBlogMetricsTab({
  summary,
  rows,
  loading,
  error,
  onRefresh,
}: AdminBlogMetricsTabProps) {
  return (
    <>
      <div
        className="mb-4 border border-black/10 p-4 text-[13px] text-black/80"
        style={{ borderRadius: 0 }}
      >
        <div className="font-semibold text-black mb-1">Blog summary</div>
        <div className="leading-6">
          글 수: <span className="text-black font-medium">{summary.totalPosts}</span>{" "}
          · 조회수 합계:{" "}
          <span className="text-black font-medium">{summary.totalViews}</span> ·
          전환수 합계:{" "}
          <span className="text-black font-medium">
            {summary.totalConversions}
          </span>
        </div>
      </div>

      {error ? (
        <div
          className="border border-black/15 bg-black/[0.02] p-4 text-[13px] flex items-start justify-between gap-4"
          style={{ borderRadius: 0 }}
        >
          <div>
            <div className="font-semibold">Error</div>
            <div className="text-black/70 mt-1">{error}</div>
          </div>
          <button
            onClick={onRefresh}
            className="h-9 px-3 text-[13px] border border-black/15 hover:border-black/30 hover:bg-black/[0.03]"
            style={{ borderRadius: 0 }}
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="border border-black/10 w-full" style={{ borderRadius: 0 }}>
        {loading ? (
          <Loading
            size="sm"
            label="Loading…"
            className="p-6 text-[13px] text-black/55"
          />
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-[14px] font-semibold">No rows</div>
            <div className="text-[13px] text-black/55 mt-2">
              No blog metric logs yet.
            </div>
          </div>
        ) : (
          <div className="w-full">
            <div className="grid grid-cols-[1.8fr_0.9fr_0.9fr] gap-2 px-5 py-3 border-b border-black/10 text-[12px] font-semibold text-black/80">
              <div>Slug</div>
              <div className="text-right">Views</div>
              <div className="text-right">Conversions</div>
            </div>
            {rows.map((row) => (
              <div
                key={row.slug}
                className="grid grid-cols-[1.8fr_0.9fr_0.9fr] gap-2 px-5 py-3 border-t border-black/10 first:border-t-0 text-[13px]"
              >
                <div className="break-all">{row.slug}</div>
                <div className="text-right">{row.viewCount}</div>
                <div className="text-right">{row.conversionCount}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
