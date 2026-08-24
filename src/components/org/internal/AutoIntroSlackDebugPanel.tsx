"use client";

import { AlertTriangle, Check, Copy, LoaderCircle, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import {
  getInternalAccessToken,
  refreshInternalAccessToken,
} from "@/lib/internalApiClient";
import type {
  AutoIntroManualDoneEvent,
  AutoIntroManualTraceEvent,
} from "@/lib/ops/autoIntroToCompanyDebugTypes";

type RunEvent = AutoIntroManualTraceEvent | AutoIntroManualDoneEvent;
type RunState = "idle" | "running" | "success" | "error";

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function eventTitle(event: RunEvent) {
  switch (event.type) {
    case "status":
      return event.message;
    case "prompt":
      return `실제 LLM 입력 준비 완료 · ${event.model}`;
    case "llm_request":
      return `LLM 호출 ${event.iteration} 시작 · ${event.model}`;
    case "llm_response":
      return `LLM 호출 ${event.iteration} 응답 · tool ${event.toolCalls.length}개`;
    case "tool_start":
      return `Tool 시작 · ${event.name}`;
    case "tool_result":
      return `Tool 결과 · ${event.name}`;
    case "submission":
      return `최종 구조화 결과 · ${event.model}`;
    case "delivery":
      return event.slackSent ? "Slack 전송 완료" : "Slack 전송 실패";
    case "done":
      return event.ok ? "전체 실행 완료" : "실행 종료 · 전송 실패";
    case "error":
      return `오류 · ${event.message}`;
  }
}

function eventDetail(event: RunEvent) {
  switch (event.type) {
    case "status":
    case "prompt":
    case "done":
    case "error":
      return null;
    case "llm_request":
      return formatJson({
        iteration: event.iteration,
        messageCount: event.messageCount,
        model: event.model,
        webToolsAvailable: event.webToolsAvailable,
      });
    case "llm_response":
      return formatJson({
        content: event.content,
        toolCalls: event.toolCalls,
        usage: event.usage,
      });
    case "tool_start":
      return [
        "Arguments passed by the LLM (exact)",
        event.arguments,
        "",
        "Parsed input",
        formatJson(event.input),
      ].join("\n");
    case "tool_result":
      return event.content;
    case "submission":
      return formatJson({
        output: event.output,
        webToolCallCount: event.webToolCallCount,
      });
    case "delivery":
      return [
        `slackConnected: ${event.slackConnected}`,
        `slackSent: ${event.slackSent}`,
        `slackError: ${event.slackError ?? "-"}`,
        `idempotencyKey: ${event.idempotencyKey}`,
        "",
        "Slack message body",
        event.body,
      ].join("\n");
  }
}

async function accessToken() {
  return (await getInternalAccessToken()) ?? refreshInternalAccessToken();
}

async function parseErrorResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return payload?.error ?? `요청에 실패했습니다. (${response.status})`;
}

async function openRunStream(args: {
  body: Record<string, string>;
  signal: AbortSignal;
}) {
  let token = await accessToken();
  if (!token) {
    throw new Error("로그인 세션을 찾지 못했습니다. 다시 로그인해 주세요.");
  }
  const request = (accessToken: string) =>
    fetch("/api/internal/matching/auto-intro-to-company/manual", {
      body: JSON.stringify(args.body),
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: args.signal,
    });

  let response = await request(token);
  if (response.status === 401) {
    const refreshed = await refreshInternalAccessToken();
    if (refreshed) {
      token = refreshed;
      response = await request(token);
    }
  }
  if (!response.ok) throw new Error(await parseErrorResponse(response));
  if (!response.body) throw new Error("실행 스트림을 열지 못했습니다.");
  return response.body.getReader();
}

export default function AutoIntroSlackDebugPanel({
  roleId,
  talentId,
  workspaceId,
}: {
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  const [runState, setRunState] = useState<RunState>("idle");
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<"system" | "user" | null>(
    null
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  const acceptEvent = (event: RunEvent) => {
    setEvents((current) => [...current, event]);
    if (event.type === "prompt") {
      setSystemPrompt(event.systemPrompt);
      setUserPrompt(event.userPrompt);
    } else if (event.type === "error") {
      setErrorMessage(event.message);
      setRunState("error");
    } else if (event.type === "done") {
      setRunState(event.ok ? "success" : "error");
      if (!event.ok) {
        setErrorMessage(
          "메시지 생성은 끝났지만 Slack 채널로 전송되지 않았습니다. 아래 전송 결과를 확인해 주세요."
        );
      }
    }
  };

  const run = async () => {
    const confirmed = window.confirm(
      "프롬프트 테스트가 끝나면 이 회사의 실제 Slack 채널로 후보자 추천 메시지를 전송합니다. 계속할까요?"
    );
    if (!confirmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunState("running");
    setEvents([]);
    setSystemPrompt("");
    setUserPrompt("");
    setErrorMessage(null);
    setCopiedPrompt(null);

    try {
      const reader = await openRunStream({
        body: { roleId, talentId, workspaceId },
        signal: controller.signal,
      });
      const decoder = new TextDecoder();
      let buffer = "";
      let terminalEventReceived = false;
      for (;;) {
        const { done, value } = await reader.read();
        buffer += decoder
          .decode(value, { stream: !done })
          .replace(/\r\n/g, "\n");
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = frame
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (data) {
            const event = JSON.parse(data) as RunEvent;
            if (event.type === "done" || event.type === "error") {
              terminalEventReceived = true;
            }
            acceptEvent(event);
          }
          boundary = buffer.indexOf("\n\n");
        }
        if (done) break;
      }
      if (!terminalEventReceived) {
        throw new Error("실행 결과를 받기 전에 스트림이 종료되었습니다.");
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setErrorMessage(
        error instanceof Error ? error.message : "실행에 실패했습니다."
      );
      setRunState("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const copyPrompt = async (kind: "system" | "user", value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedPrompt(kind);
    window.setTimeout(
      () => setCopiedPrompt((current) => (current === kind ? null : current)),
      1_500
    );
  };

  return (
    <section className="space-y-4 border-t border-neutral-1000-a10 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-medium text-neutral-primary">
              Slack 추천 메시지 프롬프트 테스트
            </h3>
            <Badge
              className={
                runState === "success"
                  ? "bg-positive-faded text-positive"
                  : runState === "error"
                    ? "bg-critical-faded text-critical"
                    : runState === "running"
                      ? "bg-info-faded text-info"
                      : undefined
              }
              radius="full"
              size="sm"
              variant="faded"
            >
              {runState === "running"
                ? "실행 중"
                : runState === "success"
                  ? "전송 완료"
                  : runState === "error"
                    ? "오류"
                    : "대기"}
            </Badge>
          </div>
          <p className="max-w-2xl text-[12px] font-light leading-5 text-neutral-muted">
            자동 발송 조건과 중복 여부를 무시하고 지금 보고 있는 후보자와 역할로
            실행합니다. 프롬프트와 tool 과정은 이 화면에만 표시되며 저장하지
            않습니다.
          </p>
        </div>
        <MuteButton
          disabled={runState === "running"}
          onClick={() => void run()}
          size="lg"
          variant="warn"
        >
          {runState === "running" ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Send />
          )}
          {runState === "running" ? "실행 중" : "생성 후 실제 Slack 전송"}
        </MuteButton>
      </div>

      <div className="flex gap-2 rounded-md border border-critical/20 bg-critical-faded px-3 py-2.5 text-[12px] leading-5 text-critical">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />이 버튼은 preview가
        아니라 실제 회사 Slack 채널에 메시지를 보냅니다. 반복 테스트하면 매번 새
        메시지가 전송됩니다.
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-critical/20 bg-critical-faded px-3 py-2.5 text-[12px] text-critical">
          {errorMessage}
        </div>
      ) : null}

      {systemPrompt || userPrompt ? (
        <div className="space-y-4">
          {[
            {
              kind: "system" as const,
              label: "SYSTEM prompt · 실제 입력 원문",
              value: systemPrompt,
            },
            {
              kind: "user" as const,
              label: "USER prompt + data · 실제 입력 원문",
              value: userPrompt,
            },
          ].map((prompt) => (
            <div className="space-y-2" key={prompt.kind}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12px] font-medium text-neutral-primary">
                  {prompt.label}
                </div>
                <MuteButton
                  onClick={() => void copyPrompt(prompt.kind, prompt.value)}
                  size="sm"
                  variant="transparent"
                >
                  {copiedPrompt === prompt.kind ? <Check /> : <Copy />}
                  {copiedPrompt === prompt.kind ? "복사됨" : "전체 복사"}
                </MuteButton>
              </div>
              <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-neutral-1000-a10 bg-bg-weak p-3 text-[11px] leading-5 text-neutral-primary">
                {prompt.value}
              </pre>
            </div>
          ))}
        </div>
      ) : null}

      {events.length > 0 ? (
        <div className="space-y-2">
          <div className="text-[12px] font-medium text-neutral-primary">
            실행 과정 · 이번 화면에서만 유지
          </div>
          <div className="divide-y divide-neutral-1000-a05 border-y border-neutral-1000-a05">
            {events.map((event, index) => {
              const detail = eventDetail(event);
              return detail ? (
                <details className="py-2.5" key={`${event.type}-${index}`}>
                  <summary className="cursor-pointer text-[12px] text-neutral-primary">
                    {eventTitle(event)}
                  </summary>
                  <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-bg-weak p-3 text-[11px] leading-5 text-neutral-muted">
                    {detail}
                  </pre>
                </details>
              ) : (
                <div
                  className="flex items-center gap-2 py-2.5 text-[12px] text-neutral-muted"
                  key={`${event.type}-${index}`}
                >
                  {event.type === "done" && event.ok ? (
                    <Check className="size-3.5 text-positive" />
                  ) : runState === "running" && index === events.length - 1 ? (
                    <LoaderCircle className="size-3.5 animate-spin text-info" />
                  ) : null}
                  {eventTitle(event)}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
