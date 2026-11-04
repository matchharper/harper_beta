import {
  Archive,
  Bookmark,
  Handshake,
  Loader2,
  ThumbsDown,
  type LucideIcon,
} from "lucide-react";
import { memo, type ReactNode } from "react";
import { AnimatedHandshake } from "@/components/ui/animated-handshake";
import { MuteButton } from "@/components/ui/button";
import { Tooltips } from "@/components/ui/tooltip";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";
import {
  getCareerNegativeActionLabel,
  getCareerPositiveActionIcon,
  getCareerPositiveActionLabel,
} from "../opportunityTypeMeta";
import type { CareerHistoryOpportunity } from "../types";
import {
  HISTORY_FEEDBACK_CLICK_EVENT,
  HISTORY_FEEDBACK_EXPERIMENT,
  type HistoryFeedbackVariant,
} from "@/lib/career/historyFeedbackExperiment";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import OpportunityCard from "./OpportunityCard";
import { OpportunitySwipeRow } from "./OpportunitySwipeRow";

type OpportunityAction = (
  item: CareerHistoryOpportunity
) => void | Promise<unknown>;
export type NewOpportunityCardActions = {
  onApply: OpportunityAction;
  onNegative: OpportunityAction;
  onKeep: OpportunityAction;
  onPositive: OpportunityAction;
  onToggleOpportunity: OpportunityAction;
  onOpenCompanyInfo?: OpportunityAction;
  onOpenLink?: (item: CareerHistoryOpportunity, url: string) => void;
};

function PositiveActionIconView({
  icon: Icon,
  className = "size-4",
}: {
  icon: LucideIcon | null;
  className?: string;
}) {
  if (!Icon) return null;
  if (Icon === Handshake) return <AnimatedHandshake className={className} />;
  return <Icon aria-hidden className={className} />;
}

export default memo(function NewOpportunityCard({
  feedbackVariant = "thumbs",
  expanded,
  item,
  onApply,
  onNegative,
  onKeep,
  onOpenCompanyInfo,
  onOpenLink,
  onPositive,
  onToggleOpportunity,
  pending,
  titleAdornment,
  showUnreadIndicator = true,
}: NewOpportunityCardActions & {
  feedbackVariant: HistoryFeedbackVariant;
  titleAdornment?: ReactNode;
  showUnreadIndicator?: boolean;
  expanded: boolean;
  item: CareerHistoryOpportunity;
  pending: boolean;
}) {
  const t = useCareerT();
  const logCareerEvent = useCareerLogEvent();
  const isInternal = item.isInternal || item.sourceType === "internal";
  const handleFeedbackClick = (feedback: "positive" | "negative") => {
    if (
      !isInternal &&
      item.sourceType === "external" &&
      item.feedback === null
    ) {
      logCareerEvent(HISTORY_FEEDBACK_CLICK_EVENT, {
        experiment: HISTORY_FEEDBACK_EXPERIMENT,
        variant: feedbackVariant,
        opportunityId: item.id,
        feedback,
      });
    }
    return feedback === "positive" ? onPositive(item) : onNegative(item);
  };
  const saveHide = !isInternal && feedbackVariant === "save_hide";
  const PositiveActionIcon = saveHide
    ? Bookmark
    : getCareerPositiveActionIcon(item.opportunityType);
  const NegativeActionIcon = saveHide ? Archive : ThumbsDown;
  const positiveLabel = saveHide
    ? t("career.common.save", "저장")
    : getCareerPositiveActionLabel(item.opportunityType, t);
  const negativeLabel = saveHide
    ? t("career.history.feedback_actions.hide_tooltip", "목록에서 숨기기")
    : getCareerNegativeActionLabel(item.opportunityType, t);
  const positiveTooltip = saveHide
    ? t("career.company.jobs.save", "저장하기")
    : positiveLabel;
  const negativeTooltip = negativeLabel;
  const actionClass =
    "py-2.5 rounded-sm font-normal md:font-light text-sm truncate";

  return (
    <OpportunitySwipeRow
      disabled={pending || expanded}
      positive={{
        label: positiveLabel,
        icon: (
          <PositiveActionIconView
            icon={PositiveActionIcon}
            className="size-5"
          />
        ),
        onSelect: () => onPositive(item),
      }}
      negative={{
        label: negativeLabel,
        icon: <NegativeActionIcon aria-hidden className="size-5" />,
        onSelect: () => onNegative(item),
      }}
    >
      <OpportunityCard
        item={item}
        titleAdornment={titleAdornment}
        showUnreadIndicator={showUnreadIndicator}
        expanded={expanded}
        onToggle={() => onToggleOpportunity(item)}
        onOpenCompanyInfo={onOpenCompanyInfo}
        onOpenLink={onOpenLink}
        collapsedActions={
          <div
            className={cn(
              "flex shrink-0 items-center gap-0 md:gap-1 opacity-100 transition-opacity md:[@media(hover:hover)]:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
              pending && "md:[@media(hover:hover)]:opacity-100"
            )}
          >
            {isInternal ? (
              <Tooltips
                text={t(
                  "career.history.keep.tooltip",
                  "가능한 모든 추천에 응답을 해주실수록 더 좋은 기회가 전달될 확률이 높아집니다. 이 선택은 회사에 전달되지 않습니다."
                )}
              >
                <MuteButton
                  disabled={pending}
                  variant="transparent"
                  aria-label={t(
                    "career.history.keep.action",
                    "저장하고 나중에 결정"
                  )}
                  onClick={() => onKeep(item)}
                >
                  <Bookmark aria-hidden className="size-3.5 md:size-4" />
                </MuteButton>
              </Tooltips>
            ) : null}
            <Tooltips text={negativeTooltip}>
              <MuteButton
                aria-label={`${item.title}: ${negativeTooltip}`}
                disabled={pending}
                onClick={() => handleFeedbackClick("negative")}
                variant="transparent"
              >
                <NegativeActionIcon
                  aria-hidden
                  className="size-3.5 md:size-4"
                />
              </MuteButton>
            </Tooltips>
            <Tooltips text={positiveTooltip}>
              <MuteButton
                aria-label={`${item.title}: ${positiveTooltip}`}
                disabled={pending}
                onClick={() => handleFeedbackClick("positive")}
                variant="transparent"
              >
                {pending ? (
                  <Loader2
                    aria-hidden
                    className="size-3.5 md:size-4 animate-spin"
                  />
                ) : PositiveActionIcon ? (
                  <PositiveActionIconView
                    icon={PositiveActionIcon}
                    className="size-3.5 md:size-4"
                  />
                ) : (
                  positiveLabel
                )}
              </MuteButton>
            </Tooltips>
          </div>
        }
        actions={
          <div className="grid grid-cols-2 items-center gap-2 pt-4 md:grid-cols-3 max-md:[&>button:last-child:nth-child(odd)]:col-start-2">
            {isInternal ? (
              <Tooltips
                text={t(
                  "career.history.keep.tooltip",
                  "가능한 모든 추천에 응답을 해주실수록 더 좋은 기회가 전달될 확률이 높아집니다. 이 선택은 회사에 전달되지 않습니다."
                )}
              >
                <MuteButton
                  disabled={pending}
                  onClick={() => onKeep(item)}
                  size="md"
                  variant="neutral"
                  className={actionClass}
                >
                  <Bookmark aria-hidden className="size-3.5" />
                  {t("career.history.keep.action", "저장하고 나중에 결정")}
                </MuteButton>
              </Tooltips>
            ) : null}
            <MuteButton
              disabled={pending}
              onClick={() => handleFeedbackClick("negative")}
              size="md"
              className={actionClass}
            >
              <NegativeActionIcon aria-hidden className="size-3.5 stroke-0.5" />
              {negativeLabel}
            </MuteButton>
            <MuteButton
              disabled={pending}
              onClick={() => handleFeedbackClick("positive")}
              size="md"
              variant={isInternal ? "primary" : "dark"}
              className={actionClass}
            >
              {pending ? (
                <Loader2 aria-hidden className="size-3.5 animate-spin" />
              ) : (
                <PositiveActionIconView
                  icon={PositiveActionIcon}
                  className="size-3.5"
                />
              )}
              {positiveLabel}
            </MuteButton>
            {!isInternal ? (
              <MuteButton
                disabled={pending}
                onClick={() => onApply(item)}
                size="md"
                variant="primary"
                className={actionClass}
              >
                {t("career.history.external_application.apply", "지원하기")}
              </MuteButton>
            ) : null}
          </div>
        }
      />
    </OpportunitySwipeRow>
  );
});
