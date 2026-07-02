import { AlertCircle, CheckCircle2, Loader2, Square, X } from "lucide-react";
import { memo } from "react";

import type { CareerRecommendationSearchStatus } from "@/components/career/types";
import { IconButton } from "@/components/ui/button";
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
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : isCompleted ? (
      <CheckCircle2 className="h-4 w-4" />
    ) : isStopped ? (
      <X className="h-4 w-4" />
    ) : (
      <AlertCircle className="h-4 w-4" />
    );
    const title = isRunning
      ? t("career.common.career.0y3ajvx", "포지션 검색 중")
      : isCompleted
        ? t("career.common.career.1d6xtz2", "포지션 검색 완료")
        : isStopped
          ? t(
              "career.common.career.recommendation_search_stopped_title",
              "포지션 검색 중지됨"
            )
          : t("career.common.career.030f28a", "포지션 검색 실패");
    const detail = isRunning
      ? t(
          "career.common.career.16yncp4",
          "프로필과 최근 대화를 기준으로 공고를 검토하고 있습니다."
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
          ? t(
              "career.common.career.1clmbsb",
              "요청한 포지션 검색을 중지했습니다."
            )
          : t(
              "career.common.career.0vbpl1c",
              "이번 포지션 검색은 완료하지 못했습니다."
            );
    const showCancel = isRunning && active && onCancel;
    const iconToneClassName = isRunning
      ? "border-primary/15 bg-primary-faded text-primary"
      : isCompleted
        ? "border-positive/20 bg-positive-faded text-positive"
        : isStopped
          ? "border-neutral-1000-a05 bg-bg-weak text-neutral-muted"
          : "border-critical/20 bg-critical-faded text-critical";
    const progressClassName = isRunning
      ? "w-2/5 animate-[career-search-progress_6.4s_ease-in-out_infinite] bg-primary"
      : isCompleted
        ? "w-full bg-positive"
        : isStopped
          ? "w-full bg-neutral-400"
          : "w-full bg-critical";

    return (
      <div
        role="status"
        className="w-full max-w-[760px] rounded-[8px] border border-neutral-1000-a05 bg-bg-floating p-3 text-neutral-primary shadow-sm"
        aria-live={active ? "polite" : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border",
                iconToneClassName
              )}
            >
              {icon}
            </div>
            <div className="min-w-0 pt-0.5">
              <div className="text-[14px] font-semibold leading-5 text-neutral-primary">
                {title}
              </div>
              <div className="mt-0.5 break-words text-[12px] leading-5 text-neutral-muted">
                {detail}
              </div>
            </div>
          </div>
          {showCancel ? (
            <IconButton
              type="button"
              onClick={onCancel}
              variant="secondary"
              size="sm"
              className="h-8 w-8 rounded-[8px] border-neutral-1000-a05 p-0 text-neutral-muted hover:text-neutral-primary"
              aria-label={t("career.common.career.1nwpekv", "검색 중지")}
              title={t("career.common.career.1nwpekv", "검색 중지")}
              icon={<Square className="h-3.5 w-3.5" fill="currentColor" />}
            />
          ) : null}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-weak">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              progressClassName
            )}
          />
        </div>
      </div>
    );
  }
);
