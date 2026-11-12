import { useEffect, useRef, useState } from "react";
import { DebuggingPageShell, useCanFetchInternal } from "@/components/ops/debugging/shared";
import { opsTheme } from "@/components/ops/theme";
import { Button, MuteButton } from "@/components/ui/button";
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList,
} from "@/components/ui/combobox";
import { useOpsCareerDetail, useOpsCareerTalents } from "@/hooks/ops/useOpsCareer";
import { fetchResponseWithInternalAuth } from "@/lib/internalApiClient";
import { readInspectionStream } from "@/lib/ops/applicationFormInspection";
import type { CareerRunStreamEvent, CareerRunTool } from "@/lib/ops/careerRunDebug";
import type { CareerTalentSummary } from "@/lib/ops/careerServer";
import { useAuthStore } from "@/store/useAuthStore";
import { useOpsCareerRunSelectionStore } from "@/store/useOpsCareerRunSelectionStore";

const endpoint = "/api/internal/debug/career-runs";
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}초`;
type CareerRunAccount = Pick<CareerTalentSummary, "userId" | "name" | "email">;
const label = (account: CareerRunAccount) =>
  [account.name, account.email].filter(Boolean).join(" · ") || account.userId;

export default function CareerRunsPage() {
  const userId = useAuthStore(state => state.user?.id);
  return <CareerRuns key={userId ?? "signed-out"} operatorId={userId} />;
}

function CareerRuns({ operatorId }: { operatorId?: string }) {
  const canFetch = useCanFetchInternal();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const selectedUserId = useOpsCareerRunSelectionStore(state =>
    canFetch && operatorId ? state.selectedUserIds[operatorId] : undefined
  );
  const selectUser = useOpsCareerRunSelectionStore(state => state.selectUser);
  const [events, setEvents] = useState<CareerRunStreamEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => () => active.current?.abort(), []);

  const accounts = useOpsCareerTalents(20, canFetch, search);
  const options = accounts.data?.pages.flatMap(page => page.talents) ?? [];
  const selectedOption = options.find(account => account.userId === selectedUserId);
  const savedAccount = useOpsCareerDetail(selectedUserId, canFetch && !selectedOption);
  const selected = selectedOption ?? savedAccount.data ?? null;
  const selectionError = !selectedOption ? savedAccount.error?.message : undefined;
  async function start() {
    if (!selected || active.current) return;
    const request = new AbortController();
    active.current = request;
    setEvents([]);
    setError("");
    setRunning(true);
    try {
      const response = await fetchResponseWithInternalAuth(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.userId }),
        signal: request.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Career run을 시작하지 못했습니다.");
      }
      await readInspectionStream<CareerRunStreamEvent>(response.body, event => {
        setEvents(current => [...current, event]);
        if (event.type === "error") setError(event.message);
      });
    } catch (cause) {
      if (!request.signal.aborted)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      active.current = null;
      setRunning(false);
    }
  }

  return (
    <DebuggingPageShell
      tab="careerRuns"
      showContextLabel={false}
      showDescription={false}
      filters={
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="w-80 max-w-full">
            <Combobox<CareerRunAccount>
              items={options}
              value={selected}
              filter={null}
              itemToStringLabel={label}
              itemToStringValue={item => item.userId}
              isItemEqualToValue={(a, b) => a.userId === b.userId}
              onValueChange={(account) => {
                if (canFetch && operatorId) selectUser(operatorId, account?.userId ?? null);
              }}
              onInputValueChange={(value, details) => {
                if (details.reason === "input-change" || details.reason === "input-clear")
                  setQuery(value);
              }}
              disabled={!canFetch || running}
            >
              <ComboboxInput aria-label="Career 계정" placeholder="이름 · 이메일 검색" showClear={Boolean(selected)} />
              <ComboboxContent>
                <ComboboxEmpty>{accounts.isFetching ? "검색 중" : "검색 결과 없음"}</ComboboxEmpty>
                <ComboboxList>{item => <ComboboxItem key={item.userId} value={item}>{label(item)}</ComboboxItem>}</ComboboxList>
                {accounts.hasNextPage ? (
                  <MuteButton onClick={() => void accounts.fetchNextPage()} disabled={accounts.isFetchingNextPage}>
                    더 보기
                  </MuteButton>
                ) : null}
              </ComboboxContent>
            </Combobox>
          </div>
          <Button onClick={() => void start()} disabled={!canFetch || !selected || running}>
            {running ? "실행 중…" : "정기 실행 미리보기"}
          </Button>
          <span className="text-sm text-neutral-muted">메일 발송·데이터 저장 없음</span>
        </div>
      }
    >
      {error || accounts.error || selectionError ? (
        <p role="alert" className={opsTheme.errorNotice}>{error || accounts.error?.message || selectionError}</p>
      ) : null}
      {running || events.length ? <RunResult events={events} running={running} /> : null}
    </DebuggingPageShell>
  );
}

const toolStatus = {
  running: "실행 중", read: "조회", preview: "미리보기", skipped: "미실행", failed: "오류",
};

function ToolCall({ tool }: { tool: CareerRunTool }) {
  const input = tool.input && typeof tool.input === "object"
    ? tool.input as Record<string, unknown>
    : {};
  const operation = typeof input.operation === "string" ? `operation=${input.operation}`
    : typeof input.action === "string" ? `action=${input.action}` : null;
  return (
    <details>
      <summary className="cursor-pointer break-words">
        <code>{tool.name}{operation ? ` (${operation})` : ""}</code>
        {" · "}{toolStatus[tool.status]}
        {tool.durationMs === null ? "" : ` · ${seconds(tool.durationMs)}`}
      </summary>
      <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-bg-weak p-2 text-xs text-neutral-primary">
        {JSON.stringify(tool.input ?? {}, null, 2)}
      </pre>
    </details>
  );
}

function RunResult({ events, running }: { events: CareerRunStreamEvent[]; running: boolean }) {
  const started = events.find(event => event.type === "started");
  const completed = events.find(event => event.type === "completed");
  const usage = completed?.usage ?? events.findLast(event => event.type === "turn")?.usage;
  const turns = new Map(events.flatMap(event => event.type === "turn" ? [[event.turn, event] as const] : []));
  const tools = new Map<string, CareerRunTool>();
  for (const event of events) {
    if (event.type === "tool") {
      tools.set(event.tool.id, { ...tools.get(event.tool.id), ...event.tool });
    }
  }
  const contacts = events.flatMap(event => event.type === "contact" ? [event.contact] : []);
  return (
    <div className={`${opsTheme.panel} space-y-3 p-4 text-sm`} aria-live="polite">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <strong>{started?.account}</strong>
        <span>{running ? started ? "실행 중" : "실행 준비 중" : completed ? "완료" : "실패"}</span>
        {completed ? <span>{seconds(completed.elapsedMs)}</span> : null}
        {usage?.calls ? (
          <span>
            모델 {usage.calls}회 · {usage.estimatedUsd === null ? "비용 미집계" : `$${usage.estimatedUsd.toFixed(5)}`}
            {usage.unpriced && usage.estimatedUsd !== null ? ` · 미집계 ${usage.unpriced}회` : ""}
          </span>
        ) : null}
      </div>
      {[...turns.values()].map(turn => {
        const calls = [...tools.values()].filter(tool => tool.turn === turn.turn);
        return (
          <div key={turn.turn} className="border-t border-stroke-subtle pt-2">
            <p>
              <strong>모델 호출 {turn.turn}</strong>
              {" · "}{turn.model ?? "Career"}
              {" · "}{turn.phase === "started" ? "응답 대기" : turn.phase === "failed" ? "오류" : `도구 ${calls.length}개`}
            </p>
            {calls.length ? (
              <ul className="mt-1 space-y-1 pl-4 text-neutral-muted">
                {calls.map(tool => (
                  <li key={tool.id}>
                    <ToolCall tool={tool} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
      {contacts.length || completed ? (
        <div className="space-y-3 border-t border-stroke-subtle pt-3">
          {completed && !contacts.some(contact => contact.channel === "email") ? <p><strong>메일</strong> · 생성 없음</p> : null}
          {contacts.map((contact, index) => (
            <div key={index} className="space-y-1">
              <p><strong>{contact.channel === "email" ? "메일" : "채팅"} 미리보기</strong></p>
              {contact.subject ? <p className="font-medium">{contact.subject}</p> : null}
              <p className="whitespace-pre-wrap break-words text-neutral-muted">{contact.text}</p>
            </div>
          ))}
        </div>
      ) : null}
      {completed?.outcome ? (
        <details className="text-neutral-muted">
          <summary className="cursor-pointer">모델 최종 응답</summary>
          <p className="mt-1 whitespace-pre-wrap break-words">{completed.outcome}</p>
        </details>
      ) : null}
    </div>
  );
}
