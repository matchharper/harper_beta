import { useRef, useState } from "react";
import { LoaderCircle, Play, Search } from "lucide-react";
import {
  DebuggingPageShell,
  useCanFetchInternal,
} from "@/components/ops/debugging/shared";
import { cx, opsTheme } from "@/components/ops/theme";
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
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { FitOption, FitSearchResult } from "@/lib/ops/externalFitPlayground";
import type { CompanyFitDebugResponse } from "@/lib/ops/companyFitDebug";

const score = (value: number | null) => (value === null ? "—" : value.toFixed(1));

export default function OpsCompanyFitPage() {
  const canFetch = useCanFetchInternal();
  const [talentQuery, setTalentQuery] = useState("");
  const [talents, setTalents] = useState<FitOption[]>([]);
  const [talent, setTalent] = useState<FitOption | null>(null);
  const [namesText, setNamesText] = useState("");
  const names = namesText.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  const [result, setResult] = useState<CompanyFitDebugResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const running = useRef(false);

  async function findTalents() {
    if (!canFetch) return;
    setError("");
    const query = talentQuery.trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query)) {
      const direct = { id: query, title: query, subtitle: "" };
      setTalents([direct]);
      setTalent(direct);
      return;
    }
    try {
      const found = await fetchWithInternalAuth<FitSearchResult>(
        `/api/internal/debug/external-fit?${new URLSearchParams({ kind: "talents", q: query, offset: "0" })}`
      );
      setTalents(found.items);
      if (!found.items.length) setError("일치하는 후보자가 없습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "후보자 검색에 실패했습니다.");
    }
  }

  async function run() {
    if (!canFetch || !talent || !names.length || running.current) return;
    running.current = true;
    setLoading(true);
    setError("");
    try {
      setResult(
        await fetchWithInternalAuth<CompanyFitDebugResponse>("/api/internal/debug/company-fit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ talentId: talent.id, companyNames: names }),
        })
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "회사 평가에 실패했습니다.");
    } finally {
      running.current = false;
      setLoading(false);
    }
  }

  return (
    <DebuggingPageShell
      tab="companyFit"
      showContextLabel={false}
      showDescription={false}
      filters={
        <div className="mt-4 grid gap-3">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void findTalents();
            }}
          >
            <label className="grid min-w-60 flex-1 gap-1.5 text-sm">
              후보자 (이름 · 이메일 · ID)
              <Input value={talentQuery} onChange={(e) => setTalentQuery(e.target.value)} />
            </label>
            <MuteButton type="submit" disabled={!canFetch}>
              <Search aria-hidden className="h-4 w-4" />
              찾기
            </MuteButton>
          </form>
          {talents.length ? (
            <div className="flex flex-wrap gap-2">
              {talents.map((item) => (
                <MuteButton
                  key={item.id}
                  size="sm"
                  variant={talent?.id === item.id ? "dark" : "transparent"}
                  onClick={() => setTalent(item)}
                >
                  {item.title}
                  <span className="text-neutral-muted">{item.subtitle}</span>
                </MuteButton>
              ))}
            </div>
          ) : null}
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run();
            }}
          >
            <label className="grid min-w-60 flex-1 gap-1.5 text-sm">
              회사 이름 (한 줄에 하나, search_opportunities의 companyNames)
              <Textarea value={namesText} onChange={(e) => setNamesText(e.target.value)} rows={4} />
            </label>
            <MuteButton type="submit" variant="dark" disabled={!canFetch || loading || !talent || !names.length}>
              {loading ? <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" /> : <Play aria-hidden className="h-4 w-4" />}
              {loading ? "평가 중…" : talent ? `${talent.title}로 평가` : "후보자를 고르세요"}
            </MuteButton>
          </form>
          {error ? <div role="alert" className={opsTheme.errorNotice}>{error}</div> : null}
        </div>
      }
    >
      {result ? (
        <>
          <section className={cx(opsTheme.panel, "overflow-hidden")}>
            <div role="status" className="flex flex-wrap gap-3 px-4 py-3 text-sm">
              <strong>{result.rows.length}곳</strong>
              <span>status {result.status}</span>
              <span className="text-neutral-muted">{(result.durationMs / 1000).toFixed(1)}초</span>
              <span className="font-mono text-xs text-neutral-muted">run {result.runId ?? "—"}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>회사</TableHead>
                  <TableHead>최종 점수</TableHead>
                  <TableHead>mutualFit</TableHead>
                  <TableHead>candidateInterest</TableHead>
                  <TableHead>companyInterest</TableHead>
                  <TableHead>constraintPass</TableHead>
                  <TableHead>열린 공고</TableHead>
                  <TableHead>Workspace ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row, index) => (
                  <TableRow key={row.companyWorkspaceId}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="min-w-36 font-medium">
                      {row.homepage && /^https?:\/\//i.test(row.homepage) ? (
                        <a href={row.homepage} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                          {row.name}
                        </a>
                      ) : (
                        row.name
                      )}
                    </TableCell>
                    <TableCell className="font-semibold">{score(row.rankScore)}</TableCell>
                    <TableCell>{score(row.mutualFit)}</TableCell>
                    <TableCell>{score(row.candidateInterest)}</TableCell>
                    <TableCell>{score(row.companyInterest)}</TableCell>
                    <TableCell>{score(row.constraintPass)}</TableCell>
                    <TableCell>{row.openRoleCount ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.companyWorkspaceId}</TableCell>
                  </TableRow>
                ))}
                {!result.rows.length ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-neutral-muted">
                      평가된 회사 없음
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </section>
          <section className={cx(opsTheme.panel, "p-4")}>
            <h2 className="text-sm font-semibold">LLM 전달 원문</h2>
            <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5">
              {result.modelOutput}
            </pre>
          </section>
        </>
      ) : null}
    </DebuggingPageShell>
  );
}
