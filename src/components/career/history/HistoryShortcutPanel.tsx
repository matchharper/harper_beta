import React from "react";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  ThumbsDown,
  type LucideIcon,
} from "lucide-react";
import { CareerHistoryOpportunity } from "../types";
import {
  getNegativeActionLabel,
  getPositiveActionLabel,
} from "../CareerHistoryPanel";
import { getCareerPositiveActionIcon } from "../opportunityTypeMeta";
import { BareButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";

const ShortcutKey = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-bg-weak px-1 text-[9.5px] font-medium leading-none text-neutral-muted shadow-[0_1px_0_color-mix(in_srgb,var(--color-neutral-1000)_5%,transparent)]">
    {children}
  </kbd>
);

const ShortcutPositiveActionIcon = ({ icon: Icon }: { icon: LucideIcon }) => (
  <Icon className="h-3 w-3" />
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
  <BareButton
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "inline-flex h-10 min-w-[92px] flex-1 items-center justify-center gap-1 rounded-[8px] px-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
      className
    )}
  >
    {children}
  </BareButton>
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
  <BareButton
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-bg-weak text-neutral-primary transition-colors hover:bg-bg-weak disabled:cursor-not-allowed disabled:opacity-40"
  >
    {children}
  </BareButton>
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
  const t = useCareerT();

  const PositiveActionIcon = getCareerPositiveActionIcon(item.opportunityType);
  const positiveActionClassName =
    item.isInternal || item.sourceType === "internal"
      ? "bg-primary text-neutral-00 hover:opacity-90"
      : "bg-black text-neutral-00 hover:opacity-90";

  return (
    <div className="space-y-2.5">
      <div className="flex text-sm flex-wrap items-center gap-1 rounded-[10px] sm:flex-nowrap">
        <ShortcutNavButton
          onClick={onPrev}
          disabled={activeIndex <= 0}
          label={t(
            "career.history.history_shortcut_panel.1kpvg7d",
            "이전 포지션"
          )}
        >
          <ArrowLeft className="h-3 w-3" />
        </ShortcutNavButton>

        <ShortcutActionButton
          onClick={onNegative}
          disabled={pending}
          className="bg-bg-weak text-neutral-primary"
        >
          <ThumbsDown className="h-3 w-3" />
          {getNegativeActionLabel(item, t)}
        </ShortcutActionButton>

        <ShortcutActionButton
          onClick={onPositive}
          disabled={pending}
          className={positiveActionClassName}
        >
          <ShortcutPositiveActionIcon icon={PositiveActionIcon} />
          {getPositiveActionLabel(item, t)}
        </ShortcutActionButton>

        <ShortcutNavButton
          onClick={onNext}
          disabled={!canMoveNext || nextPending}
          label={t(
            "career.history.history_shortcut_panel.1s07tch",
            "다음 포지션"
          )}
        >
          {nextPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ArrowRight className="h-3 w-3" />
          )}
        </ShortcutNavButton>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-[12px] leading-4 text-neutral-muted">
        <span className="inline-flex items-center gap-2">
          <ShortcutKey>←</ShortcutKey>
          <ShortcutKey>→</ShortcutKey>
          {t("career.history.history_shortcut_panel.0kgqz9q", "이동")}
        </span>
        <span className="text-neutral-primary/20">·</span>
        <span className="inline-flex items-center gap-2">
          <ShortcutKey>S</ShortcutKey>
          {getNegativeActionLabel(item, t)}
        </span>
        <span className="text-neutral-primary/20">·</span>
        <span className="inline-flex items-center gap-2">
          <ShortcutKey>T</ShortcutKey>
          {getPositiveActionLabel(item, t)}
        </span>
      </div>
    </div>
  );
};

export default React.memo(HistoryShortcutPanel);
