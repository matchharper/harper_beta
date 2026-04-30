import React from "react";
import { careerCx } from "../ui/CareerPrimitives";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  MessageSquare,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { CareerHistoryOpportunity } from "../types";
import {
  getNegativeActionLabel,
  getPositiveActionLabel,
} from "../CareerHistoryPanel";

const ShortcutKey = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-beige900/10 bg-beige500 px-1.5 text-[10.5px] font-medium leading-none text-beige900/70 shadow-[0_1px_0_rgba(46,23,6,0.05)]">
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
      "inline-flex h-10 min-w-[120px] flex-1 items-center justify-center gap-2 rounded-[10px] px-3 text-[13.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
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
    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-beige900/10 bg-transparent text-beige900/60 transition-colors hover:bg-beige500 hover:text-beige900 disabled:cursor-not-allowed disabled:opacity-40"
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
  onQuestion,
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
  onQuestion: () => void;
}) => (
  <div className="space-y-2.5">
    <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-beige900/10 bg-white/75 p-2 shadow-[0_1px_2px_rgba(46,23,6,0.04)] sm:flex-nowrap">
      <ShortcutNavButton
        onClick={onPrev}
        disabled={activeIndex <= 0}
        label="이전 포지션"
      >
        <ArrowLeft className="h-4 w-4" />
      </ShortcutNavButton>

      <ShortcutActionButton
        onClick={onNegative}
        disabled={pending}
        className="bg-beige500 text-beige900/70 hover:bg-beige200 hover:text-beige900"
      >
        <ThumbsDown className="h-4 w-4" />
        {getNegativeActionLabel(item)}
      </ShortcutActionButton>

      <ShortcutActionButton
        onClick={onQuestion}
        disabled={pending}
        className="border border-beige900/10 bg-white/45 text-beige900/70 hover:border-beige900/20 hover:text-beige900 sm:max-w-[148px]"
      >
        <MessageSquare className="h-4 w-4" />
        질문하기
      </ShortcutActionButton>

      <ShortcutActionButton
        onClick={onPositive}
        disabled={pending}
        className="bg-beige700 text-beige50 hover:bg-beige900"
      >
        <ThumbsUp className="h-4 w-4" />
        {getPositiveActionLabel(item)}
      </ShortcutActionButton>

      <ShortcutNavButton
        onClick={onNext}
        disabled={!canMoveNext || nextPending}
        label="다음 포지션"
      >
        {nextPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ArrowRight className="h-4 w-4" />
        )}
      </ShortcutNavButton>
    </div>

    <div className="flex flex-wrap items-center justify-center gap-2.5 text-[11.5px] leading-5 text-beige900/50">
      <span className="text-[13px] opacity-60">⌨</span>
      <span className="inline-flex items-center gap-1.5">
        <ShortcutKey>←</ShortcutKey>
        <ShortcutKey>→</ShortcutKey>
        이동
      </span>
      <span className="text-beige900/20">·</span>
      <span className="inline-flex items-center gap-1.5">
        <ShortcutKey>S</ShortcutKey>
        {getNegativeActionLabel(item)}
      </span>
      <span className="text-beige900/20">·</span>
      <span className="inline-flex items-center gap-1.5">
        <ShortcutKey>T</ShortcutKey>
        {getPositiveActionLabel(item)}
      </span>
      <span className="text-beige900/20">·</span>
      <span className="inline-flex items-center gap-1.5">
        <ShortcutKey>A</ShortcutKey>
        질문하기
      </span>
    </div>
  </div>
);

export default React.memo(HistoryShortcutPanel);
