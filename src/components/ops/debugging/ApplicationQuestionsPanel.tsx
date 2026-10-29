import type { InspectionRole } from "@/lib/ops/applicationFormInspection";
import { useEffect, useRef, useState } from "react";
import { ApplicationQuestionFields } from "./ApplicationQuestionFields";
import { Input } from "@/components/ui/input";
import { MuteButton } from "@/components/ui/button";
import { fetchResponseWithInternalAuth } from "@/lib/internalApiClient";
import {
  inspectionOutcome,
  type ApplicationQuestions,
  type QuestionProvider,
  type QuestionsExecution,
  questionProviderLabels,
} from "@/lib/ops/applicationQuestions";

export function ApplicationQuestionsPanel({
  canFetch,
  provider = "current",
  url,
  onUrlChange,
  role,
  resolveOfficialLink,
  onRunningChange,
}: {
  canFetch: boolean;
  provider?: QuestionProvider;
  url: string;
  onUrlChange: (value: string) => void;
  role: InspectionRole | null;
  resolveOfficialLink: boolean;
  onRunningChange?: (running: boolean) => void;
}) {
  const [model, setModel] = useState("gpt-6-luna");
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<
    Partial<
      Record<
        QuestionProvider,
        {
          result?: ApplicationQuestions;
          error?: string;
          execution?: QuestionsExecution;
          costLoading?: boolean;
          costError?: string;
          url: string;
        }
      >
    >
  >({});
  const current = runs[provider];
  const result = current?.result;
  const error = current?.error;
  const execution = current?.execution;
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function refreshCost() {
    const sessionId = execution?.sessionId;
    if (!sessionId || provider !== "browser-use" || current?.costLoading)
      return;
    setRuns((previous) => ({
      ...previous,
      [provider]: {
        ...previous[provider]!,
        costLoading: true,
        costError: undefined,
      },
    }));
    try {
      const response = await fetchResponseWithInternalAuth(
        `/api/internal/debug/application-form/questions?sessionId=${encodeURIComponent(sessionId)}`
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "비용을 조회하지 못했습니다.");
      setRuns((previous) => {
        const run = previous[provider];
        if (run?.execution?.sessionId !== sessionId) return previous;
        return {
          ...previous,
          [provider]: {
            ...run,
            costLoading: false,
            execution: { ...run.execution, sessionCost: data },
          },
        };
      });
    } catch (failure) {
      setRuns((previous) => {
        const run = previous[provider];
        if (run?.execution?.sessionId !== sessionId) return previous;
        return {
          ...previous,
          [provider]: {
            ...run,
            costLoading: false,
            costError:
              failure instanceof Error
                ? failure.message
                : "비용을 조회하지 못했습니다.",
          },
        };
      });
    }
  }

  async function run() {
    if (
      !canFetch ||
      request.current ||
      !(url.trim() || (resolveOfficialLink && role))
    )
      return;
    const abort = new AbortController();
    request.current = abort;
    setRunning(true);
    onRunningChange?.(true);
    setRuns((previous) => ({ ...previous, [provider]: { url: url.trim() } }));
    try {
      const response = await fetchResponseWithInternalAuth(
        "/api/internal/debug/application-form/questions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(resolveOfficialLink && role
              ? { roleId: role.id }
              : { url: url.trim() }),
            resolveOfficialLink,
            provider,
            ...(provider === "browser-use" ? { model } : {}),
          }),
          signal: abort.signal,
        }
      );
      const data = await response.json();
      setRuns((previous) => ({
        ...previous,
        [provider]: {
          url: url.trim(),
          ...(response.ok
            ? { result: data }
            : { error: data.error || "질문을 가져오지 못했습니다." }),
          execution: data.execution,
        },
      }));
    } catch (failure) {
      if (!abort.signal.aborted)
        setRuns((previous) => ({
          ...previous,
          [provider]: {
            url: url.trim(),
            error:
              failure instanceof Error
                ? failure.message
                : "질문을 가져오지 못했습니다.",
          },
        }));
    } finally {
      request.current = null;
      setRunning(false);
      onRunningChange?.(false);
    }
  }

  return (
    <div className="space-y-5">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        {provider === "browser-use" && (
          <div className="space-y-1.5">
            <label htmlFor="questions-model" className="text-sm font-medium">
              모델
            </label>
            <Input
              id="questions-model"
              value={model}
              required
              disabled={running}
              onChange={(event) => setModel(event.target.value)}
            />
          </div>
        )}
        <div className="min-w-64 flex-1 space-y-1.5">
          <label htmlFor="questions-url" className="text-sm font-medium">
            공고 / 지원 URL
          </label>
          <Input
            id="questions-url"
            type="url"
            required={!resolveOfficialLink || !role}
            placeholder="https://…"
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            disabled={running}
          />
        </div>
        <MuteButton
          type="submit"
          variant="primary"
          disabled={
            !canFetch ||
            running ||
            !(url.trim() || (resolveOfficialLink && role)) ||
            (provider === "browser-use" && !model.trim())
          }
        >
          {running ? "가져오는 중…" : "질문 가져오기"}
        </MuteButton>
      </form>
      {running && (
        <p role="status" className="text-sm text-neutral-muted">
          {resolveOfficialLink ? "공식 링크 탐색 및 " : ""}
          {questionProviderLabels[provider]} 실행 중…
        </p>
      )}
      {error && (
        <div role="alert" className="space-y-1 text-sm text-critical">
          <p className="font-medium">질문을 가져오지 못했습니다</p>
          <p>{error}</p>
        </div>
      )}
      {result?.linkResolution && (
        <details open className="space-y-2 text-sm">
          <summary className="cursor-pointer text-neutral-muted">
            공식 링크 탐색 결과
          </summary>
          <p className="break-all">
            입력 URL: {result.linkResolution.originalUrl}
          </p>
          {result.linkResolution.searches.map((search, index) => (
            <div key={index} className="space-y-1">
              <p>Exa 검색: {search.query}</p>
              {search.selectedUrl && (
                <a
                  href={search.selectedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block break-all text-link underline"
                >
                  {search.selectedUrl}
                </a>
              )}
              <p className="text-neutral-muted">{search.reason}</p>
            </div>
          ))}
          {result.linkResolution.savedUrl && (
            <p className="break-all">
              저장된 공고 URL: {result.linkResolution.savedUrl}
            </p>
          )}
          <p className="text-xs text-neutral-muted">
            링크 탐색 모델 $
            {result.linkResolution.usage.estimatedCostUsd?.toFixed(6) ??
              "미확인"}{" "}
            · Exa 검색 $
            {result.linkResolution.usage.searchCostUsd?.toFixed(6) ?? "미확인"}{" "}
            · 원문 조회 $
            {result.linkResolution.usage.contentCostUsd?.toFixed(6) ?? "미확인"}
          </p>
          {result.linkResolution.attempts.length > 1 && (
            <div className="text-xs text-neutral-muted">
              {result.linkResolution.attempts.map((attempt, index) => (
                <p key={index} className="break-all">
                  {index + 1}차: {attempt.url} · {attempt.status} · Run:{" "}
                  {attempt.execution?.runId ?? "미제공"} ·{" "}
                  {attempt.execution?.sessionCost
                    ? `조회 시점 합계 $${attempt.execution.sessionCost.totalCostUsd}`
                    : attempt.execution?.runCostUsd != null
                      ? `모델·검색 $${attempt.execution.runCostUsd}`
                      : "건별 비용 미확인"}
                </p>
              ))}
            </div>
          )}
        </details>
      )}
      {result && (
        <section className="space-y-3" aria-label="질문 추출 결과">
          <p className="break-all text-xs text-neutral-muted">{result.url}</p>
          <h2
            role="status"
            className={`text-base font-semibold ${result.status === "unavailable" ? "text-critical" : result.status === "partial" || !result.questions.length ? "text-neutral-primary" : "text-positive"}`}
          >
            {inspectionOutcome(result.status, result.questions.length, "질문")}
          </h2>
          {result.limitations.map((limitation, index) => (
            <p key={index} className="text-sm text-neutral-muted">
              {limitation}
            </p>
          ))}
          {!!result.questions.length && (
            <ApplicationQuestionFields
              key={`${provider}-${execution?.runId ?? execution?.durationMs ?? "result"}`}
              questions={result.questions}
            />
          )}
        </section>
      )}
      {execution && (
        <details
          className="space-y-2 border-t border-neutral-1000-a10 pt-3 text-sm"
          open={provider !== "current"}
        >
          <summary className="cursor-pointer text-neutral-muted">
            {(result?.linkResolution?.attempts.length ?? 0) > 1
              ? "마지막 실행 시간·비용"
              : "실행 시간·비용"}
          </summary>
          <div className="flex flex-wrap gap-4 text-xs">
            <span>{(execution.durationMs / 1000).toFixed(1)}초</span>
            <span>모델: {execution.model ?? "제공사 미공개"}</span>
            {execution.reasoning && <span>추론: {execution.reasoning}</span>}
            {execution.inputTokens != null && (
              <span>
                입력 {execution.inputTokens.toLocaleString()} · 출력{" "}
                {execution.outputTokens?.toLocaleString() ?? "미확인"} 토큰
              </span>
            )}
          </div>
          {execution.sessionCost ? (
            <div className="space-y-1 text-xs">
              <p>조회 시점 합계 ${execution.sessionCost.totalCostUsd}</p>
              <p>
                모델 ${execution.sessionCost.llmCostUsd} · 검색 $
                {execution.sessionCost.searchCostUsd} · 브라우저 $
                {execution.sessionCost.browserCostUsd} · 프록시 $
                {execution.sessionCost.proxyCostUsd}
              </p>
              <p className="text-neutral-muted">
                사용량 반영이 약 90초 지연될 수 있습니다. 크레딧 적용 전
                사용량이며 최종 청구액은 아닙니다.
              </p>
            </div>
          ) : (
            <p className="text-xs text-neutral-muted">
              {execution.runCostUsd != null
                ? `모델·검색 $${execution.runCostUsd} · 브라우저·프록시 비용 미확인`
                : "건별 비용 미제공"}
            </p>
          )}
          {execution.runId && (
            <p className="break-all text-xs text-neutral-muted">
              Run: {execution.runId}
            </p>
          )}
          {provider === "browser-use" && execution.sessionId && (
            <MuteButton
              type="button"
              disabled={!canFetch || running || current?.costLoading}
              onClick={() => void refreshCost()}
            >
              {current?.costLoading ? "조회 중…" : "비용 새로고침"}
            </MuteButton>
          )}
          {current?.costError && (
            <p role="alert" className="text-xs text-critical">
              {current.costError}
            </p>
          )}
          {execution.sessionId && (
            <p className="break-all text-xs text-neutral-muted">
              Session: {execution.sessionId}
            </p>
          )}
          {execution.warnings.map((warning, index) => (
            <p key={index} className="text-xs text-critical">
              {warning}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
