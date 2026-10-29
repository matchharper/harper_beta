import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { MuteButton } from "@/components/ui/button";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { FitSearchResult } from "@/lib/ops/externalFitPlayground";
import type { InspectionRole } from "@/lib/ops/applicationFormInspection";

export function InspectionRolePicker({
  value,
  onChange,
  disabled,
  canFetch,
}: {
  value: InspectionRole | null;
  onChange: (role: InspectionRole | null) => void;
  disabled: boolean;
  canFetch: boolean;
}) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<FitSearchResult>({
    items: [],
    hasMore: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectionRequest = useRef<AbortController | null>(null);
  const [selecting, setSelecting] = useState(false);
  useEffect(() => () => selectionRequest.current?.abort(), []);
  useEffect(() => {
    if (!canFetch || !query.trim()) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void fetchWithInternalAuth<FitSearchResult>(
        `/api/internal/debug/external-fit?${new URLSearchParams({ kind: "roles", q: query, offset: String(offset) })}`,
        { signal: abort.signal }
      )
        .then((result) => {
          if (!abort.signal.aborted) setData(result);
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [canFetch, query, offset]);
  async function select(id: string) {
    selectionRequest.current?.abort();
    const abort = new AbortController();
    selectionRequest.current = abort;
    onChange(null);
    setSelecting(true);
    setError("");
    try {
      const role = await fetchWithInternalAuth<InspectionRole>(
        `/api/internal/debug/application-form?roleId=${id}`,
        { signal: abort.signal }
      );
      if (!abort.signal.aborted) onChange(role);
    } catch (e) {
      if (!abort.signal.aborted)
        setError(
          e instanceof Error ? e.message : "공고를 불러오지 못했습니다."
        );
    } finally {
      if (!abort.signal.aborted) setSelecting(false);
    }
  }
  return (
    <div className="space-y-2">
      <label htmlFor="inspection-role-search" className="text-sm font-medium">
        회사명 · 직무명 · 지역 검색
      </label>
      <Input
        id="inspection-role-search"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOffset(0);
        }}
      />
      {query.trim() && (
        <div
          className="max-h-60 overflow-auto rounded-lg border border-neutral-1000-a10"
          aria-busy={loading}
        >
          {loading ? (
            <p className="p-3 text-sm text-neutral-muted">불러오는 중…</p>
          ) : (
            data.items.map((item) => (
              <MuteButton
                key={item.id}
                variant={value?.id === item.id ? "neutral" : "transparent"}
                disabled={disabled}
                className="w-full justify-start text-left"
                onClick={() => void select(item.id)}
              >
                <span>
                  <span className="block">{item.title}</span>
                  <span className="block text-xs text-neutral-muted">
                    {item.subtitle} · {item.status}
                  </span>
                </span>
              </MuteButton>
            ))
          )}
          {!loading && !data.items.length && (
            <p className="p-3 text-sm text-neutral-muted">검색 결과 없음</p>
          )}
          <div className="flex gap-2 p-2">
            <MuteButton
              disabled={disabled || loading || offset === 0}
              onClick={() => setOffset((n) => Math.max(0, n - 20))}
            >
              이전
            </MuteButton>
            <MuteButton
              disabled={disabled || loading || !data.hasMore}
              onClick={() => setOffset((n) => n + 20)}
            >
              다음
            </MuteButton>
          </div>
        </div>
      )}
      {selecting && (
        <p role="status" className="text-sm text-neutral-muted">
          선택한 공고 불러오는 중…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
      {value && (
        <div className="space-y-1 text-sm">
          <p>
            {value.company} · {value.name}
          </p>
          <p className="break-all text-xs text-neutral-muted">{value.id}</p>
          <p className="break-all">
            현재 JD: {value.originalUrl || "저장된 링크 없음"}
          </p>
        </div>
      )}
    </div>
  );
}
