import { AlertCircle, CheckCircle2, Loader2, Square, X } from "lucide-react";
import { memo } from "react";

import type { CareerRecommendationSearchStatus } from "@/components/career/types";
import { BareButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";

type RecommendationSearchStatusPanelProps = {
  active?: boolean;
  onCancel?: () => void;
  status: CareerRecommendationSearchStatus;
};

export const RecommendationSearchStatusPanel = memo(
  function RecommendationSearchStatusPanel({
    active = false,
    onCancel,
    status,
  }: RecommendationSearchStatusPanelProps) {
    const t = useCareerT();
    const isRunning = status.state === "running";
    const isCompleted = status.state === "completed";
    const isStopped = status.state === "stopped";
    const icon = isRunning ? (
      <Loader2 className="h-4 w-4 animate-spin text-neutral-muted" />
    ) : isCompleted ? (
      <CheckCircle2 className="h-4 w-4 text-neutral-muted" />
    ) : isStopped ? (
      <X className="h-4 w-4 text-neutral-muted" />
    ) : (
      <AlertCircle className="h-4 w-4 text-neutral-muted" />
    );
    const title = isRunning
      ? t("career.common.career.0y3ajvx", "검색중...")
      : isCompleted
        ? t("career.common.career.1d6xtz2", "검색 완료")
        : isStopped
          ? t("career.common.career.1nwpekv", "검색 중지")
          : t("career.common.career.030f28a", "검색 실패");
    const detail = isRunning
      ? t(
          "career.common.career.16yncp4",
          "프로필과 최근 대화를 반영해 최적의 기회를 찾고 있습니다."
        )
      : isCompleted
        ? [
            typeof status.candidateCount === "number"
              ? t("career.common.career.0dtwsdj", "{count}개 공고 검토", {
                  values: {
                    count: status.candidateCount,
                  },
                })
              : t("career.common.career.152e0fk", "공고 검토 완료"),
            typeof status.recommendationCount === "number"
              ? t("career.common.career.0beg208", "{count}개 추천", {
                  values: {
                    count: status.recommendationCount,
                  },
                })
              : "",
          ]
            .filter(Boolean)
            .join(" / ")
        : isStopped
          ? t("career.common.career.1clmbsb", "요청한 검색을 중지했습니다.")
          : t(
              "career.common.career.0vbpl1c",
              "이번 검색은 완료하지 못했습니다."
            );
    const showCancel = isRunning && active && onCancel;

    return (
      <div
        className="w-full max-w-[760px] rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-4 py-3 shadow-[0_10px_28px_color-mix(in_srgb,var(--color-neutral-1000)_7%,transparent)]"
        aria-live={active ? "polite" : undefined}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-accent-200/60">
              {icon}
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold leading-5 text-neutral-primary">
                {title}
              </div>
              <div className="truncate text-[12px] leading-5 text-neutral-muted">
                {detail}
              </div>
            </div>
          </div>
          {showCancel ? (
            <BareButton
              type="button"
              onClick={onCancel}
              className="inline-flex min-w-8 h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-neutral-1000-a05 bg-bg-floating text-[12px] font-medium text-neutral-primary transition-colors hover:bg-bg-weak"
              aria-label={t("career.common.career.1nwpekv", "검색 중지")}
              title={t("career.common.career.1nwpekv", "검색 중지")}
            >
              <Square className="h-3.5 w-3.5" fill="currentColor" />
            </BareButton>
          ) : null}
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-bg-weak">
          <div
            className={cn(
              "h-full rounded-full bg-black transition-all duration-500",
              isRunning
                ? "w-1/2 animate-[career-search-progress_6.4s_ease-in-out_infinite]"
                : isCompleted
                  ? "w-full"
                  : "w-full bg-black/35"
            )}
          />
        </div>
      </div>
    );
  }
);
