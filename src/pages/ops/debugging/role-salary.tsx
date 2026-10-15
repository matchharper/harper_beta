import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import OpsShell from "@/components/ops/OpsShell";
import { useCanFetchInternal } from "@/components/ops/debugging/shared";
import { MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  formatSalary,
  MAX_SALARY_ROLES,
  SALARY_METHODS,
  SALARY_PAGE_SIZE,
  type SalaryMethod,
  type SalaryRoleOption,
  type SalaryRunResult,
  type SalarySearchResult,
} from "@/lib/ops/roleSalaryEstimation";

const endpoint = "/api/internal/debug/role-salary";

export default function RoleSalaryPage() {
  const canFetch = useCanFetchInternal();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState<"KR" | "US">("KR");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<SalarySearchResult>({
    items: [],
    hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState<SalaryRoleOption[]>([]);
  const [method, setMethod] = useState<SalaryMethod>("mapping");
  const [result, setResult] = useState<SalaryRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    if (!canFetch) return;
    const controller = new AbortController();
    void fetchWithInternalAuth<SalarySearchResult>(
      `${endpoint}?${new URLSearchParams({ q: search, country, offset: String(offset) })}`,
      { signal: controller.signal }
    )
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setData({ items: [], hasMore: false });
          setSearchError(
            error instanceof Error ? error.message : "검색에 실패했습니다."
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [canFetch, search, country, offset, revision]);

  function toggle(role: SalaryRoleOption) {
    setSelected((current) =>
      current.some((item) => item.id === role.id)
        ? current.filter((item) => item.id !== role.id)
        : current.length < MAX_SALARY_ROLES
          ? [...current, role]
          : current
    );
  }
  function loadPage(nextOffset: number) {
    setLoading(true);
    setSearchError("");
    setOffset(nextOffset);
  }
  async function run() {
    if (!canFetch || !selected.length || inFlight.current) return;
    inFlight.current = true;
    setRunning(true);
    setRunError("");
    setResult(null);
    try {
      setResult(
        await fetchWithInternalAuth<SalaryRunResult>(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roleIds: selected.map((role) => role.id),
            method,
          }),
        })
      );
    } catch (error) {
      setRunError(
        error instanceof Error ? error.message : "추정에 실패했습니다."
      );
    } finally {
      inFlight.current = false;
      setRunning(false);
    }
  }

  return (
    <OpsShell title="연봉 추정">
      <Head>
        <title>연봉 추정 · Harper Ops</title>
      </Head>
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 text-neutral-primary">
        <h1 className="text-xl font-semibold">연봉 추정</h1>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setLoading(true);
            setSearchError("");
            setSearch(query.trim());
            setOffset(0);
            setRevision((value) => value + 1);
          }}
        >
          <div className="w-24 shrink-0">
            <Select
              value={country}
              disabled={running}
              onValueChange={(value) => {
                if (value !== "KR" && value !== "US") return;
                setLoading(true);
                setSearchError("");
                setCountry(value);
                setOffset(0);
              }}
            >
              <SelectTrigger aria-label="근무 국가">
                <SelectValue>{country === "KR" ? "한국" : "미국"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="KR">한국</SelectItem>
                <SelectItem value="US">미국</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input
            className="min-w-0 flex-1"
            aria-label="역할 검색"
            placeholder="회사명 · 직무명 · 역할 ID"
            value={query}
            maxLength={120}
            disabled={running}
            onChange={(event) => setQuery(event.target.value)}
          />
          <MuteButton
            className="shrink-0"
            type="submit"
            disabled={!canFetch || running}
          >
            검색
          </MuteButton>
        </form>
        {searchError && (
          <p role="alert" className="text-sm text-critical">
            {searchError}
          </p>
        )}
        {search && (
          <div
            className="max-h-80 overflow-y-auto rounded-md border border-neutral-1000-a10"
            aria-busy={loading}
          >
            {loading ? (
              <p role="status" className="p-4 text-sm text-neutral-muted">
                검색 중
              </p>
            ) : data.items.length === 0 ? (
              <p className="p-4 text-sm text-neutral-muted">검색 결과 없음</p>
            ) : (
              data.items.map((role) => {
                const checked = selected.some((item) => item.id === role.id);
                return (
                  <div
                    key={role.id}
                    className={`border-b border-neutral-1000-a05 px-4 py-3 last:border-0 ${checked ? "bg-bg-weak" : "bg-bg-floating"}`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={
                        running ||
                        (!checked && selected.length >= MAX_SALARY_ROLES)
                      }
                      onChange={() => toggle(role)}
                      label={
                        <span className="block">
                          <span className="block font-medium">
                            {role.company} · {role.title}
                          </span>
                          <span className="block text-xs text-neutral-muted">
                            {role.location ||
                              (role.country === "KR" ? "한국" : "미국")}
                          </span>
                        </span>
                      }
                    />
                  </div>
                );
              })
            )}
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-neutral-muted">
          <span>
            선택 {selected.length} / {MAX_SALARY_ROLES}
          </span>
          {search && (
            <div className="flex gap-2">
              <MuteButton
                size="sm"
                disabled={loading || running || offset === 0}
                onClick={() => loadPage(Math.max(0, offset - SALARY_PAGE_SIZE))}
              >
                이전
              </MuteButton>
              <MuteButton
                size="sm"
                disabled={loading || running || !data.hasMore}
                onClick={() => loadPage(offset + SALARY_PAGE_SIZE)}
              >
                다음
              </MuteButton>
            </div>
          )}
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selected.map((role) => (
              <MuteButton
                key={role.id}
                size="sm"
                disabled={running}
                aria-label={`${role.company} ${role.title} 선택 해제`}
                onClick={() => toggle(role)}
              >
                <span className="max-w-72 truncate">
                  {role.company} · {role.title}
                </span>
                <X className="h-3 w-3" aria-hidden />
              </MuteButton>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-56">
            <Select
              value={method}
              disabled={running}
              onValueChange={(value) => {
                if (value && value in SALARY_METHODS)
                  setMethod(value as SalaryMethod);
              }}
            >
              <SelectTrigger aria-label="추정 방식">
                <SelectValue>{SALARY_METHODS[method]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SALARY_METHODS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <MuteButton
            variant="primary"
            disabled={!canFetch || !selected.length || running}
            onClick={() => void run()}
          >
            {running ? "추정 중" : "실행"}
          </MuteButton>
        </div>
        {runError && (
          <p role="alert" className="text-sm text-critical">
            {runError}
          </p>
        )}
        {result && (
          <section className="space-y-3">
            <p role="status" className="text-sm text-neutral-muted">
              {SALARY_METHODS[result.method]} ·{" "}
              {(result.durationMs / 1000).toFixed(2)}초 ·{" "}
              {result.costUsd === null
                ? "비용 미확인"
                : `$${result.costUsd.toFixed(6)}`}
            </p>
            <Table aria-label="연봉 추정 결과">
              <TableHeader>
                <TableRow>
                  <TableHead>회사 · 역할</TableHead>
                  <TableHead>공개 급여</TableHead>
                  <TableHead>추정 연봉</TableHead>
                  <TableHead
                    title="(추정 상한 − 추정 하한) / 추정 중앙값"
                    className="text-right"
                  >
                    범위 폭
                  </TableHead>
                  <TableHead
                    title="공개·추정 연봉 중앙값의 상대 오차"
                    className="text-right"
                  >
                    중앙값 오차
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="block font-medium">{row.company}</span>
                      <span className="block text-xs text-neutral-muted">
                        {row.title}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatSalary(row.salary)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {row.error ? (
                        <span className="text-critical">{row.error}</span>
                      ) : (
                        formatSalary(row.estimate)
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.estimate
                        ? `${row.estimate.widthPct.toFixed(1)}%`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.midpointErrorPct === null
                        ? "—"
                        : `${row.midpointErrorPct.toFixed(1)}%`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <details className="text-sm">
              <summary className="cursor-pointer text-neutral-muted">
                입력 보기
              </summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-bg-weak p-4 text-xs">
                {result.input}
              </pre>
            </details>
          </section>
        )}
      </div>
    </OpsShell>
  );
}
