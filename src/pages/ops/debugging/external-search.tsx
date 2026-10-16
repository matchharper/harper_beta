import Head from "next/head";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ExternalSearchDiagnostics,
  methodLabel,
  seconds,
  previewCost,
} from "@/components/ops/debugging/ExternalSearchDiagnostics";
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
import { previewQuerySchema } from "@/lib/ops/externalSearchPreview";

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
  const method = "filter_first";
  const [candidateLimit, setCandidateLimit] = useState("3000");
  const [salaryWeight, setSalaryWeight] = useState("0.35");
  const [draft, setDraft] = useState("");
  const [prepared, setPrepared] = useState<ExternalSearchPreviewResult | null>(
    null
  );
  const [history, setHistory] = useState<ExternalSearchPreviewResult[]>([]);
  const [busyAction, setBusyAction] = useState<"prepare" | "search">("prepare");
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

  async function run(action: "prepare" | "search") {
    if (!canFetch || !selected || inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setRunning(true);
    setError("");
    setBusyAction(action);
    setPage(0);
    try {
      const searchQuery =
        action === "search"
          ? previewQuerySchema.parse(JSON.parse(draft))
          : undefined;
      if (searchQuery) setDraft(JSON.stringify(searchQuery, null, 2));
      const data = await fetchWithInternalAuth<ExternalSearchPreviewResult>(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            talentId: selected.id,
            action,
            method,
            candidateLimit: action === "search" ? Number(candidateLimit) : 3000,
            salaryWeight: action === "search" ? Number(salaryWeight) : 0.35,
            ...(searchQuery ? { query: searchQuery } : {}),
          }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(180_000),
          ]),
        }
      );
      if (!controller.signal.aborted) {
        if (action === "prepare") {
          setPrepared(data);
          if (data.query) {
            setDraft(
              JSON.stringify(previewQuerySchema.parse(data.query), null, 2)
            );
            setResult(null);
          }
        } else {
          setResult(data);
          setHistory((previous) => [data, ...previous].slice(0, 6));
        }
      }
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
    <OpsShell title="사용자별 공고 검색 query를 통한 1차 리스트 500개만">
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
                setPrepared(null);
                setDraft("");
                setHistory([]);
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
            onClick={() => void run("prepare")}
          >
            {running && busyAction === "prepare" ? "생성 중" : "LLM query 생성"}
          </MuteButton>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid w-32 gap-2 text-sm">
            제목 후보 N
            <Input
              type="number"
              min={500}
              max={20000}
              step={500}
              value={candidateLimit}
              disabled={running}
              onChange={(e) => setCandidateLimit(e.target.value)}
            />
          </label>
          <label className="grid w-36 gap-2 text-sm">
            연봉 가중치 (0–1)
            <Input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={salaryWeight}
              disabled={running}
              onChange={(e) => setSalaryWeight(e.target.value)}
            />
          </label>
          <MuteButton
            variant="primary"
            disabled={!canFetch || !selected || !draft || running}
            onClick={() => void run("search")}
          >
            {running && busyAction === "search" ? "검색 중" : "이 query로 검색"}
          </MuteButton>
        </div>
        {draft && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="search-query" className="text-sm font-medium">
                검색 query · JSON 수정
              </label>
              <MuteButton
                size="sm"
                disabled={running || !prepared?.query}
                onClick={() => {
                  if (!prepared?.query) return;
                  setDraft(
                    JSON.stringify(
                      previewQuerySchema.parse(prepared.query),
                      null,
                      2
                    )
                  );
                  setError("");
                }}
              >
                생성한 query로 복원
              </MuteButton>
            </div>
            <Textarea
              id="search-query"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={running}
              spellCheck={false}
              rows={16}
              className="font-mono text-xs"
            />
            <details className="text-sm text-neutral-muted">
              <summary className="cursor-pointer">검색·점수·시간 기준</summary>
              <p className="mt-2">
                추천 검색과 같은 방식으로 국가 코드·remote 조건을 적용합니다.
                회사별 점수 상위 3개를 남긴 뒤 국가 weight 비율로 최종 목록을 배분합니다.
                부족한 국가의 몫은 후보가 남은 국가에 가중치 비례로 재배분합니다.
                company_roles.title_embedding이 현재 제목과 일치하는 공고만
                유사도로 N개 선택합니다. FTS / (1 + FTS) + 연봉 가중치 ×
                (2 × 연봉 만족도 − 1)로 500개를 정렬하며, 동점은 제목
                유사도·게시일 순입니다. 연봉 가중치 0은 연봉을 반영하지
                않습니다.
              </p>
              <p className="mt-2">
                LLM query 생성 비용과 검색 요청 비용은 별도입니다. 제목이 같으면
                임베딩을 최대 5분 재사용합니다. DB 내부 시간은 SQL 왕복 시간에
                포함되며, SQL이 완료된 경우에만 반환됩니다. 전용 HNSW 검색
                RPC의 SQL 제한은 50초입니다. 전체 요청 제한은 165초입니다.
              </p>
            </details>
          </section>
        )}
        {prepared && <ExternalSearchDiagnostics result={prepared} />}
        {history.length > 0 && (
          <section aria-label="최근 실행 비교" className="space-y-2 text-sm">
            <strong>최근 실행 비교</strong>
            {history.map((item, index) => (
              <div key={index} className="flex flex-wrap items-center gap-3">
                <MuteButton
                  size="sm"
                  disabled={running}
                  onClick={() => {
                    setResult(item);
                    setPage(0);
                  }}
                >
                  결과 {history.length - index}
                </MuteButton>
                <span>
                  {methodLabel(item.method)}
                  {item.method === "filter_first"
                    ? ` · N ${item.candidateLimit} · 연봉 ${item.salaryWeight}`
                    : ""}
                </span>
                <span>
                  {item.error ? "실패" : `${item.rows.length}개`} ·{" "}
                  {seconds(item.totalMs)} · {previewCost(item)}
                </span>
              </div>
            ))}
          </section>
        )}
        {result && <ExternalSearchDiagnostics result={result} />}
        {(searchError || error) && (
          <p role="alert" className="text-sm text-critical">
            {searchError || error}
          </p>
        )}
        {result && !result.error && (
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
                  <TableHead className="text-right">방식 내 점수</TableHead>
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
                        <TableCell className="text-right tabular-nums">
                          {row.score?.toFixed(6) ?? "—"}
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
