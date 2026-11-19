import {
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
import {
  getCareerNegativeActionLabel,
  getCareerPositiveActionIcon,
  getCareerPositiveActionLabel,
} from "../opportunityTypeMeta";
import type { CareerHistoryOpportunity } from "../types";
import OpportunityCard from "./OpportunityCard";
import { OpportunitySwipeRow } from "./OpportunitySwipeRow";
import { getExternalOpportunityApplyLabel } from "./hiringPost";

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
  titleAdornment?: ReactNode;
  showUnreadIndicator?: boolean;
  expanded: boolean;
  item: CareerHistoryOpportunity;
  pending: boolean;
}) {
  const t = useCareerT();
  const isInternal = item.isInternal || item.sourceType === "internal";
  const PositiveActionIcon = getCareerPositiveActionIcon(item.opportunityType);
  const positiveLabel = getCareerPositiveActionLabel(item.opportunityType, t);
  const negativeLabel = getCareerNegativeActionLabel(item.opportunityType, t);
  const actionClass = "py-2.5 rounded-sm font-normal text-sm truncate";
  const feedbackActions = (
    <div className="flex shrink-0 items-center gap-1">
      {isInternal ? (
        <Tooltips
          text={t("career.history.keep.tooltip", "저장해두고 나중에 결정")}
        >
          <MuteButton
            disabled={pending}
            variant="transparent"
            aria-label={t("career.history.keep.action", "저장하고 나중에 결정")}
            onClick={() => onKeep(item)}
          >
            <Bookmark aria-hidden className="size-3.5 md:size-4" />
          </MuteButton>
        </Tooltips>
      ) : null}
      <Tooltips text={negativeLabel}>
        <MuteButton
          aria-label={`${item.title}: ${negativeLabel}`}
          disabled={pending}
          onClick={() => onNegative(item)}
          variant="transparent"
        >
          <ThumbsDown aria-hidden className="size-3.5 md:size-4" />
        </MuteButton>
      </Tooltips>
      <Tooltips text={positiveLabel}>
        <MuteButton
          aria-label={`${item.title}: ${positiveLabel}`}
          disabled={pending}
          onClick={() => onPositive(item)}
          variant="transparent"
        >
          {pending ? (
            <Loader2 aria-hidden className="size-3.5 md:size-4 animate-spin" />
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
  );

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
        icon: <ThumbsDown aria-hidden className="size-5" />,
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
        collapsedActions={feedbackActions}
        actions={
          <div className="grid grid-cols-2 items-center gap-2 pt-4 max-md:[&>button:last-child:nth-child(odd)]:col-start-2">
            {isInternal ? (
              <Tooltips
                text={t(
                  "career.history.keep.tooltip",
                  "저장해두고 나중에 결정"
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
              onClick={() => onNegative(item)}
              size="md"
              className={actionClass}
            >
              <ThumbsDown aria-hidden className="size-3.5 stroke-0.5" />
              {negativeLabel}
            </MuteButton>
            <MuteButton
              disabled={pending}
              onClick={() => onPositive(item)}
              size="md"
              variant={isInternal ? "primary" : "neutral"}
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
                {getExternalOpportunityApplyLabel(item, t)}
              </MuteButton>
            ) : null}
          </div>
        }
      />
    </OpportunitySwipeRow>
  );
});
