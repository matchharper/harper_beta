import {
  type SimulationCardRequest,
  type SimulationSession,
} from "@/lib/career/simulation/session";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
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
    review: simulation.version >= 4
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
  const review = simulation.steps.findLast(step => step.status === "completed" && step.result?.data?.kind === "review")?.result?.data;
  const verdict = review?.kind === "review" ? review.fitVerdict : undefined;
  const verdictLabels = {
    strong: t("career.simulation.fitStrong", "강한 핏"),
    moderate: t("career.simulation.fitModerate", "중간"),
    weak: t("career.simulation.fitWeak", "약한 핏"),
    stretch: t("career.simulation.fitStretch", "Stretch · 현실적으로 어려움"),
  };
  const verdictColors = {strong: "text-positive", moderate: "text-info", weak: "text-critical", stretch: "text-critical"};
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
              </div>
            ) : null}
          </div>
        ))}
        {verdict && (
          <div className="min-w-0 space-y-2 rounded-lg border border-neutral-1000-a05 p-3" data-fit-verdict={verdict.level}>
            <p className="text-sm font-medium">{t("career.simulation.fitVerdict", "종합 적합도")}</p>
            <p className={`text-sm font-medium ${verdictColors[verdict.level]}`}>{verdictLabels[verdict.level]}</p>
            <p className="text-sm">{verdict.reason}</p>
          </div>
        )}
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
