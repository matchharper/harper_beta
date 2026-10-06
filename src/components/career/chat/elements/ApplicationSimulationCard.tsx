import { SimulationStructuredResult } from "./SimulationStructuredResult";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import RichText from "@/components/ui/rich-text";
import { useCareerT } from "@/i18n/useCareerT";
import { useEffect, useState } from "react";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import {
  parseApplicationSimulation,
  type ApplicationSimulation,
} from "@/lib/career/simulation/types";

export function ApplicationSimulationCard({
  simulation: supplied,
  messageId,
}: {
  simulation: ApplicationSimulation;
  messageId: string | number;
}) {
  const { fetchWithAuth } = useCareerApi();
  const [restored, setRestored] = useState<ApplicationSimulation | null>(null);
  const [now, setNow] = useState(Date.now);
  const simulation =
    restored && restored.updatedAt > supplied.updatedAt ? restored : supplied;
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
    review: t("career.simulation.review", "검증·액션 제안"),
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
      aria-label="Simulate"
    >
      <div className="flex items-center justify-between gap-3 border-b border-neutral-1000-a05 p-4">
        <div>
          <div className="font-medium">Simulate</div>
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
                <details open>
                  <summary className="cursor-pointer text-sm text-link">
                    {t("career.simulation.result", "단계 결과")}
                  </summary>
                  <div className="mt-2 overflow-x-auto [&_table]:min-w-[480px]">
                    <RichText variant="career" content={step.result.report} />
                    {step.result.data && step.result.data.kind !== "review" && (
                      <SimulationStructuredResult data={step.result.data} />
                    )}
                  </div>
                </details>
                {step.status === "completed" &&
                  step.result.data?.kind === "review" && (
                    <SimulationStructuredResult data={step.result.data} />
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
