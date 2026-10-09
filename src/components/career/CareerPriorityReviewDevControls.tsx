import React from "react";
import { Loader2, Play, RefreshCw, RotateCcw } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import RichText from "@/components/ui/rich-text";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import type { CareerTextChatModelId } from "@/lib/career/textChatModelConfig";
import {
  PRIORITY_REVIEW_TEST_CASES,
  type PriorityReviewTestCase,
  type PriorityReviewTestResult,
  type PriorityReviewTestRole,
} from "@/lib/career/priorityReviewTestContract";

const caseLabels: Record<PriorityReviewTestCase, string> = {
  missing: "1. fit 없음",
  low: "2. fit 낮음",
  high: "3. fit 높음",
};

export default function CareerPriorityReviewDevControls({
  model,
}: {
  model: CareerTextChatModelId;
}) {
  const { fetchWithAuth } = useCareerApi();
  const [expanded, setExpanded] = React.useState(false);
  const [role, setRole] = React.useState<PriorityReviewTestRole | null>(null);
  const [message, setMessage] = React.useState(
    "이 포지션 우선 검토 요청해 주세요."
  );
  const [results, setResults] = React.useState<
    Partial<Record<PriorityReviewTestCase, PriorityReviewTestResult>>
  >({});
  const [rounds, setRounds] = React.useState<
    Partial<Record<PriorityReviewTestCase, number>>
  >({});
  const [running, setRunning] = React.useState<
    PriorityReviewTestCase | "loading" | null
  >(null);
  const [error, setError] = React.useState("");
  const controllerRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => controllerRef.current?.abort(), []);

  async function openTests() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (role || running) return;
    setRunning("loading");
    setError("");
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response = await fetchWithAuth("/api/talent/dev-priority-review", {
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok || !payload.role)
        throw new Error(payload.error || "테스트 설정을 불러오지 못했습니다.");
      if (!controller.signal.aborted) setRole(payload.role);
    } catch (caught) {
      if (!controller.signal.aborted)
        setError(
          caught instanceof Error
            ? caught.message
            : "테스트 설정을 불러오지 못했습니다."
        );
    } finally {
      if (!controller.signal.aborted) setRunning(null);
    }
  }

  async function runTests(caseIds: readonly PriorityReviewTestCase[]) {
    if (!role || running || !message.trim()) return;
    setError("");
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      for (const caseId of caseIds) {
        if (controller.signal.aborted) break;
        setRunning(caseId);
        // Each POST starts with zero requests/recommendations and no previous
        // conversation. A repeated click cannot reuse the earlier round.
        setResults((current) => ({ ...current, [caseId]: undefined }));
        const response = await fetchWithAuth(
          "/api/talent/dev-priority-review",
          {
            method: "POST",
            signal: controller.signal,
            body: JSON.stringify({
              caseId,
              roleId: role.roleId,
              message,
              model,
            }),
          }
        );
        const payload = await response.json();
        if (!response.ok || !payload.result)
          throw new Error(payload.error || "응답 생성에 실패했습니다.");
        if (!controller.signal.aborted) {
          setResults((current) => ({ ...current, [caseId]: payload.result }));
          setRounds((current) => ({
            ...current,
            [caseId]: (current[caseId] ?? 0) + 1,
          }));
        }
      }
    } catch (caught) {
      if (!controller.signal.aborted)
        setError(
          caught instanceof Error ? caught.message : "응답 생성에 실패했습니다."
        );
    } finally {
      if (!controller.signal.aborted) setRunning(null);
    }
  }

  return (
    <section
      className="mt-4 border-t border-neutral-1000-a10 pt-3"
      aria-label="우선 검토 응답 테스트"
    >
      <MuteButton onClick={() => void openTests()} aria-expanded={expanded}>
        우선 검토 응답 테스트
        {running === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : null}
      </MuteButton>
      {expanded ? (
        <div className="mt-3 space-y-3">
          {role ? (
            <p className="text-sm text-neutral-primary">
              {role.companyName} · {role.roleTitle}
            </p>
          ) : null}
          <label className="grid gap-1.5 text-xs text-neutral-muted">
            테스트할 요청 문장
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={2}
              maxLength={1600}
              disabled={Boolean(running)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <MuteButton
              disabled={!role || Boolean(running) || !message.trim()}
              onClick={() => void runTests(PRIORITY_REVIEW_TEST_CASES)}
            >
              {running && running !== "loading" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              세 상태 리셋하고 실행
            </MuteButton>
            <MuteButton
              disabled={Boolean(running)}
              onClick={() => {
                setResults({});
                setRounds({});
                setError("");
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" /> 결과 비우기
            </MuteButton>
          </div>
          {error ? (
            <p role="alert" className="text-xs text-critical">
              {error}
            </p>
          ) : null}
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns:
                "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
            }}
          >
            {PRIORITY_REVIEW_TEST_CASES.map((caseId) => {
              const result = results[caseId];
              return (
                <div
                  key={caseId}
                  className="min-w-0 rounded-lg border border-neutral-1000-a10 bg-bg-floating p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-neutral-primary">
                      {caseLabels[caseId]}
                    </span>
                    <MuteButton
                      aria-label={`${caseLabels[caseId]} ${rounds[caseId] ? "리셋하고 다시 실행" : "리셋하고 실행"}`}
                      disabled={!role || Boolean(running) || !message.trim()}
                      onClick={() => void runTests([caseId])}
                    >
                      {running === caseId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      {rounds[caseId] ? "리셋하고 다시 실행" : "리셋하고 실행"}
                    </MuteButton>
                  </div>
                  {result ? (
                    <div className="mt-3 space-y-3" aria-live="polite">
                      <p className="text-xs text-neutral-soft">
                        {rounds[caseId]}회 ·{" "}
                        {(result.elapsedMs / 1000).toFixed(1)}초 ·{" "}
                        {result.model}
                      </p>
                      <RichText content={result.response} variant="career" />
                      <p className="text-xs text-neutral-muted">
                        테스트 기록: 검토 요청 {result.requestCount}건 · 추천
                        카드 {result.recommendationCount}건
                      </p>
                      {result.recommendationCount ? (
                        <div className="rounded-md bg-bg-weak p-3 text-xs text-neutral-primary">
                          추천 카드 미리보기 · {result.role.companyName} ·{" "}
                          {result.role.roleTitle}
                        </div>
                      ) : null}
                      <details className="text-xs text-neutral-muted">
                        <summary className="cursor-pointer">
                          도구 호출 확인 ({result.trace.length})
                        </summary>
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">
                          {JSON.stringify(result.trace, null, 2)}
                        </pre>
                      </details>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-neutral-soft">
                      {running === caseId
                        ? "새 응답을 생성하고 있어요."
                        : "실행하면 이번 응답이 여기에 표시돼요."}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
