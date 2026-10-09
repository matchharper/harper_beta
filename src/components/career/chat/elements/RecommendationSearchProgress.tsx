import { Check } from "lucide-react";
import { memo, useEffect, useRef, type CSSProperties } from "react";
import type {
  CareerOpportunityRun,
  CareerRecommendationSearchStatus,
} from "@/components/career/types";
import { useCareerT } from "@/i18n/useCareerT";
import { isRecommendJobPostingPhase } from "@/lib/talentOnboarding/recommendJobPostingStatus";
import { cn } from "@/lib/utils";

const PHASES = ["query", "scoring", "reranking", "delivery"] as const;
const count = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;

// Read only explicit progress. Old runs without a phase remain at the first step.
export function getRecommendationSearchProgress(
  run?: CareerOpportunityRun | null,
  status?: CareerRecommendationSearchStatus | null
) {
  const coverage = run?.coverage ?? {};
  const rawPhase = run ? coverage.phase : status?.phase;
  const phase = isRecommendJobPostingPhase(rawPhase) ? rawPhase : "query";
  const cancelled =
    run?.completionKind === "cancelled_by_setting" ||
    run?.completionKind === "cancelled_by_filter_change";
  const completed =
    !cancelled &&
    (run ? run.status === "completed" : status?.state === "completed");
  const running = run ? run.status === "running" : status?.state === "running";
  const activeStep =
    run?.status === "queued"
      ? -1
      : run?.status === "partial"
        ? 3
        : PHASES.indexOf(phase);
  const recommendations = count(
    run?.recommendationCount ?? status?.recommendationCount
  );
  return {
    activeStep,
    completed,
    running: running && !cancelled,
    counts: [
      count(run?.candidateCount ?? status?.candidateCount),
      count(run ? coverage.scoredCandidateCount : status?.scoredCount),
      recommendations,
      completed ? recommendations : null,
    ],
  };
}

// Motion reference: https://tympanus.net/Development/RotatingShapes/torus.html
// A CSS wire sculpture: no WebGL, assets, or per-frame React updates.
const RINGS = Array.from(
  { length: 28 },
  (_, index) =>
    ({
      "--ring-angle": `${(index / 28) * 360}deg`,
      "--ring-delay": `${-index * 0.085}s`,
    }) as CSSProperties
);

const SearchAnimation = memo(function SearchAnimation() {
  return (
    <div className="career-search-visual" aria-hidden="true">
      <div className="career-search-sculpture">
        {RINGS.map((style, index) => (
          <span className="career-search-ring" style={style} key={index} />
        ))}
      </div>
    </div>
  );
});

function AnimatedCount({ value }: { value: number | null }) {
  const element = useRef<HTMLSpanElement>(null);
  const displayed = useRef<number | null>(null);
  const formatted = value === null ? "—" : value.toLocaleString("en-US");

  useEffect(() => {
    const node = element.current;
    if (!node) return;
    if (
      value === null ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      node.textContent = formatted;
      displayed.current = value;
      return;
    }
    const from = displayed.current ?? 0;
    if (from === value) return;
    const started = performance.now();
    let frame = 0;
    const update = (now: number) => {
      const progress = Math.min(1, (now - started) / 650);
      const next = Math.round(
        from + (value - from) * (1 - (1 - progress) ** 3)
      );
      if (next !== displayed.current)
        node.textContent = next.toLocaleString("en-US");
      displayed.current = next;
      if (progress < 1) frame = requestAnimationFrame(update);
    };
    node.textContent = from.toLocaleString("en-US");
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [value, formatted]);

  return (
    <span className="min-w-10 text-right tabular-nums">
      <span className="sr-only">{formatted}</span>
      <span aria-hidden="true" ref={element}>
        {formatted}
      </span>
    </span>
  );
}

export function RecommendationSearchProgress({
  run,
  status,
  showAnimation = false,
}: {
  run?: CareerOpportunityRun | null;
  status?: CareerRecommendationSearchStatus | null;
  showAnimation?: boolean;
}) {
  const t = useCareerT();
  const progress = getRecommendationSearchProgress(run, status);
  const labels = [
    t("career.common.recommendation_search.step_query", "포지션 찾기"),
    t("career.common.recommendation_search.step_scoring", "적합도 확인"),
    t("career.common.recommendation_search.step_reranking", "추천 포지션 선정"),
    t("career.common.recommendation_search.step_delivery", "결과 전달"),
  ];
  return (
    <>
      {showAnimation ? <SearchAnimation /> : null}
      <div className="career-search-steps">
        <div
          aria-hidden="true"
          className="career-search-step-highlight"
          style={{
            transform: `translateY(${Math.max(0, progress.activeStep) * 100}%)`,
            opacity: progress.running && progress.activeStep >= 0 ? 1 : 0,
          }}
        />
        <ol className="relative">
          {PHASES.map((phase, index) => {
            const done = progress.completed || index < progress.activeStep;
            const current =
              !done && progress.running && index === progress.activeStep;
            const value = progress.counts[index];
            return (
              <li
                key={phase}
                data-search-step={phase}
                data-state={done ? "complete" : current ? "active" : "pending"}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "career-search-step flex items-center gap-2.5 px-2 text-[12px]",
                  done || current ? "text-neutral-primary" : "text-neutral-soft"
                )}
              >
                <span className="flex w-4 shrink-0 items-center justify-center text-[11px] tabular-nums">
                  {done ? (
                    <>
                      <Check className="size-3.5" aria-hidden="true" />
                      <span className="sr-only">
                        {t(
                          "career.common.recommendation_search.step_complete",
                          "완료"
                        )}
                      </span>
                    </>
                  ) : (
                    index + 1
                  )}
                </span>
                <span className={cn("flex-1", current && "font-medium")}>
                  {labels[index]}
                </span>
                <AnimatedCount value={value} />
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}
