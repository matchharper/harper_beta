import {
  parseSimulationSession,
  resolveAnalysisCardAction,
  type SimulationCardRequest,
  type SimulationSession,
} from "@/lib/career/simulation/session";
import { SimulationStructuredResult } from "./SimulationStructuredResult";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import RichText from "@/components/ui/rich-text";
import { useCareerT } from "@/i18n/useCareerT";
import { useEffect, useRef, useState } from "react";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import {
  parseApplicationSimulation,
  type ApplicationSimulation,
} from "@/lib/career/simulation/types";

export function ApplicationSimulationCard({
  simulation: supplied,
  messageId,
  sessionMessage,
  disabled = false,
  onAction,
}: {
  simulation: ApplicationSimulation;
  messageId: string | number;
  sessionMessage?: {
    id: string | number;
    simulationSession?: SimulationSession;
  };
  disabled?: boolean;
  onAction?: (
    action: SimulationCardRequest,
    text: string
  ) => void | Promise<void>;
}) {
  const { fetchWithAuth } = useCareerApi();
  const [restored, setRestored] = useState<ApplicationSimulation | null>(null);
  const [now, setNow] = useState(Date.now);
  const simulation =
    restored && restored.updatedAt > supplied.updatedAt ? restored : supplied;
  const [loadedSession, setLoadedSession] = useState<{
    messageId: number;
    state: SimulationSession;
  }>();
  const [pendingAction, setPendingAction] = useState(false);
  const actionLock = useRef(false);
  const provided = sessionMessage?.simulationSession;
  const currentSession =
    provided &&
    (!loadedSession || provided.revision >= loadedSession.state.revision)
      ? { messageId: Number(sessionMessage!.id), state: provided }
      : loadedSession;
  useEffect(() => {
    if (!onAction || simulation.status !== "completed") return;
    const controller = new AbortController();
    void fetchWithAuth(
      `/api/talent/simulation?messageId=${encodeURIComponent(messageId)}`,
      { signal: controller.signal }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (controller.signal.aborted) return;
        const state = parseSimulationSession(body?.actionSession?.state);
        setLoadedSession(
          state ? { messageId: body.actionSession.messageId, state } : undefined
        );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [
    fetchWithAuth,
    messageId,
    simulation.status,
    simulation.updatedAt,
    provided?.revision,
    onAction,
  ]);
  const actionRequest = (
    actionId: string
  ): SimulationCardRequest | undefined =>
    currentSession
      ? {
          action: "select_analysis",
          sessionMessageId: currentSession.messageId,
          expectedRevision: currentSession.state.revision,
          analysisMessageId: Number(messageId),
          actionId,
        }
      : undefined;
  const canStartAction = (actionId: string) => {
    const request = actionRequest(actionId);
    return (
      !disabled &&
      !pendingAction &&
      !!request &&
      !!currentSession &&
      !!resolveAnalysisCardAction(currentSession.state, request)
    );
  };
  const startAction = async (actionId: string) => {
    if (!onAction || actionLock.current || !canStartAction(actionId)) return;
    const request = actionRequest(actionId)!;
    const action = resolveAnalysisCardAction(currentSession!.state, request)!;
    actionLock.current = true;
    setPendingAction(true);
    try {
      await onAction(
        request,
        t(
          "career.simulation.actionRequest",
          "‘{title}’ 액션을 함께 진행해 주세요.",
          { values: { title: action.title } }
        )
      );
    } finally {
      actionLock.current = false;
      setPendingAction(false);
    }
  };
  const stale =
    simulation.status === "running" &&
    now - Date.parse(simulation.updatedAt) > 240_000;
  // SSE owns live progress. Polling restores an in-flight card after a page reload.
  useEffect(() => {
    if (simulation.status !== "running" || stale) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      setNow(Date.now());
      try {
        const response = await fetchWithAuth(
          `/api/talent/simulation?messageId=${encodeURIComponent(messageId)}`,
          { signal: controller.signal }
        );
        if (response.ok) {
          const result = parseApplicationSimulation(
            (await response.json()).simulation
          );
          if (result && !controller.signal.aborted) setRestored(result);
        }
      } catch {
        /* Preserve the last visible stage while reconnecting. */
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 4000);
    };
    timer = setTimeout(poll, 4000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [fetchWithAuth, messageId, simulation.status, stale]);
  const t = useCareerT();
  const titles = {
    role: t("career.simulation.role", "Role·기업 분석"),
    comparison: t("career.simulation.comparison", "근거 대조·진단"),
    review: simulation.version === 4
      ? t("career.prep.combinedAnalysis", "근거 대조·준비 항목")
      : t("career.simulation.review", "검증·액션 제안"),
  };
  const labels = {
    pending: t("career.simulation.pending", "대기 중"),
    running: t("career.simulation.running", "분석 중"),
    completed: t("career.simulation.completed", "완료"),
    failed: t("career.simulation.failed", "분석 중단"),
    cancelled: t("career.simulation.cancelled", "취소됨"),
  };
  return (
    <section
      className="w-full max-w-[740px] overflow-hidden rounded-xl border border-neutral-1000-a10 bg-bg-floating"
      aria-label={t("career.apply.title", "하퍼로 지원하기")}
    >
      <div className="flex items-center justify-between gap-3 border-b border-neutral-1000-a05 p-4">
        <div>
          <div className="font-medium">
            {t("career.apply.title", "하퍼로 지원하기")}
          </div>
          <div className="text-sm text-neutral-muted">
            {simulation.roleName}
          </div>
        </div>
        <span
          role="status"
          className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-neutral-muted"
        >
          {simulation.status === "running" && !stale ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : simulation.status === "completed" ? (
            <CheckCircle2 className="h-4 w-4 text-positive" />
          ) : (
            <AlertCircle className="h-4 w-4 text-info" />
          )}
          {stale ? labels.failed : labels[simulation.status]}
        </span>
      </div>
      <div className="space-y-4 p-4">
        <p className="text-xs text-neutral-muted">
          {t(
            "career.simulation.sources",
            "저장된 공고·기업 자료와 프로필을 분석합니다. 이력서는 자동으로 수정하지 않습니다."
          )}
        </p>
        <p className="text-xs text-neutral-muted">
          {simulation.documentName ??
            t(
              "career.simulation.profileOnly",
              "선택된 이력서 없이 프로필을 기준으로 분석합니다."
            )}
        </p>
        {simulation.steps.map((step, index) => (
          <div
            key={step.key}
            className="min-w-0 rounded-lg border border-neutral-1000-a05 p-3"
          >
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                {index + 1}. {titles[step.key]}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-neutral-muted">
                {step.status === "running" && !stale ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
                {stale && step.status === "running"
                  ? labels.failed
                  : labels[step.status]}
              </span>
            </div>
            {step.result ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm">{step.result.summary}</p>
                <details>
                  <summary className="cursor-pointer text-sm text-link">
                    {t("career.simulation.result", "단계 결과")}
                  </summary>
                  <div className="mt-2 overflow-x-auto [&_table]:min-w-[480px]">
                    <RichText variant="career" content={step.result.report} />
                    {step.result.data?.kind === "review" && step.result.data.comparison && (
                      <SimulationStructuredResult data={step.result.data.comparison} />
                    )}
                    {step.result.data && step.result.data.kind !== "review" && (
                      <SimulationStructuredResult data={step.result.data} />
                    )}
                  </div>
                </details>
                {step.status === "completed" &&
                  step.result.data?.kind === "review" && (
                    <SimulationStructuredResult
                      data={step.result.data}
                      hideActions={simulation.version >= 3}
                      onStartAction={onAction ? startAction : undefined}
                      canStartAction={canStartAction}
                      requirements={
                        simulation.steps[0].result?.data?.kind === "role"
                          ? simulation.steps[0].result.data.requirements
                          : []
                      }
                      diagnoses={
                        step.result.data.comparison
                          ? step.result.data.comparison.diagnoses
                          : simulation.steps[1].result?.data?.kind === "comparison"
                          ? simulation.steps[1].result.data.diagnoses
                          : []
                      }
                    />
                  )}
                <details>
                  <summary className="cursor-pointer text-xs text-neutral-muted">
                    {t("career.simulation.json", "원본 JSON 보기")}
                  </summary>
                  <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-bg-weak p-3 text-xs">
                    {JSON.stringify(step.result, null, 2)}
                  </pre>
                </details>
              </div>
            ) : null}
          </div>
        ))}
        {stale ||
        simulation.status === "failed" ||
        simulation.status === "cancelled" ? (
          <p className="text-sm text-neutral-muted">
            {t(
              "career.simulation.incomplete",
              "분석이 끝나지 않았습니다. 완료된 단계의 결과는 위에서 확인할 수 있으며, 채팅에서 다시 분석을 요청할 수 있습니다."
            )}
          </p>
        ) : null}
      </div>
    </section>
  );
}
