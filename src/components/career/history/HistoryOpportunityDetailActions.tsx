import {
  Archive,
  ArrowRight,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { AnimatedHandshake } from "@/components/ui/animated-handshake";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";
import {
  getInternalOpportunityDecisionAvailability,
  isInternalRoleCandidateDecisionAvailable,
  type CareerInternalOpportunityDecisionAction,
} from "@/lib/career/internalOpportunityDecision";
import {
  getCareerPositiveActionIcon,
  getCareerPositiveActionLabel,
} from "../opportunityTypeMeta";
import type { CareerHistoryOpportunity } from "../types";
import { isCareerHistoryOpportunityExpired } from "./opportunityPostingStatus";
import { getExternalOpportunityApplyLabel } from "./hiringPost";
import {
  getCareerOpportunityManagementStatus,
  type CareerOpportunityManagementStatus,
} from "./savedOpportunityStatus";

/** Button class shared by every opportunity decision row. */
export const opportunityActionClass =
  "py-2.5 rounded-sm font-normal text-sm truncate";

/**
 * Two-column row for an opportunity's decision buttons. On mobile a lone last
 * button moves to the right column, so the main action sits under the thumb.
 */
export function OpportunityActionGrid({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 items-center gap-2 max-md:[&>button:last-child:nth-child(odd)]:col-start-2",
        className
      )}
    >
      {children}
    </div>
  );
}

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

  if (isInternal) {
    if (item.feedback === "keep" && onKeepDecision) {
      return (
        <div className="space-y-2">
          <OpportunityActionGrid>
            <MuteButton
              disabled={pending}
              className={opportunityActionClass}
              onClick={() => onKeepDecision("decline")}
            >
              <ThumbsDown aria-hidden className="size-3.5" />
              {t("career.history.keep.decline", "거절")}
            </MuteButton>
            {!expired &&
            isInternalRoleCandidateDecisionAvailable(item.status) ? (
              <MuteButton
                disabled={pending}
                className={opportunityActionClass}
                variant="primary"
                onClick={() => onKeepDecision("accept")}
              >
                {getCareerPositiveActionIcon(item.opportunityType) ? (
                  <AnimatedHandshake className="size-3.5" />
                ) : null}
                {getCareerPositiveActionLabel(item.opportunityType, t)}
              </MuteButton>
            ) : null}
          </OpportunityActionGrid>
        </div>
      );
    }
    if (!onInternalDecisionAction || (!canRevert && !canStopProcess))
      return null;
    return (
      <OpportunityActionGrid>
        {canRevert ? (
          <MuteButton
            disabled={pending}
            className={opportunityActionClass}
            onClick={() => onInternalDecisionAction("revert")}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            {t(
              "career.history.internal_decision_actions.revert",
              "새 기회로 되돌리기"
            )}
          </MuteButton>
        ) : null}
        {canStopProcess ? (
          <MuteButton
            disabled={pending}
            className={opportunityActionClass}
            onClick={() => onInternalDecisionAction("stop_process")}
          >
            {t(
              "career.history.internal_decision_actions.stop",
              "진행 중단하기"
            )}
          </MuteButton>
        ) : null}
      </OpportunityActionGrid>
    );
  }

  const canApply =
    !expired &&
    (status === "saved" || status === "hidden" || status === "archived");
  if (!onSavedStatusChange && !canApply) return null;

  return (
    <OpportunityActionGrid>
      {onSavedStatusChange ? (
        status === "hidden" || status === "archived" ? (
          <MuteButton
            disabled={pending}
            className={opportunityActionClass}
            variant="neutral"
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
            className={opportunityActionClass}
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
          className={opportunityActionClass}
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
          className={opportunityActionClass}
          variant="primary"
          onClick={onApply}
        >
          {getExternalOpportunityApplyLabel(item, t)}
        </MuteButton>
      ) : null}
    </OpportunityActionGrid>
  );
}
