import {
  CheckCircle2,
  Circle,
  CircleDashed,
  SkipForward,
  ListChecks,
} from "lucide-react";
import { ResponsiveLightTooltip } from "@/components/ui/tooltip";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useEffect, useState, useRef } from "react";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import {
  parseSimulationSession,
  type SimulationSession,
  type SimulationCardRef,
  type SimulationCardRequest,
} from "@/lib/career/simulation/session";

export function SimulationNextActionCard({
  card,
  session,
  disabled,
  onAction,
}: {
  card: SimulationCardRef;
  session?: SimulationSession;
  disabled: boolean;
  onAction?: (
    action: SimulationCardRequest,
    text: string
  ) => void | Promise<void>;
}) {
  const t = useCareerT();
  const { fetchWithAuth } = useCareerApi();
  const actionLock = useRef(false);
  const [loaded, setLoaded] = useState<SimulationSession>();
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    fetchWithAuth(
      `/api/talent/simulation?sessionMessageId=${card.sessionMessageId}`,
      {
        signal: abort.signal,
      }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setLoaded(parseSimulationSession(data.session));
      })
      .catch(() => {});
    return () => abort.abort();
  }, [card.sessionMessageId, session?.revision, fetchWithAuth]);
  const current =
    session && (!loaded || session.revision >= loaded.revision)
      ? session
      : loaded;
  const item = current?.actions.find((a) => a.id === card.actionId);
  const proposal =
    current?.proposal?.actionId === card.actionId ? current.proposal : null;
  const actionable =
    !!current &&
    current.status === "active" &&
    current.revision === card.revision &&
    !!proposal &&
    !!item &&
    !["completed", "skipped"].includes(item.status);
  const suggestions = item ? [item] : [];
  const act = async (
    action: SimulationCardRequest["action"],
    text: string,
    actionId = card.actionId
  ) => {
    if (!onAction || !actionable || disabled || pending || actionLock.current)
      return;
    actionLock.current = true;
    setPending(true);
    try {
      await onAction(
        {
          sessionMessageId: card.sessionMessageId,
          expectedRevision: card.revision,
          actionId,
          action,
          ...(action === "select_analysis"
            ? { analysisMessageId: current?.analysisMessageId ?? undefined }
            : {}),
        },
        text
      );
    } finally {
      actionLock.current = false;
      setPending(false);
    }
  };
  return (
    <section className="max-w-[740px] rounded-xl border border-neutral-1000-a10 bg-bg-floating p-4 text-neutral-primary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{t("career.apply.title", "Harper와 준비하기")}</strong>
        <ResponsiveLightTooltip
          className="w-auto"
          mobileAriaLabel={t(
            "career.sim_session.checklist",
            "전체 액션 체크리스트"
          )}
          contentClassName="w-80 max-h-[min(360px,60vh)] overflow-y-auto"
          trigger={
            <span className="flex items-center gap-1.5 text-xs text-neutral-muted">
              <ListChecks className="h-4 w-4" aria-hidden />
              {current
                ? t(
                    "career.sim_session.progress",
                    "완료 {done} · 건너뜀 {skipped} · 전체 {total}",
                    {
                      values: {
                        done: current.actions.filter(
                          (a) => a.status === "completed"
                        ).length,
                        skipped: current.actions.filter(
                          (a) => a.status === "skipped"
                        ).length,
                        total: current.actions.length,
                      },
                    }
                  )
                : t(
                    "career.sim_session.loading",
                    "진행 상태를 확인하고 있어요"
                  )}
            </span>
          }
        >
          <p className="mb-3 font-medium">
            {t("career.sim_session.checklist", "전체 액션 체크리스트")}
          </p>
          <ol className="space-y-3">
            {current?.actions.map((a) => {
              const Icon =
                a.status === "completed"
                  ? CheckCircle2
                  : a.status === "skipped"
                    ? SkipForward
                    : a.status === "in_progress"
                      ? CircleDashed
                      : Circle;
              const label =
                a.status === "completed"
                  ? t("career.simulation.completed", "완료")
                  : a.status === "skipped"
                    ? t("career.sim_session.skipped", "건너뜀")
                    : a.status === "in_progress"
                      ? t("career.sim_session.inProgress", "진행 중")
                      : a.status === "needs_confirmation"
                        ? t("career.sim_session.needsConfirmation", "확인 필요")
                        : t("career.simulation.pending", "대기 중");
              return (
                <li key={a.id} className="flex items-start gap-2">
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${a.status === "completed" ? "text-positive" : "text-neutral-muted"}`}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="break-words">{a.title}</p>
                    <p className="text-xs text-neutral-muted">{label}</p>
                    {a.resolution && (
                      <p className="mt-1 break-words text-xs text-neutral-muted">
                        {a.resolution}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </ResponsiveLightTooltip>
      </div>
      <ol className="mt-3 divide-y divide-neutral-1000-a05">
        {suggestions.map((suggestion, index) => (
          <li key={suggestion.id} className="py-3">
            <p className="break-words font-medium">
              {index + 1}. {proposal?.title ?? suggestion.title}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-muted">
              {proposal?.reason ?? suggestion.proposal}
            </p>
            {actionable && (
              <div className="mt-3 flex flex-wrap gap-2">
                <MuteButton
                  disabled={disabled || pending}
                  onClick={() =>
                    void act("select", proposal!.request, suggestion.id)
                  }
                >
                  {t("career.sim_session.start", "이 액션 진행하기")}
                </MuteButton>
                <MuteButton
                  variant="transparent"
                  disabled={disabled || pending}
                  onClick={() =>
                    void act(
                      "skip",
                      t(
                        "career.sim_session.skip_message",
                        "이 액션은 건너뛸게요."
                      ),
                      suggestion.id
                    )
                  }
                >
                  {t("career.sim_session.skip", "건너뛰기")}
                </MuteButton>
              </div>
            )}
          </li>
        ))}
      </ol>
      {current && !actionable && (
        <p className="mt-3 text-xs text-neutral-muted">
          {t(
            "career.sim_session.past",
            "이 제안은 종료되었거나 진행 상태가 변경됐어요. 최신 대화에서 이어가 주세요."
          )}
        </p>
      )}
      {actionable && (
        <div className="mt-2 border-t border-neutral-1000-a05 pt-2">
          <MuteButton
            variant="transparent"
            disabled={disabled || pending}
            onClick={() =>
              void act(
                "end",
                t(
                  "career.sim_session.end_message",
                  "지원 준비는 여기서 마칠게요."
                )
              )
            }
          >
            {t("career.sim_session.end", "지원 준비 종료")}
          </MuteButton>
        </div>
      )}
    </section>
  );
}
