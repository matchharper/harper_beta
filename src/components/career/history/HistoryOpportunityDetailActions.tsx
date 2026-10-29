import {
  Archive,
  ArrowRight,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { AnimatedHandshake } from "@/components/ui/animated-handshake";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import {
  getInternalOpportunityDecisionAvailability,
  isInternalRoleCandidateDecisionAvailable,
  type CareerInternalOpportunityDecisionAction,
} from "@/lib/career/internalOpportunityDecision";
import { getCareerPositiveActionLabel } from "../opportunityTypeMeta";
import type { CareerHistoryOpportunity } from "../types";
import { isCareerHistoryOpportunityExpired } from "./opportunityPostingStatus";
import {
  getCareerOpportunityManagementStatus,
  type CareerOpportunityManagementStatus,
} from "./savedOpportunityStatus";

export default function HistoryOpportunityDetailActions({
  item,
  pending,
  onApply,
  onSavedStatusChange,
  onKeepDecision,
  onInternalDecisionAction,
}: {
  item: CareerHistoryOpportunity;
  pending: boolean;
  onApply: () => void;
  onSavedStatusChange?: (status: CareerOpportunityManagementStatus) => void;
  onKeepDecision?: (action: "accept" | "decline") => void;
  onInternalDecisionAction?: (
    action: CareerInternalOpportunityDecisionAction
  ) => void;
}) {
  const t = useCareerT();
  const isInternal = item.isInternal || item.sourceType === "internal";
  const status = getCareerOpportunityManagementStatus(item);
  const expired =
    isCareerHistoryOpportunityExpired(item) || item.status === "deleted";
  const { canRevert, canStopProcess } =
    getInternalOpportunityDecisionAvailability(item);
  const actionClass = "py-2.5 rounded-sm font-normal md:font-light text-sm";
  const rowClass =
    "grid grid-flow-col auto-cols-fr gap-2 pt-4 [&>button]:h-full [&>button]:min-w-0 [&>button]:whitespace-normal";

  if (isInternal) {
    if (item.feedback === "keep" && onKeepDecision) {
      return (
        <div>
          <p className="text-sm text-neutral-muted">
            {t(
              "career.history.keep.notice",
              "저장됨 · 아직 수락하거나 거절하지 않았어요. 회사에는 전달되지 않습니다."
            )}
          </p>
          <div className={rowClass}>
            <MuteButton
              disabled={pending}
              className={actionClass}
              onClick={() => onKeepDecision("decline")}
            >
              <ThumbsDown aria-hidden className="size-3.5" />
              {t("career.history.keep.decline", "거절")}
            </MuteButton>
            {!expired &&
            isInternalRoleCandidateDecisionAvailable(item.status) ? (
              <MuteButton
                disabled={pending}
                className={actionClass}
                variant="primary"
                onClick={() => onKeepDecision("accept")}
              >
                <AnimatedHandshake className="size-3.5" />
                {getCareerPositiveActionLabel(item.opportunityType, t)}
              </MuteButton>
            ) : null}
          </div>
        </div>
      );
    }
    if (!onInternalDecisionAction || (!canRevert && !canStopProcess))
      return null;
    return (
      <div className={rowClass}>
        {canRevert ? (
          <MuteButton
            disabled={pending}
            className={actionClass}
            onClick={() => onInternalDecisionAction("revert")}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            {t(
              "career.history.internal_decision_actions.revert",
              "새 포지션으로 되돌리기"
            )}
          </MuteButton>
        ) : null}
        {canStopProcess ? (
          <MuteButton
            disabled={pending}
            className={actionClass}
            onClick={() => onInternalDecisionAction("stop_process")}
          >
            {t(
              "career.history.internal_decision_actions.stop",
              "진행 중단하기"
            )}
          </MuteButton>
        ) : null}
      </div>
    );
  }

  const canApply =
    !expired &&
    (status === "saved" || status === "hidden" || status === "archived");
  return (
    <div className={rowClass}>
      {onSavedStatusChange ? (
        status === "hidden" || status === "archived" ? (
          <MuteButton
            disabled={pending}
            className={actionClass}
            onClick={() => onSavedStatusChange("saved")}
          >
            <ThumbsUp aria-hidden className="size-3.5" />
            {t(
              "career.common.opportunity_type_meta.external_positive_action",
              "관심 있어요"
            )}
          </MuteButton>
        ) : (
          <MuteButton
            disabled={pending}
            className={actionClass}
            onClick={() => onSavedStatusChange("hidden")}
          >
            <Archive aria-hidden className="size-3.5" />
            {t(
              "career.history.saved_opportunity_status.hide_action",
              "보관하기"
            )}
          </MuteButton>
        )
      ) : null}
      {onSavedStatusChange &&
      (status === "saved" || status === "hidden" || status === "archived") ? (
        <MuteButton
          disabled={pending}
          className={actionClass}
          variant="dark"
          onClick={() => onSavedStatusChange("applied")}
        >
          <ArrowRight aria-hidden className="size-3.5" />
          {t(
            "career.history.detail_actions.move_to_applied",
            "지원함으로 이동"
          )}
        </MuteButton>
      ) : null}
      {canApply ? (
        <MuteButton
          disabled={pending}
          className={actionClass}
          variant="primary"
          onClick={onApply}
        >
          {t("career.history.external_application.apply", "지원하기")}
        </MuteButton>
      ) : null}
    </div>
  );
}
