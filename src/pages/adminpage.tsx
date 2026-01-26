import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/toast/toast";

type QueryRow = {
  query_id: string;
  user_id: string;
  created_at: string;
  raw_input_text: string | null;
  criteria: string[] | null;
  thinking: string | null;
  company_users: {
    name: string | null;
  } | null;
};

const PAGE_SIZE = 10;

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

function truncate(s: string, n = 180) {
  const t = s.trim();
  if (t.length <= n) return t;
  return t.slice(0, n) + "…";
}

const PASSWORD = "39773977";

const AdminPage = () => {
  const [password, setPassword] = useState("");
  const [isPassed, setIsPassed] = useState(false);

  const [rows, setRows] = useState<QueryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null); // created_at 커서
  const [search, setSearch] = useState("");

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const savedPassword = localStorage.getItem("admin_password");
    if (savedPassword === PASSWORD) {
      setIsPassed(true);
    }
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const a = (r.raw_input_text ?? "").toLowerCase();
      const b = (r.thinking ?? "").toLowerCase();
      const c = (r.criteria ?? []).join(" ").toLowerCase();
      const d = (r.user_id ?? "").toLowerCase();
      const e = (r.query_id ?? "").toLowerCase();
      return (
        a.includes(q) ||
        b.includes(q) ||
        c.includes(q) ||
        d.includes(q) ||
        e.includes(q)
      );
    });
  }, [rows, search]);

  const fetchPage = useCallback(
    async ({ reset }: { reset: boolean }) => {
      if (!reset && (!hasMore || loadingMore)) return;

      if (reset) {
        setLoading(true);
        setError(null);
        setRows([]);
        setCursor(null);
        setHasMore(true);
      } else {
        setLoadingMore(true);
        setError(null);
      }

      try {
        let q = supabase
          .from("queries")
          .select(
            "query_id,user_id,created_at,raw_input_text,criteria,thinking,company_users(name)"
          )
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE);

        const cur = reset ? null : cursor;
        if (cur) q = q.lt("created_at", cur);

        const { data, error } = await q;
        if (error) throw error;

        const page = (data ?? []) as QueryRow[];

        setRows((prev) => {
          if (reset) return page;
          // 혹시 중복 방지
          const seen = new Set(prev.map((x) => x.query_id));
          const merged = [...prev];
          for (const item of page) {
            if (!seen.has(item.query_id)) merged.push(item);
          }
          return merged;
        });

        const last = page[page.length - 1];
        setCursor(last?.created_at ?? cur);

        // 10개 미만이면 더 없음
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

  // Infinite scroll observer
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
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-black/10">
        <div className="mx-auto max-w-[1100px] px-6 py-4 flex items-center gap-3">
          <div className="flex flex-col">
            <div className="text-[15px] font-semibold tracking-tight">
              Queries Admin
            </div>
            <div className="text-[12px] text-black/55 leading-4">
              raw_input_text · criteria · thinking
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search text / criteria / user_id / query_id…"
                className="w-[360px] h-9 px-3 text-[13px] bg-white border border-black/15 outline-none focus:border-black/35"
                style={{ borderRadius: 0 }}
              />
              {search ? (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-black/45 hover:text-black"
                >
                  ⨯
                </button>
              ) : null}
            </div>

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

      {/* Content */}
      <div className="mx-auto max-w-[1100px] px-6 py-6">
        {/* Status row */}
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[12px] text-black/55">
            Total loaded: <span className="text-black">{rows.length}</span>
            {search.trim() ? (
              <>
                {" "}
                · Filtered:{" "}
                <span className="text-black">{filtered.length}</span>
              </>
            ) : null}{" "}
          </div>

          {(loadingMore || loading) && (
            <div className="text-[12px] text-black/55">Loading…</div>
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

        {/* List */}
        <div className="border border-black/10" style={{ borderRadius: 0 }}>
          {loading ? (
            <div className="p-6 text-[13px] text-black/55">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-[14px] font-semibold">No results</div>
              <div className="text-[13px] text-black/55 mt-2">
                {search.trim() ? "Try a different keyword." : "No queries yet."}
              </div>
            </div>
          ) : (
            filtered.map((r, idx) => (
              <div
                key={r.query_id ?? `${r.created_at}-${idx}`}
                className="border-t border-black/10 first:border-t-0"
              >
                <div className="px-5 py-4">
                  {/* header */}
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-[16px] font-semibold">
                          <span className="text-black/55">검색어 :</span>{" "}
                          {r.raw_input_text ?? "(empty)"}
                        </div>
                      </div>

                      <div className="mt-1 text-[14px] text-black/55 flex flex-wrap gap-x-3 gap-y-1">
                        <span className="text-black text-[15px]">
                          {r.company_users?.name ?? "(empty)"}
                        </span>
                        <span>{formatKST(r.created_at)}</span>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(r.raw_input_text ?? "")
                      }
                      className="h-8 px-2 text-[12px] border border-black/15 hover:border-black/30 hover:bg-black/[0.03]"
                      style={{ borderRadius: 0 }}
                      title="Copy raw_input_text"
                    >
                      Copy
                    </button>
                  </div>

                  {/* criteria */}
                  <div className="mt-3">
                    <div className="text-[12px] text-black/45 mb-1">
                      criteria
                    </div>
                    {r.criteria && r.criteria.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {r.criteria.map((c, i) => (
                          <span
                            key={`${r.query_id}-c-${i}`}
                            className="px-2 py-1 text-[12px] border border-black/15 bg-white"
                            style={{ borderRadius: 0 }}
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[13px] text-black/55">(empty)</div>
                    )}
                  </div>

                  {/* thinking */}
                  <div className="mt-4">
                    <div className="text-[12px] text-black/45 mb-1">
                      thinking
                    </div>
                    <pre
                      className="whitespace-pre-wrap text-[13px] leading-5 text-black/80 "
                      style={{ borderRadius: 0 }}
                    >
                      {r.thinking ? r.thinking : "(empty)"}
                    </pre>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Sentinel + footer */}
        <div ref={sentinelRef} className="h-10" />

        <div className="mt-4 text-[12px] text-black/45">
          {hasMore ? "Scroll to load more…" : "No more rows."}
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
