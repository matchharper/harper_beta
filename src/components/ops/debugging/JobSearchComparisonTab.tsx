import { useEffect, useRef, useState } from "react";
import { MuteButton } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import {
  comparisonGroups,
  defaultComparisonToggles,
  type ComparisonCase,
  type ComparisonResult,
  type ComparisonToggles,
} from "@/lib/ops/jobSearchComparison";
import { useCanFetchInternal } from "./shared";

const endpoint = "/api/internal/debug/job-search-sql/compare";
const seconds = (ms: number) => `${(ms / 1000).toFixed(3)}초`;
type DisplayResult = ComparisonResult & { elapsedMs?: number };
function configuration(result: ComparisonResult) {
  if (result.request.mode === "original") return "실패 당시 원본";
  const enabled = comparisonGroups
    .filter((group) => group.keys.some((key) => result.request.toggles[key]))
    .map((group) => group.label);
  return enabled.length ? enabled.join(" · ") : "기본값";
}

export default function JobSearchComparisonTab() {
  const canFetch = useCanFetchInternal();
  const [cases, setCases] = useState<ComparisonCase[]>([]);
  const [caseId, setCaseId] = useState("");
  const [toggles, setToggles] = useState<ComparisonToggles>({
    ...defaultComparisonToggles,
  });
  const [history, setHistory] = useState<DisplayResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [running, setRunning] = useState("");
  const [runStarted, setRunStarted] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const inFlight = useRef<AbortController | null>(null);
  const resultPanel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!canFetch) return;
    const controller = new AbortController();
    void fetchWithInternalAuth<ComparisonCase[]>(endpoint, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((rows) => {
        if (!controller.signal.aborted) {
          setCases(rows);
          setCaseId(rows[0]?.id ?? "");
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "테스트셋을 불러오지 못했습니다."
          );
      });
    return () => controller.abort();
  }, [canFetch]);
  useEffect(() => () => inFlight.current?.abort(), []);
  useEffect(() => {
    if (runStarted === null) return;
    const timer = window.setInterval(
      () => setElapsedMs(performance.now() - runStarted),
      200
    );
    return () => window.clearInterval(timer);
  }, [runStarted]);
  const currentCase = cases.find((item) => item.id === caseId);
  const result = history[selected];
  const original =
    result &&
    history.find(
      (item) =>
        item.request.caseId === result.request.caseId &&
        item.request.mode === "original" &&
        !item.error
    );
  const originalIds = new Set(original?.rows.map((row) => row.role_id));
  const overlap =
    result?.rows.filter((row) => originalIds.has(row.role_id)).length ?? 0;
  const baseline =
    result &&
    history.find(
      (item) =>
        item !== result &&
        item.request.caseId === result.request.caseId &&
        !item.error &&
        item.request.mode === "toggles" &&
        item.counts.filtered != null &&
        !Object.values(item.request.toggles).some(Boolean)
    );
  const baselineDelta =
    result && baseline ? result.databaseMs - baseline.databaseMs : null;

  async function run(ids: string[], mode: "toggles" | "original") {
    if (!canFetch || inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setError("");
    if (window.innerWidth < 1024)
      resultPanel.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    let requestStarted = performance.now();
    // Sequential requests avoid making the five cases compete for DB resources.
    try {
      for (const [index, id] of ids.entries()) {
        if (controller.signal.aborted) break;
        requestStarted = performance.now();
        setRunStarted(requestStarted);
        setElapsedMs(0);
        setRunning(
          `${id} 실행 중${ids.length > 1 ? ` (${index + 1}/${ids.length})` : ""}`
        );
        const next = await fetchWithInternalAuth<ComparisonResult>(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId: id, mode, toggles }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) break;
        setHistory((previous) =>
          [
            { ...next, elapsedMs: performance.now() - requestStarted },
            ...previous,
          ].slice(0, 50)
        );
        setSelected(0);
        setPage(0);
      }
    } catch (failure) {
      setError(
        controller.signal.aborted
          ? "실행을 중단했습니다."
          : failure instanceof Error
            ? failure.message
            : "실행에 실패했습니다."
      );
    } finally {
      setElapsedMs(performance.now() - requestStarted);
      setRunStarted(null);
      inFlight.current = null;
      setRunning("");
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-neutral-muted">
        선택한 국가·고용 형태·원격 조건이 반영된 HNSW에서 후보를 찾습니다. 국가
        비중으로 최대 3,000개를 먼저 나누고, 추가 탐색 없이 필터와 점수를
        적용합니다.
      </p>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="시간초과 테스트 사례"
      >
        {cases.map((item, index) => (
          <MuteButton
            key={item.id}
            type="button"
            disabled={Boolean(running)}
            aria-pressed={item.id === caseId}
            variant={item.id === caseId ? "neutral" : "default"}
            onClick={() => setCaseId(item.id)}
          >
            {index + 1}. {item.countries.join(" · ")}
          </MuteButton>
        ))}
      </div>
      {currentCase && (
        <p className="text-xs text-neutral-muted">
          {currentCase.id} ·{" "}
          {new Date(currentCase.capturedAt).toLocaleString("ko-KR")} · 당시{" "}
          {currentCase.failure === "db_timeout"
            ? "DB 시간초과"
            : "요청 시간초과"}
          {` · HNSW 후보 최대 ${currentCase.candidateLimit.toLocaleString()}개 → 나머지 필터·점수·정렬 후 최대 ${currentCase.resultLimit}개`}
        </p>
      )}
      <div className="grid items-start gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div>
            <div className="border-b border-neutral-1000-a05 py-3">
              <p className="text-sm font-medium">1. 현재 (디폴트)</p>
              <p className="text-xs text-neutral-muted">
                Text embedding + 기본 필터만 · 항상 적용
              </p>
            </div>
            {comparisonGroups.map((group, index) => (
              <div
                key={group.id}
                className="flex items-center justify-between gap-4 border-b border-neutral-1000-a05 py-3"
              >
                <div>
                  <label
                    htmlFor={`compare-${group.id}`}
                    className="text-sm font-medium"
                  >
                    {index + 2}. {group.label}
                  </label>
                  <p className="text-xs text-neutral-muted">
                    {currentCase &&
                    !group.keys.some((key) => currentCase.available[key])
                      ? "이 사례에는 해당 조건이 없어 켜도 변화 없음"
                      : group.description}
                  </p>
                </div>
                <Switch
                  id={`compare-${group.id}`}
                  checked={group.keys.every((key) => toggles[key])}
                  disabled={Boolean(running)}
                  onCheckedChange={(checked) =>
                    setToggles((previous) => {
                      const next = { ...previous };
                      for (const key of group.keys) next[key] = checked;
                      return next;
                    })
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MuteButton
              variant="dark"
              size="lg"
              className="w-full"
              disabled={!currentCase || Boolean(running)}
              onClick={() => void run([caseId], "toggles")}
            >
              현재 설정 실행
            </MuteButton>
            <MuteButton
              disabled={!cases.length || Boolean(running)}
              onClick={() =>
                void run(
                  cases.map((item) => item.id),
                  "toggles"
                )
              }
            >
              5개 모두 실행
            </MuteButton>
            <MuteButton
              disabled={!currentCase || Boolean(running)}
              onClick={() => void run([caseId], "original")}
            >
              실패 당시 원본 실행
            </MuteButton>
            <MuteButton
              disabled={Boolean(running)}
              onClick={() => setToggles({ ...defaultComparisonToggles })}
            >
              기본값으로
            </MuteButton>
            {running && (
              <MuteButton onClick={() => inFlight.current?.abort()}>
                중단
              </MuteButton>
            )}
          </div>
        </div>
        <div ref={resultPanel} className="min-w-0 space-y-5 scroll-mt-6">
          <section
            aria-label="현재 실행 결과"
            className="rounded-xl border border-neutral-1000-a10 bg-bg-floating p-5 sm:p-6"
          >
            <p role="status" className="text-sm font-medium">
              {running ||
                (error || result?.error
                  ? "실행 실패"
                  : result
                    ? selected === 0
                      ? "최근 실행 완료"
                      : "선택한 실행 결과"
                    : "실행 결과")}
            </p>
            {running || error || result ? (
              <>
                <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-4">
                  <div>
                    <p className="text-xs text-neutral-muted">
                      {running || error || result?.elapsedMs !== undefined
                        ? "총 소요 시간"
                        : "DB 요청 시간"}
                    </p>
                    <p className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">
                      {(
                        (running || error
                          ? elapsedMs
                          : (result?.elapsedMs ?? result?.databaseMs ?? 0)) /
                        1000
                      ).toFixed(2)}
                      <span className="ml-1 text-xl font-normal">초</span>
                    </p>
                  </div>
                  {!running && !error && result && !result.error && (
                    <div>
                      <p className="text-xs text-neutral-muted">찾은 공고</p>
                      <p className="mt-1 text-3xl font-semibold tabular-nums">
                        {result.rows.length.toLocaleString()}
                        <span className="ml-1 text-base font-normal">개</span>
                      </p>
                    </div>
                  )}
                </div>
                {!running && !error && result && (
                  <>
                    <p className="mt-4 text-sm text-neutral-muted">
                      {result.request.caseId} · {configuration(result)}
                    </p>
                    {!result.error && (
                      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-neutral-1000-a05 pt-4 text-xs text-neutral-muted">
                        <span>DB 요청 {seconds(result.databaseMs)}</span>
                      </div>
                    )}
                    {!result.error && result.counts.filtered != null && (
                      <p className="mt-3 text-sm text-neutral-muted">
                        HNSW 후보 {result.counts.candidates?.toLocaleString()}개
                        → 나머지 필터 통과{" "}
                        {result.counts.filtered.toLocaleString()}개 → 최종{" "}
                        {result.rows.length.toLocaleString()}개
                      </p>
                    )}
                    {baselineDelta !== null && !result.error && (
                      <p className="mt-3 text-sm">
                        기본값보다 DB 요청이 {seconds(Math.abs(baselineDelta))}{" "}
                        {baselineDelta >= 0 ? "더 걸렸습니다" : "빨랐습니다"}.{" "}
                        <span className="text-xs text-neutral-muted">
                          DB 캐시 영향 포함
                        </span>
                      </p>
                    )}
                  </>
                )}
              </>
            ) : (
              <p className="mt-4 text-sm text-neutral-muted">
                조건을 고르고 실행하세요. 소요 시간과 결과가 여기에 표시됩니다.
              </p>
            )}
            {(error || (!running && result?.error)) && (
              <p role="alert" className="mt-4 text-sm text-critical">
                {error || result?.error}
              </p>
            )}
          </section>
          {result && !running && !error && !result.error && (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                검색 결과
                {original && result !== original && !result.error
                  ? ` · 원본과 공통 ${overlap}개 / 원본 ${original.rows.length}개`
                  : ""}
              </p>
              <div className="max-h-[480px] overflow-auto">
                <Table aria-label="검색 공고 결과">
                  <TableHeader>
                    <TableRow>
                      <TableHead>순위</TableHead>
                      <TableHead>공고</TableHead>
                      <TableHead>국가</TableHead>
                      <TableHead>유사도</TableHead>
                      <TableHead>합산 점수</TableHead>
                      <TableHead>FTS</TableHead>
                      <TableHead>연봉 만족도</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows
                      .slice(page * 25, (page + 1) * 25)
                      .map((row, index) => (
                        <TableRow key={row.role_id}>
                          <TableCell>{page * 25 + index + 1}</TableCell>
                          <TableCell>
                            {row.role_name}
                            <p className="text-xs text-neutral-muted">
                              {row.company_name}
                            </p>
                          </TableCell>
                          <TableCell>{row.country_code}</TableCell>
                          {[
                            row.title_similarity,
                            row.search_rank,
                            row.fts_score,
                            row.salary_utility,
                          ].map((value, column) => (
                            <TableCell key={column}>
                              {Number(value).toFixed(4)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
              {result.rows.length > 25 && (
                <div className="flex items-center gap-3">
                  <MuteButton
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    이전
                  </MuteButton>
                  <span className="text-sm">
                    {page + 1} / {Math.ceil(result.rows.length / 25)}
                  </span>
                  <MuteButton
                    disabled={(page + 1) * 25 >= result.rows.length}
                    onClick={() => setPage(page + 1)}
                  >
                    다음
                  </MuteButton>
                </div>
              )}
              <details>
                <summary className="cursor-pointer text-sm">
                  실행 SQL (임베딩 값 생략)
                </summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-bg-weak p-3 text-xs">
                  {result.sql}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
      {history.length > 0 && (
        <details className="border-t border-neutral-1000-a10 pt-4">
          <summary className="cursor-pointer text-sm text-neutral-muted">
            이전 실행 {history.length}회 보기
          </summary>
          <div className="mt-3 overflow-x-auto">
            <Table aria-label="검색 실행 기록">
              <TableHeader>
                <TableRow>
                  <TableHead>사례 / 실행</TableHead>
                  <TableHead>추가 조건</TableHead>
                  <TableHead>DB 요청</TableHead>
                  <TableHead>HNSW 후보 / 필터 통과 / 결과</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item, index) => (
                  <TableRow
                    key={`${item.startedAt}-${item.request.caseId}`}
                    className={index === selected ? "bg-bg-weak" : ""}
                  >
                    <TableCell>
                      <button
                        type="button"
                        disabled={Boolean(running)}
                        className="text-left underline underline-offset-4"
                        onClick={() => {
                          setSelected(index);
                          setError("");
                          resultPanel.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                          setPage(0);
                        }}
                      >
                        {item.request.caseId}
                        <br />
                        {new Date(item.startedAt).toLocaleTimeString("ko-KR")}
                      </button>
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal">
                      {configuration(item)}
                      {item.error && (
                        <p className="text-red-600">{item.error}</p>
                      )}
                    </TableCell>
                    <TableCell>{seconds(item.databaseMs)}</TableCell>
                    <TableCell>
                      {item.counts.candidates ?? "—"} /{" "}
                      {item.counts.filtered ?? "—"} /{" "}
                      {item.error ? "실패" : item.rows.length}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      )}
      <details className="text-xs text-neutral-muted">
        <summary className="cursor-pointer">비교 기준과 캐시</summary>
        <div className="mt-2 space-y-2">
          <p>
            기본 필터: 외부 공고, 유효 상태, 사용자 직접 등록·테스트 공고 제외,
            현재 제목과 일치하는 임베딩. 원본 정밀도 재계산은 하지 않습니다.
          </p>
          <p>
            기본 고정 조건과 국가·인턴·파트타임·계약직·원격 조건은 영구 HNSW
            인덱스에 반영합니다. 국가 조건을 켜면 저장된 비중으로 후보 한도를
            먼저 나눕니다. 비중이 0.8/0.2라면 최대 2,400개/600개입니다.
          </p>
          <p>
            현재 만료 시각, 게시 기간·기추천·차단 회사 제외는 확정된 후보에
            적용합니다. 최종 결과도 국가 비중을 목표로 선택하며, 부족분은 이미
            확보한 후보 안에서만 채웁니다. 추가 탐색하지 않습니다. 인덱스는 매
            실행마다 만들지 않습니다. HNSW는 근사 검색이므로 최대 후보 수보다
            적게 반환할 수 있습니다. 실패 당시 원본은 당시 검색 구조와 국가별
            비율 배분을 유지합니다.
          </p>
          <p>
            점수 토글은 기존 검색의 점수식을 사용하고, 점수가 같으면 임베딩
            유사도순입니다. LLM·임베딩 API 호출과 결과 캐시는 없습니다. DB
            메모리 캐시는 남으므로 반복 실행이 빨라질 수 있습니다. 현재 공고
            데이터로 실행하며 과거 결과를 재현하는 것은 아닙니다.
          </p>
          <p>
            기록은 이 화면에서 최근 50회까지 유지됩니다. 새로고침하면
            사라집니다.
          </p>
        </div>
      </details>
    </div>
  );
}
