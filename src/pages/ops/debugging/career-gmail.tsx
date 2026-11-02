import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, LoaderCircle, Play, RotateCw } from "lucide-react";
import {
  DebuggingPageShell,
  formatAbsoluteKst,
  useCanFetchInternal,
  useDebugCopyToClipboard,
} from "@/components/ops/debugging/shared";
import { cx, opsTheme } from "@/components/ops/theme";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import {
  CAREER_GMAIL_QUERY_EXAMPLES,
  type CareerGmailDebugOptions,
  type CareerGmailDebugRun,
} from "@/lib/ops/careerGmailDebug";
import { useAuthStore } from "@/store/useAuthStore";

const endpoint = "/api/internal/debug/career-gmail";

export default function OpsCareerGmailPage() {
  const canFetch = useCanFetchInternal();
  const userId = useAuthStore((state) => state.user?.id);
  // A session switch unmounts any inbox results and pending requests' UI state.
  return (
    <CareerGmailPanel
      key={userId ?? "signed-out"}
      canFetch={canFetch}
      userId={userId}
    />
  );
}

function CareerGmailPanel({
  canFetch,
  userId,
}: {
  canFetch: boolean;
  userId?: string;
}) {
  const optionsQuery = useQuery({
    queryKey: ["ops-career-gmail", userId],
    queryFn: () => fetchWithInternalAuth<CareerGmailDebugOptions>(endpoint),
    enabled: canFetch,
    retry: false,
  });
  const options = optionsQuery.data;
  const loading = optionsQuery.isFetching;
  const [query, setQuery] = useState("newer_than:7d");
  const [maxResults, setMaxResults] = useState("5");
  const [includeContent, setIncludeContent] = useState(false);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<CareerGmailDebugRun[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const copy = useDebugCopyToClipboard();
  const selected = runs[selectedIndex];
  const input = {
    query,
    max_results: Number(maxResults),
    include_content: includeContent,
  };

  async function run() {
    if (!canFetch || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setError(null);
    try {
      const result = await fetchWithInternalAuth<CareerGmailDebugRun>(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      );
      setRuns((current) => [result, ...current]);
      setSelectedIndex(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  return (
    <DebuggingPageShell
      tab="careerGmail"
      showContextLabel={false}
      showDescription={false}
      filters={
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span>{options?.account.email}</span>
          <span className="text-neutral-muted">
            {loading
              ? "연결 확인 중"
              : options
                ? `Gmail · ${options.connectionStatus}`
                : ""}
          </span>
          <MuteButton
            size="sm"
            aria-label="연결 상태 새로고침"
            disabled={!canFetch || loading}
            onClick={() => void optionsQuery.refetch()}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </MuteButton>
          {options && options.connectionStatus !== "active" ? (
            <a href="/career" className="text-link">
              Career에서 Gmail 연결
            </a>
          ) : null}
        </div>
      }
    >
      <div className="grid min-w-0 gap-3 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          <form
            className={cx(opsTheme.panel, "space-y-4 p-4")}
            onSubmit={(event) => {
              event.preventDefault();
              void run();
            }}
          >
            <div className="font-mono text-xs">search_connected_gmail</div>
            <label
              className="grid gap-1.5 text-[13px] font-medium"
              htmlFor="gmail-query"
            >
              query
              <Textarea
                id="gmail-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                rows={4}
                className="font-mono text-xs"
                required
                spellCheck={false}
              />
            </label>
            <div className="flex flex-wrap gap-1">
              {CAREER_GMAIL_QUERY_EXAMPLES.map((example) => (
                <MuteButton
                  key={example.label}
                  size="sm"
                  type="button"
                  title={example.query}
                  onClick={() => setQuery(example.query)}
                >
                  {example.label}
                </MuteButton>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <label
                htmlFor="gmail-max-results"
                className="grid gap-1.5 text-[13px] font-medium"
              >
                max_results
                <Input
                  id="gmail-max-results"
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  required
                  value={maxResults}
                  onChange={(event) => setMaxResults(event.target.value)}
                  className="w-24"
                />
              </label>
              <Checkbox
                label="본문 포함 (include_content)"
                checked={includeContent}
                onChange={(event) => setIncludeContent(event.target.checked)}
                className="mb-2"
              />
            </div>
            <details>
              <summary className="cursor-pointer text-xs text-neutral-muted">
                호출 인자 JSON
              </summary>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs">
                {JSON.stringify(input, null, 2)}
              </pre>
            </details>
            {error || optionsQuery.error ? (
              <div role="alert" className={opsTheme.errorNotice}>
                {error ?? optionsQuery.error?.message}
              </div>
            ) : null}
            <MuteButton
              type="submit"
              variant="dark"
              className="w-full"
              disabled={!canFetch || !options || running || !query.trim()}
            >
              {running ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {running ? "조회 중" : "Gmail 조회"}
            </MuteButton>
          </form>
          {options ? (
            <details className={cx(opsTheme.panel, "p-4")}>
              <summary className="cursor-pointer text-sm font-medium">
                도구 설명·Schema
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-xs leading-5">
                {options.tool.description}
              </p>
              <pre className="mt-3 overflow-auto whitespace-pre-wrap break-all text-xs">
                {JSON.stringify(options.tool.parameters, null, 2)}
              </pre>
              <a
                href="https://support.google.com/mail/answer/7190"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs text-link"
              >
                Gmail 검색 연산자
              </a>
            </details>
          ) : null}
          {runs.length ? (
            <section className={cx(opsTheme.panel, "space-y-2 p-4")}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">
                  실행 기록 · {runs.length}
                </h2>
                <MuteButton
                  size="sm"
                  onClick={() => {
                    setRuns([]);
                    setSelectedIndex(0);
                  }}
                >
                  지우기
                </MuteButton>
              </div>
              {runs.map((item, index) => (
                <MuteButton
                  key={`${item.startedAt}-${index}`}
                  variant={selectedIndex === index ? "neutral" : "transparent"}
                  aria-pressed={selectedIndex === index}
                  className="w-full justify-start"
                  onClick={() => setSelectedIndex(index)}
                >
                  <span className="min-w-0 text-left">
                    <span className="block break-all font-mono text-xs">
                      {String(item.input.query)}
                    </span>
                    <span className="text-xs text-neutral-muted">
                      {item.result?.status ?? "error"} ·{" "}
                      {item.result?.emails.length ?? 0}건 ·{" "}
                      {item.durationMs.toLocaleString()}ms
                    </span>
                  </span>
                </MuteButton>
              ))}
            </section>
          ) : null}
        </div>
        <div
          className="min-w-0 space-y-3"
          aria-live="polite"
          aria-busy={running}
        >
          {selected ? (
            <>
              <section className={cx(opsTheme.panel, "space-y-2 p-4")}>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <strong
                    className={
                      selected.result?.status === "ok"
                        ? "text-positive"
                        : "text-critical"
                    }
                  >
                    {selected.result?.status ?? "실행 오류"}
                  </strong>
                  <span>{selected.result?.emails.length ?? 0}건</span>
                  <span>{selected.durationMs.toLocaleString()}ms</span>
                  <span className="text-neutral-muted">
                    {formatAbsoluteKst(selected.startedAt)}
                  </span>
                  <span className="text-neutral-muted">
                    {selected.account.email}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap break-all text-xs">
                  {JSON.stringify(selected.input, null, 2)}
                </pre>
                {selected.error ? (
                  <div role="alert" className={opsTheme.errorNotice}>
                    {selected.error}
                  </div>
                ) : null}
                {selected.result?.truncated ? (
                  <div className="text-xs text-neutral-muted">
                    일부 결과만 반환됨 · 현재 Career 도구에는 다음 페이지 인자가
                    없습니다.
                  </div>
                ) : null}
                {selected.result?.status === "ok" &&
                !selected.result.emails.length ? (
                  <div className="text-sm text-neutral-muted">
                    검색 결과 없음
                  </div>
                ) : null}
              </section>
              <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                {[
                  { title: "LLM에 전달되는 텍스트", value: selected.llmText },
                  {
                    title: "도구 반환 JSON",
                    value: JSON.stringify(
                      selected.result ?? { error: selected.error },
                      null,
                      2
                    ),
                  },
                ].map((output) => (
                  <section
                    key={output.title}
                    className={cx(opsTheme.panel, "min-w-0")}
                  >
                    <div className="flex items-center justify-between border-b border-neutral-1000-a05 px-4 py-2">
                      <h2 className="text-sm font-medium">{output.title}</h2>
                      <MuteButton
                        size="sm"
                        aria-label={`${output.title} 복사`}
                        onClick={() => void copy(output.value, output.title)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </MuteButton>
                    </div>
                    <pre className="max-h-[75vh] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5">
                      {output.value}
                    </pre>
                  </section>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </DebuggingPageShell>
  );
}
