// career-i18n-skip-file: Internal developer controls and synthetic preview copy.
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import {
  CAREER_BACKGROUND_STATUS,
  type CareerBackgroundLogPage,
  type CareerBackgroundToolLog,
} from "@/lib/career/background/toolTrace";

const activeStatuses = new Set(["queued", "running", "handed_off"]);

export function CareerAgentToolLogList({
  logs,
  active,
}: {
  logs: CareerBackgroundToolLog[];
  active: boolean;
}) {
  const calls = useMemo(() => {
    const groups = new Map<string, CareerBackgroundToolLog[]>();
    for (const log of logs) {
      const entries = groups.get(log.executionId) ?? [];
      entries.push(log);
      groups.set(log.executionId, entries);
    }
    return [...groups.values()];
  }, [logs]);
  return (
    <ol className="space-y-3" aria-label="도구 호출 로그">
      {calls.map((events, index) => {
        const first = events[0];
        const start = events.find((event) => event.phase === "started");
        const end = events.find((event) => event.phase !== "started");
        return (
          <li
            key={first.executionId}
            className="rounded-xl border border-neutral-1000-a10 bg-bg-weak p-3"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-neutral-muted">{index + 1}.</span>
              <strong className="break-all font-medium">{first.name}</strong>
              <span
                className={
                  end?.phase === "threw"
                    ? "text-critical"
                    : "text-neutral-muted"
                }
              >
                {end
                  ? end.phase === "threw"
                    ? "오류"
                    : "결과 반환"
                  : active
                    ? "실행 중"
                    : "종료 결과 없음"}
              </span>
              {end?.durationMs !== undefined ? (
                <span className="text-neutral-muted">
                  {(end.durationMs / 1000).toFixed(2)}초
                </span>
              ) : null}
              <time
                dateTime={first.occurredAt}
                className="ml-auto text-xs text-neutral-muted"
              >
                {new Date(first.occurredAt).toLocaleTimeString("ko-KR", {
                  hour12: false,
                })}
              </time>
            </div>
            {first.callId ? (
              <div className="mt-1 break-all font-mono text-xs text-neutral-muted">
                {first.callId}
              </div>
            ) : null}
            {[
              ["입력", start?.inputText],
              ["결과", end?.resultText],
              ["오류", end?.errorText],
              ["진단", end?.diagnosticsText],
            ].map(([label, text]) =>
              text !== undefined ? (
                <details key={label} open className="mt-2">
                  <summary className="cursor-pointer text-xs text-neutral-muted">
                    {label}
                  </summary>
                  <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-bg-floating p-3 font-mono text-xs leading-5">
                    {text}
                  </pre>
                </details>
              ) : null
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function CareerAgentRunDevModal({
  runId,
  pending,
  error,
  onRetry,
  onClose,
}: {
  runId: string | null;
  pending: boolean;
  error: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { fetchWithAuth } = useCareerApi();
  const [snapshot, setSnapshot] = useState<CareerBackgroundLogPage | null>(
    null
  );
  const [readError, setReadError] = useState("");
  const scrollArea = useRef<HTMLDivElement>(null);
  const followTail = useRef(true);
  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cursor = 0;
    const poll = async () => {
      try {
        const response = await fetchWithAuth(
          `/api/talent/dev-career-agent?runId=${runId}&after=${cursor}`,
          { signal: controller.signal }
        );
        const page = await response.json();
        if (!response.ok)
          throw new Error(page.error || "실행 로그를 불러오지 못했습니다.");
        if (controller.signal.aborted) return;
        const next = page as CareerBackgroundLogPage;
        cursor = next.nextCursor;
        setSnapshot((previous) => ({
          ...next,
          logs: [
            ...new Map(
              [
                ...(previous?.run.id === runId ? previous.logs : []),
                ...next.logs,
              ].map((log) => [log.id, log])
            ).values(),
          ].sort((a, b) => a.id - b.id),
        }));
        setReadError("");
        if (next.hasMore || activeStatuses.has(next.run.status))
          timer = setTimeout(() => void poll(), next.hasMore ? 0 : 1000);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setReadError(
          cause instanceof Error
            ? cause.message
            : "실행 로그를 불러오지 못했습니다."
        );
        timer = setTimeout(() => void poll(), 3000);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [fetchWithAuth, runId]);
  useEffect(() => {
    const element = scrollArea.current;
    if (element && followTail.current) element.scrollTop = element.scrollHeight;
  }, [snapshot?.logs.length]);
  const active =
    pending ||
    Boolean(runId && (!snapshot || activeStatuses.has(snapshot.run.status)));
  return (
    <TalentCareerModal
      open
      onClose={onClose}
      title="Career agent 실행 로그"
      panelClassName="sm:max-w-4xl"
      bodyClassName="px-4 pb-5 sm:px-5"
    >
      <div data-career-i18n-skip="true" className="space-y-3">
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          {active ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending
            ? "실행 접수 중..."
            : snapshot
              ? (CAREER_BACKGROUND_STATUS[snapshot.run.status] ??
                snapshot.run.status)
              : error
                ? "접수 실패"
                : "로그를 불러오는 중..."}
          {snapshot?.run.outcome === "no_send" ? (
            <span>이메일 없이 완료</span>
          ) : null}
          {snapshot?.run.outcome === "sent" ? (
            <span>이메일 발송 완료</span>
          ) : null}
          <span className="text-neutral-muted">
            도구 호출{" "}
            {new Set(snapshot?.logs.map((log) => log.executionId)).size}건
          </span>
        </div>
        {runId ? (
          <p className="break-all font-mono text-xs text-neutral-muted">
            {runId}
          </p>
        ) : null}
        {error || readError || snapshot?.run.error ? (
          <p
            role="alert"
            className="whitespace-pre-wrap break-words text-sm text-critical"
          >
            {error || readError || snapshot?.run.error}
          </p>
        ) : null}
        {error && !pending ? (
          <MuteButton onClick={onRetry}>접수 다시 시도</MuteButton>
        ) : null}
        <div
          ref={scrollArea}
          className="max-h-[60vh] overflow-y-auto overscroll-contain"
          onScroll={(event) => {
            const el = event.currentTarget;
            followTail.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          <CareerAgentToolLogList logs={snapshot?.logs ?? []} active={active} />
          {!snapshot?.logs.length ? (
            <p className="py-8 text-center text-sm text-neutral-muted">
              {active
                ? "도구 호출을 기다리는 중..."
                : "기록된 도구 호출이 없습니다."}
            </p>
          ) : null}
        </div>
        {active ? (
          <p className="text-xs text-neutral-muted">
            모달을 닫아도 실행은 계속됩니다.
          </p>
        ) : null}
      </div>
    </TalentCareerModal>
  );
}
