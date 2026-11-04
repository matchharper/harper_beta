import { useRef, useState } from "react";
import { Clipboard, LoaderCircle, Search } from "lucide-react";
import {
  DebuggingPageShell,
  useCanFetchInternal,
  useDebugCopyToClipboard,
} from "@/components/ops/debugging/shared";
import { cx, opsTheme } from "@/components/ops/theme";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { CompanySearchDebugResponse } from "@/lib/ops/companySearchDebug";

function CompanyUrl({ value }: { value: string | null }) {
  if (!value) return <>—</>;
  return /^https?:\/\//i.test(value) ? (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-link hover:underline"
    >
      {value}
    </a>
  ) : (
    <span className="break-all">{value}</span>
  );
}

export default function OpsCompanySearchPage() {
  const canFetch = useCanFetchInternal();
  const copy = useDebugCopyToClipboard();
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState("0");
  const [result, setResult] = useState<CompanySearchDebugResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const running = useRef(false);
  const validOffset =
    offset.trim() !== "" &&
    Number.isSafeInteger(Number(offset)) &&
    Number(offset) >= 0;

  async function search(input: CompanySearchDebugResponse["input"]) {
    if (!canFetch || running.current) return;
    running.current = true;
    setLoading(true);
    setError("");
    try {
      const response = await fetchWithInternalAuth<CompanySearchDebugResponse>(
        "/api/internal/debug/company-search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      );
      setResult(response);
      setQuery(response.input.query);
      setOffset(String(response.input.offset));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "회사 검색에 실패했습니다."
      );
    } finally {
      running.current = false;
      setLoading(false);
    }
  }

  return (
    <DebuggingPageShell
      tab="companySearch"
      showContextLabel={false}
      showDescription={false}
      filters={
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim() && validOffset)
              void search({ query, offset: Number(offset) });
          }}
        >
          <label className="grid min-w-60 flex-1 gap-1.5 text-sm">
            회사명 · 웹사이트 · LinkedIn URL
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={loading}
              required
            />
          </label>
          <label className="grid w-28 gap-1.5 text-sm">
            Offset
            <Input
              type="number"
              min={0}
              step={1}
              value={offset}
              onChange={(event) => setOffset(event.target.value)}
              disabled={loading}
              required
            />
          </label>
          <MuteButton
            type="submit"
            variant="dark"
            disabled={!canFetch || loading || !query.trim() || !validOffset}
          >
            {loading ? (
              <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
            ) : (
              <Search aria-hidden className="h-4 w-4" />
            )}
            {loading ? "검색 중…" : "검색"}
          </MuteButton>
          {error ? (
            <div role="alert" className={cx(opsTheme.errorNotice, "w-full")}>
              {error}
            </div>
          ) : null}
        </form>
      }
    >
      {result ? (
        <>
          <section
            aria-busy={loading}
            className={cx(opsTheme.panel, "overflow-hidden")}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div
                role="status"
                className="flex flex-wrap items-center gap-3 text-sm"
              >
                <strong>{result.input.query}</strong>
                <span>{result.companies.length}개</span>
                <span className="text-neutral-muted">company_workspace</span>
                <span className="text-neutral-muted">
                  {(result.durationMs / 1000).toFixed(2)}초 · offset{" "}
                  {result.input.offset}
                </span>
              </div>
              <MuteButton
                size="sm"
                disabled={!canFetch || loading || result.nextOffset === null}
                onClick={() => {
                  if (result.nextOffset !== null)
                    void search({
                      query: result.input.query,
                      offset: result.nextOffset,
                    });
                }}
              >
                다음 페이지
              </MuteButton>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>회사</TableHead>
                  <TableHead>범위</TableHead>
                  <TableHead>Company ID</TableHead>
                  <TableHead>Workspace ID</TableHead>
                  <TableHead>웹사이트</TableHead>
                  <TableHead>LinkedIn</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.companies.map((company) => (
                  <TableRow
                    key={`${company.scope}:${company.companyDbId}:${company.companyWorkspaceId}`}
                  >
                    <TableCell className="min-w-36 font-medium">
                      {company.name}
                    </TableCell>
                    <TableCell>{company.scope}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {company.companyDbId ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {company.companyWorkspaceId ?? "—"}
                    </TableCell>
                    <TableCell>
                      <CompanyUrl value={company.website} />
                    </TableCell>
                    <TableCell>
                      <CompanyUrl value={company.linkedin} />
                    </TableCell>
                  </TableRow>
                ))}
                {!result.companies.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-neutral-muted"
                    >
                      검색 결과 없음
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </section>
          <section className={cx(opsTheme.panel, "p-4")}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">LLM 전달 원문</h2>
              <MuteButton
                size="sm"
                variant="transparent"
                onClick={() => void copy(result.modelOutput, "도구 결과")}
              >
                <Clipboard aria-hidden className="h-3.5 w-3.5" />
                복사
              </MuteButton>
            </div>
            <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5">
              {result.modelOutput}
            </pre>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-neutral-muted">
                응답 JSON
              </summary>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </section>
        </>
      ) : null}
    </DebuggingPageShell>
  );
}
