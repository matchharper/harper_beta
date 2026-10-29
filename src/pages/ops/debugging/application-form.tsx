import Head from "next/head";
import { memo, useEffect, useRef, useState } from "react";
import OpsShell from "@/components/ops/OpsShell";
import { useCanFetchInternal } from "@/components/ops/debugging/shared";
import { Tabs } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApplicationQuestionsPanel } from "@/components/ops/debugging/ApplicationQuestionsPanel";
import {
  inspectionOutcome,
  questionProviders,
  questionProviderLabels,
  type QuestionProvider,
} from "@/lib/ops/applicationQuestions";
import { Switch } from "@/components/ui/switch";
import { InspectionRolePicker } from "@/components/ops/debugging/InspectionRolePicker";
import { Input } from "@/components/ui/input";
import { MuteButton } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchResponseWithInternalAuth } from "@/lib/internalApiClient";
import {
  readInspectionStream,
  type InspectionDebugResult,
  type InspectionUsage,
  type InspectionRole,
} from "@/lib/ops/applicationFormInspection";
import type { ApplicationInspectionEvent } from "@/lib/career/simulation/applicationInspectionTrace";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}초`;
const money = (usage: InspectionUsage | null) =>
  usage?.estimatedCostUsd == null
    ? "미확인"
    : `$${usage.estimatedCostUsd.toFixed(6)}${usage.unpricedRequests ? " (일부)" : ""}`;

const InspectionLogEntry = memo(function InspectionLogEntry({
  event,
}: {
  event: ApplicationInspectionEvent;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-neutral-1000-a05 px-3 py-2 last:border-0">
      <div className="flex gap-3">
        <time
          className="shrink-0 tabular-nums text-neutral-muted"
          dateTime={event.at}
        >
          {new Date(event.at).toLocaleTimeString("ko-KR", {
            hour12: false,
            timeZone: "Asia/Seoul",
          })}
        </time>
        <span className="shrink-0 text-neutral-soft">{event.kind}</span>
        <span
          className={`min-w-0 whitespace-pre-wrap break-words ${event.kind.includes("error") ? "text-critical" : ""}`}
        >
          {event.message}
        </span>
      </div>
      {event.data != null && (
        <details
          className="mt-1"
          onToggle={(event) => setExpanded(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-neutral-muted">상세</summary>
          {expanded && (
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all bg-bg-weak p-2">
              {JSON.stringify(event.data, null, 2)}
            </pre>
          )}
        </details>
      )}
    </div>
  );
});

export default function ApplicationFormDebuggingPage() {
  const canFetch = useCanFetchInternal();
  const [tab, setTab] = useState("questions");
  const [provider, setProvider] = useState<QuestionProvider>("current");
  const [questionsRunning, setQuestionsRunning] = useState(false);
  const [url, setUrl] = useState("");
  const [resolveOfficialLink, setResolveOfficialLink] = useState(false);
  const [role, setRole] = useState<InspectionRole | null>(null);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<ApplicationInspectionEvent[]>([]);
  const [usage, setUsage] = useState<InspectionUsage | null>(null);
  const [result, setResult] = useState<InspectionDebugResult | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const logPanel = useRef<HTMLDivElement>(null);
  const followLogs = useRef(true);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!running || !startedAt) return;
    const timer = setInterval(
      () => setElapsed(Date.now() - Date.parse(startedAt)),
      250
    );
    return () => clearInterval(timer);
  }, [running, startedAt]);
  useEffect(() => {
    if (followLogs.current && logPanel.current)
      logPanel.current.scrollTop = logPanel.current.scrollHeight;
  }, [logs]);

  async function run() {
    if (
      !canFetch ||
      questionsRunning ||
      request.current ||
      !(url.trim() || (resolveOfficialLink && role))
    )
      return;
    const abort = new AbortController();
    request.current = abort;
    setRunning(true);
    setLogs([]);
    setUsage(null);
    setResult(null);
    setError("");
    setElapsed(0);
    setStartedAt(new Date().toISOString());
    followLogs.current = true;
    try {
      const response = await fetchResponseWithInternalAuth(
        "/api/internal/debug/application-form",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            resolveOfficialLink
              ? {
                  resolveOfficialLink: true,
                  ...(role ? { roleId: role.id } : { url: url.trim() }),
                }
              : { url: url.trim() }
          ),
          signal: abort.signal,
        }
      );
      if (!response.ok)
        throw new Error(
          (await response.json()).error ?? "조사를 시작하지 못했습니다."
        );
      if (!response.body) throw new Error("실행 로그 연결을 열지 못했습니다.");
      await readInspectionStream(response.body, (event) => {
        if (event.type === "started") setStartedAt(event.startedAt);
        if (event.type === "log")
          setLogs((current) => [...current, event.event]);
        if (event.type === "usage") setUsage(event.usage);
        if (event.type === "completed") {
          setResult(event.result);
          setUsage(event.result.usage);
          setElapsed(event.result.durationMs);
        }
        if (event.type === "error") setError(event.message);
      });
    } catch (failure) {
      if (!abort.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "조사 중 오류가 발생했습니다."
        );
    } finally {
      request.current = null;
      setRunning(false);
    }
  }

  function download() {
    const href = URL.createObjectURL(
      new Blob([JSON.stringify({ result, logs, usage, error }, null, 2)], {
        type: "application/json",
      })
    );
    const link = document.createElement("a");
    link.href = href;
    link.download = `application-form-${result?.runId ?? "incomplete"}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  const form = result?.form;
  return (
    <OpsShell compactHeader title="지원 양식">
      <Head>
        <title>지원 양식 · Harper Ops</title>
      </Head>
      <div className="space-y-5 text-neutral-primary">
        <h1 className="text-xl font-semibold">지원 양식</h1>
        <div className="space-y-1.5">
          <label
            htmlFor="question-provider"
            className="block text-sm font-medium"
          >
            실행 방식
          </label>
          <Select
            value={provider}
            onValueChange={(value) => {
              if (value) setProvider(value as QuestionProvider);
            }}
            disabled={running || questionsRunning}
          >
            <SelectTrigger id="question-provider" className="max-w-sm">
              <SelectValue>{questionProviderLabels[provider]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {questionProviders.map((value) => (
                <SelectItem key={value} value={value}>
                  {questionProviderLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="resolve-official-link"
            checked={resolveOfficialLink}
            onCheckedChange={setResolveOfficialLink}
            disabled={running || questionsRunning}
          />
          <label htmlFor="resolve-official-link" className="text-sm">
            공식 공고 링크 먼저 찾기
          </label>
        </div>
        {resolveOfficialLink && (
          <>
            <details className="space-y-2 text-sm">
              <summary className="cursor-pointer text-neutral-muted">
                저장된 공고에서 선택
              </summary>
              <InspectionRolePicker
                value={role}
                onChange={(selected) => {
                  setRole(selected);
                  if (selected) setUrl(selected.originalUrl ?? "");
                }}
                disabled={running || questionsRunning}
                canFetch={canFetch}
              />
            </details>
            <p className="text-xs text-neutral-muted">
              연결된 저장 공고가 있으면 찾은 공식 URL로 갱신합니다.
            </p>
          </>
        )}
        <div hidden={provider !== "current"}>
          <Tabs
            activeValue={tab}
            onValueChange={setTab}
            items={[
              { value: "questions", label: "질문만 가져오기" },
              { value: "inspection", label: "양식 조사" },
            ]}
          />
        </div>
        <div
          hidden={provider === "current" && tab !== "questions"}
          role="tabpanel"
          aria-label="질문만 가져오기"
        >
          <ApplicationQuestionsPanel
            canFetch={canFetch && !running}
            url={url}
            onUrlChange={(value) => {
              setUrl(value);
              setRole(null);
            }}
            role={role}
            resolveOfficialLink={resolveOfficialLink}
            provider={provider}
            onRunningChange={setQuestionsRunning}
          />
        </div>
        <div
          hidden={provider !== "current" || tab !== "inspection"}
          role="tabpanel"
          aria-label="양식 조사"
          className="space-y-5"
        >
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run();
            }}
          >
            <div className="min-w-64 flex-1 space-y-1.5">
              <label htmlFor="application-url" className="text-sm font-medium">
                공고 / 지원 URL
              </label>
              <Input
                id="application-url"
                type="url"
                required={!resolveOfficialLink || !role}
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setRole(null);
                }}
                disabled={running || questionsRunning}
                placeholder="https://…"
              />
            </div>
            <MuteButton
              type="submit"
              variant="primary"
              disabled={
                !canFetch ||
                running ||
                questionsRunning ||
                !(url.trim() || (resolveOfficialLink && role))
              }
            >
              {running ? "가져오는 중…" : "양식 가져오기"}
            </MuteButton>
          </form>
          {running && (
            <p role="status" className="text-sm text-neutral-muted">
              지원 양식을 읽고 있습니다 · {seconds(elapsed)}
            </p>
          )}
          {error && (
            <div role="alert" className="space-y-1 text-sm text-critical">
              <p className="font-medium">지원 양식을 가져오지 못했습니다</p>
              <p>{error}</p>
            </div>
          )}
          {form && (
            <section className="space-y-3" aria-label="수집 결과">
              <h2
                role="status"
                className={`text-base font-semibold ${form.status === "unavailable" ? "text-critical" : form.status === "read" && form.fields.length ? "text-positive" : "text-neutral-primary"}`}
              >
                {inspectionOutcome(form.status, form.fields.length)}
              </h2>
              {form.url && (
                <a
                  href={/^https?:\/\//i.test(form.url) ? form.url : undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="block break-all text-sm text-link underline"
                >
                  {form.url}
                </a>
              )}
              {form.limitations.map((item, index) => (
                <p
                  key={index}
                  className="whitespace-pre-wrap text-sm text-neutral-muted"
                >
                  {item}
                </p>
              ))}
              {form.status !== "read" &&
                !form.limitations.length &&
                form.submission?.reason && (
                  <p className="text-sm text-neutral-muted">
                    {form.submission.reason}
                  </p>
                )}
              {!!form.fields.length && (
                <Table aria-label="가져온 지원 항목">
                  <TableHeader>
                    <TableRow>
                      <TableHead>항목</TableHead>
                      <TableHead>필수 여부</TableHead>
                      <TableHead>세부 정보</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.fields.map((field, index) => (
                      <TableRow key={index}>
                        <TableCell className="whitespace-pre-wrap">
                          {field.label || "이름 없는 항목"}
                        </TableCell>
                        <TableCell>
                          {field.required === null
                            ? "—"
                            : field.required
                              ? "필수"
                              : "선택"}
                        </TableCell>
                        <TableCell className="whitespace-pre-wrap">
                          <details>
                            <summary className="cursor-pointer text-neutral-muted">
                              보기
                            </summary>
                            <div className="space-y-1 py-2">
                              <p>{field.type}</p>
                              {field.instructions && (
                                <p>{field.instructions}</p>
                              )}
                              {!!field.options.length && (
                                <p>선택지: {field.options.join(" · ")}</p>
                              )}
                              {!!field.fileTypes.length && (
                                <p>파일: {field.fileTypes.join(", ")}</p>
                              )}
                              {field.maxLength != null && (
                                <p>최대 {field.maxLength}자</p>
                              )}
                            </div>
                          </details>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          )}
          {startedAt && (
            <details className="space-y-3 border-t border-neutral-1000-a10 pt-3 text-sm">
              <summary className="cursor-pointer text-neutral-muted">
                실행 상세
              </summary>
              <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-muted">
                <span>{seconds(result?.durationMs ?? elapsed)}</span>
                <span>모델 비용 {money(usage)} · Browserbase 제외</span>
                <span>모델 요청 {usage?.requests ?? 0}회</span>
                {!!usage?.searchRequests && (
                  <span>
                    검색 {usage.searchRequests}회 ·{" "}
                    {usage.searchCostUsd == null
                      ? "비용 미확인"
                      : `$${usage.searchCostUsd.toFixed(6)}`}
                  </span>
                )}
                {!!usage?.contentRequests && (
                  <span>
                    공고 읽기 {usage.contentRequests}회 ·{" "}
                    {usage.contentCostUsd == null
                      ? "비용 미확인"
                      : `$${usage.contentCostUsd.toFixed(6)}`}
                  </span>
                )}
                <MuteButton
                  type="button"
                  onClick={download}
                  disabled={running || (!result && !logs.length)}
                >
                  로그 다운로드
                </MuteButton>
              </div>
              {result?.resolution?.savedUrl && (
                <p className="break-all">
                  저장된 공고 URL: {result.resolution.savedUrl}
                </p>
              )}
              {result?.resolution?.searches.map((search, index) => (
                <div key={index} className="space-y-1">
                  <p>{search.query}</p>
                  <p className="text-neutral-muted">{search.reason}</p>
                </div>
              ))}
              {!!logs.length && (
                <div
                  ref={logPanel}
                  onScroll={() => {
                    const panel = logPanel.current;
                    if (panel)
                      followLogs.current =
                        panel.scrollHeight -
                          panel.scrollTop -
                          panel.clientHeight <
                        40;
                  }}
                  className="max-h-[440px] overflow-auto rounded-lg border border-neutral-1000-a10 bg-bg-floating text-xs"
                >
                  {logs.map((event, index) => (
                    <InspectionLogEntry
                      key={`${startedAt}:${index}`}
                      event={event}
                    />
                  ))}
                </div>
              )}
              {form?.text && (
                <details>
                  <summary className="cursor-pointer text-neutral-muted">
                    페이지 원문
                  </summary>
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words bg-bg-weak p-3 text-xs">
                    {form.text}
                  </pre>
                </details>
              )}
            </details>
          )}
        </div>
      </div>
    </OpsShell>
  );
}
