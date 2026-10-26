import { useEffect, useRef, useState } from "react";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCanFetchInternal } from "./shared";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import {
  JOB_SEARCH_FIXED_QUERY,
  jobSearchFilterRequestSchema,
  type JobSearchFilterResult,
} from "@/lib/ops/jobSearchFilter";
import { annualSalaryKrw } from "@/lib/externalRecommendationsV2/salary";

const seconds = (ms: number) => `${(ms / 1000).toFixed(3)}초`;
const pageSize = 25;
function postingUrl(value: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export default function JobSearchFilterTab() {
  const canFetch = useCanFetchInternal();
  const [query, setQuery] = useState(() =>
    JSON.stringify(JOB_SEARCH_FIXED_QUERY, null, 2)
  );
  const [talentId, setTalentId] = useState("");
  const [blocked, setBlocked] = useState("");
  const [candidateLimit, setCandidateLimit] = useState("3000");
  const [salaryWeight, setSalaryWeight] = useState("0.35");
  const [result, setResult] = useState<JobSearchFilterResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [page, setPage] = useState(0);
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  async function run() {
    if (!canFetch || inFlight.current) return;
    setError("");
    let input;
    try {
      input = jobSearchFilterRequestSchema.parse({
        query: JSON.parse(query),
        candidateLimit: Number(candidateLimit),
        salaryWeight: Number(salaryWeight),
        talentId: talentId.trim() || null,
        blockedCompanies: blocked
          .split("\n")
          .map((v) => v.trim())
          .filter(Boolean),
      });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Query를 확인하세요."
      );
      return;
    }
    const controller = new AbortController();
    inFlight.current = controller;
    setRunning(true);
    setResult(null);
    setPage(0);
    try {
      const response = await fetchWithInternalAuth<JobSearchFilterResult>(
        "/api/internal/debug/job-search-sql/filter-first",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: controller.signal,
        }
      );
      setResult(response);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : "검색에 실패했습니다."
        );
    } finally {
      inFlight.current = null;
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <label htmlFor="filter-query" className="block text-sm font-medium">
          고정 LLM query
        </label>
        <Textarea
          id="filter-query"
          rows={12}
          className="font-mono text-xs"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={running}
        />
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid w-36 gap-1.5 text-sm">
            임베딩 후보 N
            <Input
              type="number"
              min={500}
              max={3000}
              step={1}
              required
              value={candidateLimit}
              onChange={(event) => setCandidateLimit(event.target.value)}
              disabled={running}
            />
          </label>
          <label className="grid w-36 gap-1.5 text-sm">
            연봉 가중치
            <Input
              type="number"
              min={0}
              max={1}
              step={0.05}
              required
              value={salaryWeight}
              onChange={(event) => setSalaryWeight(event.target.value)}
              disabled={running}
            />
          </label>
          <MuteButton
            type="submit"
            variant="primary"
            disabled={!canFetch || running}
          >
            {running ? "실행 중" : "TOP 500 실행"}
          </MuteButton>
          <span className="pb-2 text-sm text-neutral-muted">
            company_roles.title_embedding · HNSW (halfvec) · query 생성 호출 0회
          </span>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer">후보자별 제외 조건</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5">
              기추천 제외 후보자 ID (선택)
              <Input
                value={talentId}
                onChange={(event) => setTalentId(event.target.value)}
                disabled={running}
              />
            </label>
            <label className="grid gap-1.5">
              제외 회사명 (줄마다 하나)
              <Textarea
                rows={2}
                value={blocked}
                onChange={(event) => setBlocked(event.target.value)}
                disabled={running}
              />
            </label>
          </div>
        </details>
      </form>
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
      {result && (
        <>
          {result.error && (
            <p role="alert" className="text-sm text-critical">
              {result.error}
            </p>
          )}
          <div
            role="status"
            className="flex flex-wrap gap-x-5 gap-y-2 text-sm tabular-nums"
          >
            <strong>
              {result.error ? "실행 실패" : `${result.rows.length}개`}
            </strong>
            <span>전체 {seconds(result.totalMs)}</span>
            <span>
              임베딩{" "}
              {result.embeddingReused ? "재사용" : seconds(result.embeddingMs)}
            </span>
            <span>DB 왕복 {seconds(result.databaseMs)}</span>
            <span>
              N {result.request.candidateLimit.toLocaleString()} · 연봉 가중치{" "}
              {result.request.salaryWeight}
            </span>
          </div>
          {!result.error && (
            <Table aria-label="검색 단계별 시간">
              <TableHeader>
                <TableRow>
                  <TableHead>단계</TableHead>
                  <TableHead>공고 수</TableHead>
                  <TableHead>DB 시간</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    1. 국가 비중 · 고용 형태·원격 반영 후보 검색
                  </TableCell>
                  <TableCell>
                    {result.counts.candidates.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {seconds(result.timings.candidateSearchMs)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>2. 나머지 필터 · 점수·정렬</TableCell>
                  <TableCell>{result.rows.length}</TableCell>
                  <TableCell>{seconds(result.timings.rerankMs)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer">실행 SQL</summary>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap bg-bg-weak p-3 text-xs">
              {result.sql || "SQL 생성 전 실패"}
            </pre>
          </details>
          <details className="text-sm">
            <summary className="cursor-pointer">이번 실행 query·조건</summary>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap bg-bg-weak p-3 text-xs">
              {JSON.stringify(result.request, null, 2)}
            </pre>
          </details>
          {result.rows.length > 0 && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span>
                  {page * pageSize + 1}–
                  {Math.min((page + 1) * pageSize, result.rows.length)} /{" "}
                  {result.rows.length}
                </span>
                <div className="flex gap-2">
                  <MuteButton
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    이전
                  </MuteButton>
                  <MuteButton
                    disabled={(page + 1) * pageSize >= result.rows.length}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    다음
                  </MuteButton>
                </div>
              </div>
              <Table aria-label="필터 우선 TOP 500 결과">
                <TableHeader>
                  <TableRow>
                    {[
                      "순위",
                      "회사 · 공고",
                      "연봉 (연간 KRW)",
                      "제목 유사도",
                      "FTS",
                      "연봉 점수",
                      "최종 점수",
                    ].map((label) => (
                      <TableHead key={label}>{label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows
                    .slice(page * pageSize, (page + 1) * pageSize)
                    .map((row, index) => {
                      const salary = annualSalaryKrw(row);
                      const amount = (value: number | null) =>
                        value === null
                          ? "—"
                          : `${Math.round(value / 10000).toLocaleString()}만원`;
                      const url = postingUrl(row.external_jd_url);
                      return (
                        <TableRow key={row.role_id}>
                          <TableCell>{page * pageSize + index + 1}</TableCell>
                          <TableCell>
                            <div className="text-xs text-neutral-muted">
                              {row.company_name ?? "—"}
                            </div>
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-link"
                              >
                                {row.role_name}
                              </a>
                            ) : (
                              row.role_name
                            )}
                          </TableCell>
                          <TableCell>
                            {salary.min === null && salary.max === null
                              ? row.salary_range || "미상"
                              : `${amount(salary.min)}–${amount(salary.max)}`}
                            {row.salary_is_predicted && (
                              <span className="ml-1 text-xs text-neutral-muted">
                                추정
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.title_similarity.toFixed(4)}
                          </TableCell>
                          <TableCell>{row.fts_score.toFixed(4)}</TableCell>
                          <TableCell>{row.salary_utility.toFixed(4)}</TableCell>
                          <TableCell>{row.search_rank.toFixed(4)}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </>
          )}
        </>
      )}
    </div>
  );
}
