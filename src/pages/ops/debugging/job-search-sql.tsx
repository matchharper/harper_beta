import Head from "next/head";
import { useRef, useState } from "react";
import OpsShell from "@/components/ops/OpsShell";
import { useCanFetchInternal } from "@/components/ops/debugging/shared";
import { MuteButton } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs } from "@/components/ui/tabs";
import JobSearchFilterTab from "@/components/ops/debugging/JobSearchFilterTab";
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
  JOB_TITLE_SIMILARITY_DEFAULT_CANDIDATE_LIMIT,
  JOB_TITLE_SIMILARITY_DEFAULT_LIMIT,
  JOB_TITLE_SIMILARITY_MAX_LIMIT,
  type JobTitleSimilarityResult,
  type JobTitleSimilaritySource,
} from "@/lib/ops/jobTitleSimilarity";

export default function JobTitleSimilarityPage() {
  const [tab, setTab] = useState("similarity");
  const canFetch = useCanFetchInternal();
  const [source, setSource] =
    useState<JobTitleSimilaritySource>("company_roles");
  const [text, setText] = useState("");
  const [limit, setLimit] = useState(
    String(JOB_TITLE_SIMILARITY_DEFAULT_LIMIT)
  );
  const [candidateLimit, setCandidateLimit] = useState(
    String(JOB_TITLE_SIMILARITY_DEFAULT_CANDIDATE_LIMIT)
  );
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [result, setResult] = useState<JobTitleSimilarityResult | null>(null);
  const rows = result?.rows ?? null;
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function run() {
    if (!canFetch || inFlight.current || !text.trim()) return;
    inFlight.current = true;
    setRunning(true);
    setError("");
    setResult(null);
    setElapsedMs(null);
    const startedAt = performance.now();
    try {
      setResult(
        await fetchWithInternalAuth<JobTitleSimilarityResult>(
          "/api/internal/debug/job-search-sql",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source,
              text,
              limit: Number(limit),
              candidateLimit: Number(candidateLimit),
            }),
          }
        )
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "조회에 실패했습니다."
      );
    } finally {
      setElapsedMs(performance.now() - startedAt);
      inFlight.current = false;
      setRunning(false);
    }
  }

  return (
    <OpsShell title="제목 유사도 검색">
      <Head>
        <title>제목 유사도 검색 · Harper Ops</title>
      </Head>
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 text-neutral-primary">
        <h1 className="text-xl font-semibold">제목 유사도 검색</h1>
        <Tabs
          activeValue={tab}
          onValueChange={setTab}
          items={[
            { value: "similarity", label: "제목 유사도" },
            { value: "filter-first", label: "필터 → 임베딩 → TOP 500" },
          ]}
        />
        <div
          role="tabpanel"
          aria-label="필터 → 임베딩 → TOP 500"
          hidden={tab !== "filter-first"}
        >
          <JobSearchFilterTab />
        </div>
        <div
          role="tabpanel"
          aria-label="제목 유사도"
          hidden={tab !== "similarity"}
          className="space-y-5"
        >
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run();
            }}
          >
            <div className="max-w-sm space-y-1.5">
              <label
                id="search-source-label"
                className="block text-sm font-medium"
              >
                검색 대상
              </label>
              <Select
                value={source}
                disabled={running}
                onValueChange={(value) => {
                  if (
                    value !== "company_roles" &&
                    value !== "external_role_title_embeddings"
                  )
                    return;
                  setSource(value);
                  setResult(null);
                  setElapsedMs(null);
                  setError("");
                }}
              >
                <SelectTrigger aria-labelledby="search-source-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company_roles">company_roles</SelectItem>
                  <SelectItem value="external_role_title_embeddings">
                    external_role_title_embeddings
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label htmlFor="search-text" className="block text-sm font-medium">
              검색 텍스트
            </label>
            <Textarea
              id="search-text"
              rows={4}
              maxLength={8000}
              value={text}
              onChange={(event) => setText(event.target.value)}
              disabled={running}
            />
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-32 space-y-1.5">
                <label
                  htmlFor="candidate-limit"
                  className="block text-sm font-medium"
                >
                  {source === "company_roles" ? "공고 후보 수" : "검색 제목 수"}
                </label>
                <Input
                  id="candidate-limit"
                  type="number"
                  min={1}
                  max={Number.MAX_SAFE_INTEGER}
                  step={1}
                  required
                  value={candidateLimit}
                  onChange={(event) => setCandidateLimit(event.target.value)}
                  disabled={running}
                />
              </div>
              {source === "company_roles" && (
                <div className="w-32 space-y-1.5">
                  <label
                    htmlFor="result-limit"
                    className="block text-sm font-medium"
                  >
                    최종 공고 수
                  </label>
                  <Input
                    id="result-limit"
                    type="number"
                    min={1}
                    max={JOB_TITLE_SIMILARITY_MAX_LIMIT}
                    step={1}
                    required
                    value={limit}
                    onChange={(event) => setLimit(event.target.value)}
                    disabled={running}
                  />
                </div>
              )}
              <MuteButton
                type="submit"
                variant="primary"
                disabled={!canFetch || running || !text.trim()}
              >
                {running ? "검색 중" : "실행"}
              </MuteButton>
            </div>
          </form>
          <p className="text-sm text-neutral-muted">
            {source === "company_roles"
              ? "공고별 현재 제목 임베딩으로 검색합니다. 후보 수는 공고 수입니다."
              : "활성 공고가 있는 제목 임베딩에서 선택된 제목만 표시합니다. 공고 조회와 정밀 유사도 재계산·재정렬은 하지 않습니다."}
          </p>
          {error && (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          )}
          {result !== null && (
            <div
              role="status"
              className="space-y-1 text-sm tabular-nums text-neutral-muted"
            >
              <p>
                {result.rows.length}개 · 전체 소요 시간{" "}
                {((elapsedMs ?? 0) / 1000).toFixed(3)}초
              </p>
              <p>
                1차 {source === "company_roles" ? "공고" : "제목"} 후보 검색{" "}
                {(result.timings.candidateSearchMs / 1000).toFixed(3)}초
                {source === "company_roles" && (
                  <>
                    {" "}
                    · 정밀 유사도·공고 조회·정렬{" "}
                    {(result.timings.rerankAndFetchMs / 1000).toFixed(3)}초
                  </>
                )}
              </p>
            </div>
          )}
          {rows !== null && (
            <Table aria-label="제목 유사도 결과">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">순위</TableHead>
                  {source === "company_roles" && <TableHead>회사</TableHead>}
                  <TableHead>제목</TableHead>
                  {source === "company_roles" && (
                    <TableHead className="text-right">유사도</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow
                    key={"title_key" in row ? row.title_key : row.role_id}
                  >
                    <TableCell className="tabular-nums">{index + 1}</TableCell>
                    {"title_key" in row ? (
                      <TableCell>{row.title}</TableCell>
                    ) : (
                      <>
                        <TableCell>{row.company_name ?? "—"}</TableCell>
                        <TableCell>{row.role_name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.similarity.toFixed(4)}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={source === "company_roles" ? 4 : 2}
                      className="text-center text-neutral-muted"
                    >
                      0개
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </OpsShell>
  );
}
