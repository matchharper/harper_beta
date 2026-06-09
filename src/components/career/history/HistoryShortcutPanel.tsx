import React from "react";
import { careerCx } from "../ui/CareerPrimitives";
import { ArrowLeft, ArrowRight, Loader2, ThumbsDown } from "lucide-react";
import { CareerHistoryOpportunity } from "../types";
import {
  getNegativeActionLabel,
  getPositiveActionLabel,
} from "../CareerHistoryPanel";
import { getCareerPositiveActionIcon } from "../opportunityTypeMeta";

const ShortcutKey = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-neutral-200 px-1 text-[9.5px] font-medium leading-none text-beige900/70 shadow-[0_1px_0_rgba(46,23,6,0.05)]">
    {children}
  </kbd>
);

const ShortcutActionButton = ({
  children,
  className,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={careerCx(
      "inline-flex h-10 min-w-[92px] flex-1 items-center justify-center gap-1 rounded-[8px] px-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
      className
    )}
  >
    {children}
  </button>
);

const ShortcutNavButton = ({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-neutral-200 text-black transition-colors hover:bg-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
  >
    {children}
  </button>
);

const HistoryShortcutPanel = ({
  activeIndex,
  onNext,
  onPrev,
  item,
  pending,
  onPositive,
  onNegative,
  canMoveNext,
  nextPending,
}: {
  activeIndex: number;
  canMoveNext: boolean;
  onNext: () => void;
  onPrev: () => void;
  item: CareerHistoryOpportunity;
  nextPending: boolean;
  pending: boolean;
  onPositive: () => void;
  onNegative: () => void;
}) => {
  const PositiveActionIcon = getCareerPositiveActionIcon(item.opportunityType);

  return (
    <div className="space-y-2.5">
      <div className="flex text-sm flex-wrap items-center gap-1 rounded-[10px] sm:flex-nowrap">
        <ShortcutNavButton
          onClick={onPrev}
          disabled={activeIndex <= 0}
          label="이전 포지션"
        >
          <ArrowLeft className="h-3 w-3" />
        </ShortcutNavButton>

        <ShortcutActionButton
          onClick={onNegative}
          disabled={pending}
          className="bg-neutral-200 text-black"
        >
          <ThumbsDown className="h-3 w-3" />
          {getNegativeActionLabel(item)}
        </ShortcutActionButton>

        <ShortcutActionButton
          onClick={onPositive}
          disabled={pending}
          className="bg-black text-white hover:opacity-90"
        >
          <PositiveActionIcon className="h-3 w-3" />
          {getPositiveActionLabel(item)}
        </ShortcutActionButton>

        <ShortcutNavButton
          onClick={onNext}
          disabled={!canMoveNext || nextPending}
          label="다음 포지션"
        >
          {nextPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ArrowRight className="h-3 w-3" />
          )}
        </ShortcutNavButton>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-[12px] leading-4 text-black/50">
        <span className="inline-flex items-center gap-2">
          <ShortcutKey>←</ShortcutKey>
          <ShortcutKey>→</ShortcutKey>
          이동
        </span>
        <span className="text-beige900/20">·</span>
        <span className="inline-flex items-center gap-2">
          <ShortcutKey>S</ShortcutKey>
          {getNegativeActionLabel(item)}
        </span>
        <span className="text-beige900/20">·</span>
        <span className="inline-flex items-center gap-2">
          <ShortcutKey>T</ShortcutKey>
          {getPositiveActionLabel(item)}
        </span>
      </div>
    </div>
  );
};

export default React.memo(HistoryShortcutPanel);
