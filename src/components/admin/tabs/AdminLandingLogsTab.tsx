import React from "react";
import SearchLandingFunnelPanel from "@/components/admin/search/SearchLandingFunnelPanel";
import type {
  AbtestSummary,
  GroupedLogs,
  LandingLog,
  LandingSummary,
  SectionProgressSummary,
} from "@/components/admin/types";
import { formatKST, formatPercent, formatSectionName } from "@/components/admin/utils";
import { Loading } from "@/components/ui/loading";

const ENTRY_TYPES = new Set(["new_visit", "new_session"]);

type AdminLandingLogsTabProps = {
  canAccessAdminData: boolean;
  searchLandingRefreshToken: number;
  landingSummary: LandingSummary;
  abtestSummary: AbtestSummary[];
  sectionProgressSummary: SectionProgressSummary[];
  logs: LandingLog[];
  grouped: GroupedLogs[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  sentinelRef: React.Ref<HTMLDivElement>;
  onRefresh: () => void | Promise<void>;
};

export default function AdminLandingLogsTab({
  canAccessAdminData,
  searchLandingRefreshToken,
  landingSummary,
  abtestSummary,
  sectionProgressSummary,
  logs,
  grouped,
  loading,
  loadingMore,
  error,
  hasMore,
  sentinelRef,
  onRefresh,
}: AdminLandingLogsTabProps) {
  return (
    <>
      <SearchLandingFunnelPanel
        enabled={canAccessAdminData}
        refreshToken={searchLandingRefreshToken}
      />

      <div
        className="mb-4 border border-black/10 p-4 text-[13px] text-black/80"
        style={{ borderRadius: 0 }}
      >
        <div className="font-semibold text-black mb-1">Loaded user summary</div>
        <div className="leading-6">
          전체 유저:{" "}
          <span className="text-black font-medium">{landingSummary.totalUsers}</span>{" "}
          · 스크롤 다운:{" "}
          <span className="text-black font-medium">
            {landingSummary.scrolledUsers}
          </span>{" "}
          (
          {formatPercent(
            landingSummary.scrolledUsers,
            landingSummary.totalUsers
          )}
          ) · click_*_start:{" "}
          <span className="text-black font-medium">
            {landingSummary.startClickedUsers}
          </span>{" "}
          (
          {formatPercent(
            landingSummary.startClickedUsers,
            landingSummary.totalUsers
          )}
          ) · 로그인:{" "}
          <span className="text-black font-medium">
            {landingSummary.loggedInUsers}
          </span>{" "}
          (
          {formatPercent(
            landingSummary.loggedInUsers,
            landingSummary.totalUsers
          )}
          )
        </div>
      </div>

      <div
        className="mb-4 border border-black/10 p-4 text-[12px] text-black/80"
        style={{ borderRadius: 0 }}
      >
        <div className="font-semibold text-black mb-2">
          AB Test summary (abtest_type)
        </div>
        {abtestSummary.length === 0 ? (
          <div className="text-black/55">No AB test data.</div>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-[1.6fr_0.7fr_1fr_1fr_1fr_1fr] gap-2 font-semibold border-b border-black/10 pb-1">
              <div>abtest_type</div>
              <div className="text-right">Users</div>
              <div className="text-right">Scroll</div>
              <div className="text-right">Start</div>
              <div className="text-right">Pricing</div>
              <div className="text-right">Login</div>
            </div>
            {abtestSummary.map((item) => (
              <div
                key={item.abtestType}
                className="grid grid-cols-[1.6fr_0.7fr_1fr_1fr_1fr_1fr] gap-2"
              >
                <div className="break-all">{item.abtestType}</div>
                <div className="text-right">{item.totalUsers}</div>
                <div className="text-right">
                  {item.scrolledUsers} (
                  {formatPercent(item.scrolledUsers, item.totalUsers)})
                </div>
                <div className="text-right">
                  {item.startClickedUsers} (
                  {formatPercent(item.startClickedUsers, item.totalUsers)})
                </div>
                <div className="text-right">
                  {item.pricingClickedUsers} (
                  {formatPercent(item.pricingClickedUsers, item.totalUsers)})
                </div>
                <div className="text-right">
                  {item.loggedInUsers} (
                  {formatPercent(item.loggedInUsers, item.totalUsers)})
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className="mb-4 border border-black/10 p-4 text-[12px] text-black/80"
        style={{ borderRadius: 0 }}
      >
        <div className="font-semibold text-black mb-2">
          Section reach summary (abtest_type)
        </div>
        {sectionProgressSummary.length === 0 ? (
          <div className="text-black/55">No section view data.</div>
        ) : (
          <div className="space-y-3">
            {sectionProgressSummary.map((item) => (
              <div
                key={item.abtestType}
                className="border-t border-black/10 pt-3 first:border-t-0 first:pt-0"
              >
                <div className="font-semibold text-black">{item.abtestType}</div>
                <div className="mt-1 text-black/55">Users: {item.totalUsers}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.sections.map((section) => (
                    <div
                      key={`${item.abtestType}-${section.sectionName}`}
                      className="border border-black/10 px-2 py-1"
                    >
                      <span className="font-medium text-black">
                        {formatSectionName(section.sectionName)}
                      </span>{" "}
                      · {section.userCount} (
                      {formatPercent(section.userCount, item.totalUsers)})
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-4 flex items-center justify-between w-full">
        <div className="text-[12px] text-black/55">
          Loaded logs: <span className="text-black">{logs.length}</span> · Users:{" "}
          <span className="text-black">{grouped.length}</span>
        </div>

        {(loadingMore || loading) && (
          <Loading
            size="sm"
            label="Loading…"
            className="text-[12px] text-black/55"
            inline={true}
          />
        )}
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
        ) : grouped.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-[14px] font-semibold">No logs</div>
            <div className="text-[13px] text-black/55 mt-2">
              No landing logs yet.
            </div>
          </div>
        ) : (
          grouped.map((group) => (
            <div
              key={group.local_id}
              className="border-t border-black/10 first:border-t-0 w-full"
            >
              <div className="px-5 py-4 w-full">
                <div className="text-[14px] font-semibold">
                  local_id: {group.local_id} - {group.country_lang}
                </div>
                <div className="text-[12px] text-black/55 mt-1">
                  entry: {formatKST(group.entryTime)} · abtest: {group.abtest_type}
                </div>

                <div className="mt-3 text-[13px] text-black/80 w-full space-y-1">
                  {group.logs.map((log) => (
                    <div key={log.id} className="flex gap-2 w-full">
                      <span className="text-black/50">•</span>
                      {ENTRY_TYPES.has(log.type) ? (
                        `${log.type} (${formatKST(log.created_at)})`
                      ) : (
                        <div className="flex flex-row w-full items-center justify-between">
                          <div>{log.type}</div>
                          <div>{formatKST(log.created_at)}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div ref={sentinelRef} className="h-10" />

      <div className="mt-4 text-[12px] text-black/45">
        {hasMore ? "Scroll to load more…" : "No more rows."}
      </div>
    </>
  );
}
