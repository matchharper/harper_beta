import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import OpsShell from "@/components/ops/OpsShell";
import { useCanFetchInternal } from "@/components/ops/debugging/shared";
import { MuteButton } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  FitOption,
  FitSearchResult,
} from "@/lib/ops/externalFitPlayground";
import type {
  ExternalSearchPreviewResult,
  ExternalSearchPreviewRow,
} from "@/lib/ops/externalSearchPreview";

const endpoint = "/api/internal/debug/external-search";
const pageSize = 20;
function salaryLabel(row: ExternalSearchPreviewRow) {
  const min = row.salaryMinKrw,
    max = row.salaryMaxKrw;
  const amount = (value: number) =>
    Math.round(value / 10_000).toLocaleString("ko-KR");
  if (min !== null && max !== null) return `${amount(min)}–${amount(max)}만원`;
  if (min !== null) return `${amount(min)}만원 이상`;
  if (max !== null) return `${amount(max)}만원 이하`;
  return row.salaryText || "미상";
}
function postingUrl(value: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export default function ExternalSearchPage() {
  const canFetch = useCanFetchInternal();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<FitOption[]>([]);
  const [selected, setSelected] = useState<FitOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExternalSearchPreviewResult | null>(
    null
  );
  const [page, setPage] = useState(0);
  const [running, setRunning] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);
  useEffect(() => {
    if (!canFetch) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setSearchError("");
      void fetchWithInternalAuth<FitSearchResult>(
        `${endpoint}?${new URLSearchParams({ q: query })}`,
        { signal: controller.signal }
      )
        .then((data) => {
          if (!controller.signal.aborted) setOptions(data.items);
        })
        .catch((cause) => {
          if (!controller.signal.aborted) {
            setOptions([]);
            setSearchError(
              cause instanceof Error
                ? cause.message
                : "사용자를 찾지 못했습니다."
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [canFetch, query]);

  async function run() {
    if (!canFetch || !selected || inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setRunning(true);
    setError("");
    setResult(null);
    setPage(0);
    try {
      const data = await fetchWithInternalAuth<ExternalSearchPreviewResult>(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ talentId: selected.id }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(180_000),
          ]),
        }
      );
      if (!controller.signal.aborted) setResult(data);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "공고를 검색하지 못했습니다."
        );
    } finally {
      if (!controller.signal.aborted) setRunning(false);
      inFlight.current = null;
    }
  }

  return (
    <OpsShell title="사용자별 공고 검색">
      <Head>
        <title>사용자별 공고 검색 · Harper Ops</title>
      </Head>
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 text-neutral-primary">
        <h1 className="text-xl font-semibold">사용자별 공고 검색</h1>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-lg space-y-2">
            <label htmlFor="search-talent" className="text-sm font-medium">
              사용자
            </label>
            <Combobox<FitOption>
              items={options}
              value={selected}
              filter={null}
              itemToStringLabel={(item) => item.title}
              itemToStringValue={(item) => item.id}
              isItemEqualToValue={(a, b) => a.id === b.id}
              onInputValueChange={(value, details) => {
                if (
                  details.reason === "input-change" ||
                  details.reason === "input-clear"
                ) {
                  setQuery(value);
                  setOptions([]);
                  setLoading(true);
                }
              }}
              onValueChange={(value) => {
                setSelected(value);
                setResult(null);
                setError("");
                setPage(0);
              }}
              disabled={running || !canFetch}
            >
              <ComboboxInput
                id="search-talent"
                maxLength={120}
                placeholder="이름 · 이메일 검색"
                showClear={Boolean(selected)}
                disabled={running || !canFetch}
              />
              <ComboboxContent>
                <ComboboxEmpty>{loading ? "검색 중" : "0명"}</ComboboxEmpty>
                <ComboboxList>
                  {(item: FitOption) => (
                    <ComboboxItem key={item.id} value={item}>
                      <span className="block">{item.title}</span>
                      <span className="block truncate text-xs text-neutral-muted">
                        {item.subtitle}
                      </span>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
          <MuteButton
            variant="primary"
            disabled={!canFetch || !selected || running}
            onClick={() => void run()}
          >
            {running ? "검색 중" : "실행"}
          </MuteButton>
        </div>
        {(searchError || error) && (
          <p role="alert" className="text-sm text-critical">
            {searchError || error}
          </p>
        )}
        {result && (
          <section aria-label="검색 결과" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p role="status" className="text-sm tabular-nums">
                {result.rows.length}개
              </p>
              {result.rows.length > pageSize && (
                <div className="flex items-center gap-2">
                  <MuteButton
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    이전
                  </MuteButton>
                  <span className="text-sm tabular-nums">
                    {page + 1} / {Math.ceil(result.rows.length / pageSize)}
                  </span>
                  <MuteButton
                    size="sm"
                    disabled={(page + 1) * pageSize >= result.rows.length}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    다음
                  </MuteButton>
                </div>
              )}
            </div>
            <Table aria-label="사용자별 공고 목록">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">순위</TableHead>
                  <TableHead>회사</TableHead>
                  <TableHead>역할</TableHead>
                  <TableHead>지역</TableHead>
                  <TableHead className="text-right">연봉</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows
                  .slice(page * pageSize, (page + 1) * pageSize)
                  .map((row, index) => {
                    const url = postingUrl(row.url);
                    return (
                      <TableRow key={row.roleId}>
                        <TableCell className="tabular-nums">
                          {page * pageSize + index + 1}
                        </TableCell>
                        <TableCell>{row.company}</TableCell>
                        <TableCell>
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-link hover:underline"
                            >
                              {row.title}
                            </a>
                          ) : (
                            row.title
                          )}
                        </TableCell>
                        <TableCell className="text-neutral-muted">
                          {row.location ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {salaryLabel(row)}
                          {row.salaryIsPredicted && (
                            <span className="ml-1 text-xs text-neutral-muted">
                              추정
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </section>
        )}
      </div>
    </OpsShell>
  );
}
