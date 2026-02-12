import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/toast/toast";
import { Loading } from "@/components/ui/loading";

type LandingLog = {
  id: string;
  local_id: string;
  type: string;
  created_at: string;
  is_mobile: boolean | null;
  country_lang: string | null;
};

type GroupedLogs = {
  local_id: string;
  entryTime: string;
  country_lang: string;
  logs: LandingLog[];
};

const PAGE_SIZE = 50;
const PASSWORD = "39773977";

const ENTRY_TYPES = new Set(["new_visit", "new_session"]);

function formatKST(iso?: string) {
  if (!iso) return "";

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const AdminPage = () => {
  const [password, setPassword] = useState("");
  const [isPassed, setIsPassed] = useState(false);

  const [logs, setLogs] = useState<LandingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const savedPassword = localStorage.getItem("admin_password");
    if (savedPassword === PASSWORD) {
      setIsPassed(true);
    }
  }, []);

  const fetchPage = useCallback(
    async ({ reset }: { reset: boolean }) => {
      if (!reset && (!hasMore || loadingMore)) return;

      if (reset) {
        setLoading(true);
        setError(null);
        setLogs([]);
        setCursor(null);
        setHasMore(true);
      } else {
        setLoadingMore(true);
        setError(null);
      }

      try {
        let q = supabase
          .from("landing_logs")
          .select("id,local_id,type,created_at,is_mobile,country_lang")
          .order("created_at", { ascending: false })
          .neq("local_id", "a22bb523-42cd-4d39-9667-c527c40941d3")
          .neq("local_id", "a4d4df1a-aa6d-401e-a34a-00d426630fe2")
          .limit(PAGE_SIZE);

        const cur = reset ? null : cursor;
        if (cur) q = q.lt("created_at", cur);

        const { data, error } = await q;
        if (error) throw error;

        const page = (data ?? []) as any[];

        setLogs((prev) => {
          if (reset) return page;
          const seen = new Set(prev.map((x) => x.id));
          const merged = [...prev];
          for (const item of page) {
            if (!seen.has(item.id)) merged.push(item);
          }
          return merged;
        });

        const last = page[page.length - 1];
        setCursor(last?.created_at ?? cur);

        if (page.length < PAGE_SIZE) setHasMore(false);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [cursor, hasMore, loadingMore]
  );

  useEffect(() => {
    fetchPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (hit) fetchPage({ reset: false });
      },
      { root: null, rootMargin: "600px 0px", threshold: 0 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [fetchPage]);

  const onRefresh = async () => {
    await fetchPage({ reset: true });
  };

  const onSubmit = async () => {
    if (password === PASSWORD) {
      setIsPassed(true);
      localStorage.setItem("admin_password", password);
    } else {
      showToast({
        message: "Invalid password",
        variant: "white",
      });
    }
  };

  const grouped = useMemo<GroupedLogs[]>(() => {
    if (logs.length === 0) return [];

    const byUser = new Map<string, LandingLog[]>();
    for (const item of logs) {
      const list = byUser.get(item.local_id) ?? [];
      list.push(item);
      byUser.set(item.local_id, list);
    }

    const groups: GroupedLogs[] = [];
    for (const [local_id, list] of Array.from(byUser.entries())) {
      const entryCandidates = list.filter((l) => ENTRY_TYPES.has(l.type));
      const entryTimeSource =
        entryCandidates.length > 0
          ? entryCandidates
              .slice()
              .sort((a: LandingLog, b: LandingLog) =>
                b.created_at.localeCompare(a.created_at)
              )[0]
          : list
              .slice()
              .sort((a: LandingLog, b: LandingLog) =>
                b.created_at.localeCompare(a.created_at)
              )[0];

      const entryTime = entryTimeSource?.created_at ?? "";

      const orderedLogs = list
        .slice()
        .sort((a: LandingLog, b: LandingLog) =>
          a.created_at.localeCompare(b.created_at)
        );

      groups.push({
        local_id,
        entryTime,
        logs: orderedLogs,
        country_lang: list[0]?.country_lang ?? "",
      });
    }

    return groups.sort((a, b) => b.entryTime.localeCompare(a.entryTime));
  }, [logs]);

  if (!isPassed) {
    return (
      <div className="min-h-screen bg-white text-black font-inter">
        <div className="flex flex-col items-center justify-center h-screen">
          Who are you
          <input
            type="password"
            className="text-lg p-1 border-xgray300 border mt-4"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            onClick={onSubmit}
            className="bg-black text-white px-4 py-2 rounded-md mt-4"
          >
            Submit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black font-inter">
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-black/10">
        <div className="mx-auto max-w-[1100px] px-6 py-4 flex items-center gap-3">
          <div className="flex flex-col">
            <div className="text-[15px] font-semibold tracking-tight">
              Landing Logs Admin
            </div>
            <div className="text-[12px] text-black/55 leading-4">
              local_id 기준 · 액션 타임라인
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="h-9 px-3 text-[13px] border border-black/15 hover:border-black/30 hover:bg-black/[0.03] active:bg-black/[0.06]"
              style={{ borderRadius: 0 }}
              disabled={loading}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-6 py-6 w-full">
        <div className="mb-4 flex items-center justify-between w-full">
          <div className="text-[12px] text-black/55">
            Loaded logs: <span className="text-black">{logs.length}</span> ·
            Users: <span className="text-black">{grouped.length}</span>
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

        <div
          className="border border-black/10 w-full"
          style={{ borderRadius: 0 }}
        >
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
                    entry: {formatKST(group.entryTime)}
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
      </div>
    </div>
  );
};

export default AdminPage;
