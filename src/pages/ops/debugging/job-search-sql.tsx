import Head from "next/head";
import { useRef, useState } from "react";
import OpsShell from "@/components/ops/OpsShell";
import { useCanFetchInternal } from "@/components/ops/debugging/shared";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { JobTitleSimilarityRow } from "@/lib/ops/jobTitleSimilarity";

export default function JobTitleSimilarityPage() {
  const canFetch = useCanFetchInternal();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<JobTitleSimilarityRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function run() {
    if (!canFetch || inFlight.current || !text.trim()) return;
    inFlight.current = true;
    setRunning(true);
    setError("");
    setRows(null);
    try {
      setRows(
        await fetchWithInternalAuth<JobTitleSimilarityRow[]>(
          "/api/internal/debug/job-search-sql",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          }
        )
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "조회에 실패했습니다."
      );
    } finally {
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
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
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
          <MuteButton
            type="submit"
            variant="primary"
            disabled={!canFetch || running || !text.trim()}
          >
            {running ? "검색 중" : "실행"}
          </MuteButton>
        </form>
        {error && (
          <p role="alert" className="text-sm text-critical">
            {error}
          </p>
        )}
        {rows !== null && (
          <Table aria-label="제목 유사도 결과">
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">순위</TableHead>
                <TableHead>회사</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className="text-right">유사도</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.role_id}>
                  <TableCell className="tabular-nums">{index + 1}</TableCell>
                  <TableCell>{row.company_name ?? "—"}</TableCell>
                  <TableCell>{row.role_name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.similarity.toFixed(4)}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
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
    </OpsShell>
  );
}
