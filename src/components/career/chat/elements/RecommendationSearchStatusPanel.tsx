import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  Square,
  X,
} from "lucide-react";
import { memo } from "react";

import type {
  CareerOpportunityRun,
  CareerRecommendationSearchStatus,
} from "@/components/career/types";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";
import type { OpportunityRunMarkerRelation } from "@/lib/opportunityDiscovery/messageMarker";

type RecommendationSearchStatusPanelProps = {
  active?: boolean;
  onCancel?: () => void;
  relation?: OpportunityRunMarkerRelation | null;
  run?: CareerOpportunityRun | null;
  status?: CareerRecommendationSearchStatus | null;
};

export const RecommendationSearchStatusPanel = memo(
  function RecommendationSearchStatusPanel({
    active = false,
    onCancel,
    relation = null,
    run = null,
    status,
  }: RecommendationSearchStatusPanelProps) {
    const t = useCareerT();
    if (!run && !status) return null;

    const isQueued = run?.status === "queued";
    const isRunning = run
      ? run.status === "running"
      : status?.state === "running";
    const isCompleted = run
      ? run.status === "completed"
      : status?.state === "completed";
    const isPartial = run?.status === "partial";
    const isStopped = !run && status?.state === "stopped";
    const isFailed = run ? run.status === "failed" : status?.state === "error";
    const isActive = isQueued || isRunning;
    const isBlockingRequest = relation === "blocking_other_request";
    const isSameRequest = relation === "same_request";
    const isCancelledBySetting = run?.completionKind === "cancelled_by_setting";
    const isCancelledByFilterChange =
      run?.completionKind === "cancelled_by_filter_change";
    const isCancelled = isCancelledBySetting || isCancelledByFilterChange;
    const isStaleFailure = run?.failureKind === "stale_timeout";
    const candidateCount = run?.candidateCount ?? status?.candidateCount;
    const recommendationCount =
      run?.recommendationCount ?? status?.recommendationCount;

    const icon = isRunning ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : isQueued ? (
      <Clock3 className="h-4 w-4" />
    ) : isCancelled ? (
      <X className="h-4 w-4" />
    ) : isCompleted ? (
      <CheckCircle2 className="h-4 w-4" />
    ) : isStopped ? (
      <X className="h-4 w-4" />
    ) : (
      <AlertCircle className="h-4 w-4" />
    );
    const title = isQueued
      ? isBlockingRequest
        ? t(
            "career.common.recommendation_search.blocking_queued_title",
            "먼저 진행 중인 검색 대기 중"
          )
        : isSameRequest
          ? t(
              "career.common.recommendation_search.same_queued_title",
              "같은 조건의 검색 대기 중"
            )
          : t(
              "career.common.recommendation_search.queued_title",
              "검색 대기 중"
            )
      : isRunning
        ? isBlockingRequest
          ? t(
              "career.common.recommendation_search.blocking_running_title",
              "먼저 진행 중인 포지션 검색"
            )
          : isSameRequest
            ? t(
                "career.common.recommendation_search.same_running_title",
                "같은 조건의 포지션 검색 중"
              )
            : t(
                "career.common.recommendation_search.running_title",
                "포지션 검색 중"
              )
        : isCompleted
          ? isCancelled
            ? isCancelledByFilterChange
              ? t(
                  "career.common.recommendation_search.filter_changed_title",
                  "검색 결과를 전달하지 않았어요"
                )
              : t(
                  "career.common.recommendation_search.setting_changed_title",
                  "검색 종료됨"
                )
            : isBlockingRequest
              ? t(
                  "career.common.recommendation_search.blocking_completed_title",
                  "먼저 진행 중이던 검색 완료"
                )
              : isSameRequest
                ? t(
                    "career.common.recommendation_search.same_completed_title",
                    "같은 조건의 검색 완료"
                  )
                : t(
                    "career.common.recommendation_search.completed_title",
                    "요청하신 검색 완료"
                  )
          : isPartial
            ? isBlockingRequest
              ? t(
                  "career.common.recommendation_search.blocking_partial_title",
                  "먼저 진행 중이던 검색 완료 · 일부 전달 문제"
                )
              : isSameRequest
                ? t(
                    "career.common.recommendation_search.same_partial_title",
                    "같은 조건의 검색 완료 · 일부 전달 문제"
                  )
                : t(
                    "career.common.recommendation_search.partial_title",
                    "검색 완료 · 일부 전달 문제"
                  )
            : isStopped
              ? t(
                  "career.common.career.recommendation_search_stopped_title",
                  "포지션 검색 중지됨"
                )
              : isFailed
                ? isBlockingRequest
                  ? t(
                      "career.common.recommendation_search.blocking_failed_title",
                      "먼저 진행 중이던 검색을 완료하지 못함"
                    )
                  : t(
                      "career.common.recommendation_search.failed_title",
                      "검색을 완료하지 못함"
                    )
                : t("career.common.career.030f28a", "검색 실패");
    const purposePrefix = run?.purposeText ? `${run.purposeText} · ` : "";
    const detail = isQueued
      ? `${purposePrefix}`
      : isRunning
        ? `${purposePrefix}${t(
            "career.common.recommendation_search.running_detail",
            "프로필과 이번 요청을 기준으로 공개 포지션을 선별하고 있어요. 검색 중에도 대화를 계속할 수 있습니다."
          )}`
        : isCompleted
          ? isCancelled
            ? isCancelledByFilterChange
              ? t(
                  "career.common.recommendation_search.filter_changed_detail",
                  "결과를 전달하기 전에 차단 회사 설정이 변경되어, 이번 검색 결과는 보내지 않았어요. 최신 설정으로 다시 요청해 주세요."
                )
              : t(
                  "career.common.recommendation_search.setting_changed_detail",
                  "외부 추천 설정이 변경되어 결과를 전달하지 않고 검색을 종료했어요."
                )
            : [
                typeof candidateCount === "number"
                  ? t("career.common.career.0dtwsdj", "{count}개 공고 검토", {
                      values: {
                        count: candidateCount,
                      },
                    })
                  : t("career.common.career.152e0fk", "공고 검토 완료"),
                typeof recommendationCount === "number"
                  ? t("career.common.career.0beg208", "{count}개 추천", {
                      values: {
                        count: recommendationCount,
                      },
                    })
                  : "",
              ]
                .filter(Boolean)
                .join(" / ")
          : isPartial
            ? run?.deliveryRetryPending
              ? `${purposePrefix}${t(
                  "career.common.recommendation_search.partial_retry_detail",
                  "추천 결과는 준비됐고, 전달하지 못한 채널을 다시 시도하고 있어요. 채팅 결과는 지금 확인할 수 있습니다."
                )}`
              : `${purposePrefix}${t(
                  "career.common.recommendation_search.partial_detail",
                  "추천 결과는 준비됐지만 이메일 등 일부 채널로 전달하지 못했어요. 채팅 결과를 확인해 주세요."
                )}`
            : isStopped
              ? t("career.common.career.1clmbsb", "요청한 검색을 중지했습니다.")
              : isStaleFailure
                ? t(
                    "career.common.recommendation_search.stale_failed_detail",
                    "오랫동안 진행 신호가 없어 검색을 종료했어요. 원하시면 같은 조건으로 다시 요청해 주세요."
                  )
                : t(
                    "career.common.recommendation_search.failed_detail",
                    "이번 검색을 완료하지 못했어요. 잠시 뒤 다시 요청해 주세요."
                  );
    const showCancel = !run && isRunning && active && onCancel;
    const iconToneClassName = isActive
      ? "border-primary/15 bg-primary-faded text-primary"
      : isCancelled
        ? "border-neutral-1000-a05 bg-bg-weak text-neutral-muted"
        : isCompleted
          ? "border-positive/20 bg-positive-faded text-positive"
          : isStopped || isPartial
            ? "border-neutral-1000-a05 bg-bg-weak text-neutral-muted"
            : "border-critical/20 bg-critical-faded text-critical";
    const progressClassName = isActive
      ? "w-2/5 animate-[career-search-progress_6.4s_ease-in-out_infinite] bg-primary"
      : isCancelled
        ? "w-full bg-neutral-400"
        : isCompleted
          ? "w-full bg-positive"
          : isStopped || isPartial
            ? "w-full bg-neutral-400"
            : "w-full bg-critical";

    return (
      <div
        role="status"
        className="w-full max-w-[760px] rounded-[8px] border border-neutral-1000-a05 bg-bg-floating p-3 text-neutral-primary shadow-sm"
        aria-live="polite"
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
            <MuteButton
              type="button"
              onClick={onCancel}
              variant="neutral"
              size="sm"
              aria-label={"검색 중지"}
              title={t("career.common.career.1nwpekv", "검색 중지")}
            >
              <Square className="h-3.5 w-3.5" fill="currentColor" />
            </MuteButton>
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
