"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";

export type OpsDateRangeFilterButtonSize = "compact" | "default";

export type OpsDateRangeFilterProps = {
  activeButtonClassName?: string;
  align?: "end" | "start";
  buttonClassName?: string;
  buttonSize?: OpsDateRangeFilterButtonSize;
  calendarClassName?: string;
  className?: string;
  disabledDates?: ComponentProps<typeof Calendar>["disabled"];
  emptyLabel: string;
  from: string;
  inactiveButtonClassName?: string;
  label?: string;
  labelClassName?: string;
  numberOfMonths?: number;
  onChange: (from: string, to: string) => void;
  popoverClassName?: string;
  prefix?: string;
  to: string;
};

export function parseOpsDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    return undefined;
  }
  return date;
}

export const toOpsDateOnly = (date: Date | undefined) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function toOpsDateRange(
  from: string,
  to: string
): DateRange | undefined {
  const fromDate = parseOpsDateOnly(from);
  if (!fromDate) return undefined;
  return {
    from: fromDate,
    to: parseOpsDateOnly(to) ?? fromDate,
  };
}

function formatShortDate(date: Date | undefined) {
  if (!date) return "";
  return date.toLocaleDateString("ko-KR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function formatOpsDateRangeLabel({
  emptyLabel,
  from,
  prefix = "",
  to,
}: {
  emptyLabel: string;
  from: string;
  prefix?: string;
  to: string;
}) {
  const range = toOpsDateRange(from, to);
  if (!range?.from) return emptyLabel;
  const fromLabel = formatShortDate(range.from);
  const toLabel = formatShortDate(range.to ?? range.from);
  const prefixText = prefix ? `${prefix} ` : "";
  return fromLabel === toLabel
    ? `${prefixText}${fromLabel}`
    : `${prefixText}${fromLabel} - ${toLabel}`;
}

export function OpsDateRangeFilter({
  activeButtonClassName = "border-positive/30 bg-positive-faded text-positive",
  align = "start",
  buttonClassName,
  buttonSize,
  calendarClassName,
  className,
  disabledDates,
  emptyLabel,
  from,
  inactiveButtonClassName = "border-neutral-1000-a05 bg-bg-default/70 text-neutral-muted hover:border-neutral-1000-a10 hover:bg-bg-default",
  label,
  labelClassName,
  numberOfMonths = 1,
  onChange,
  popoverClassName,
  prefix = "",
  to,
}: OpsDateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const buttonId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const dateRange = useMemo(() => toOpsDateRange(from, to), [from, to]);
  const [draftDateRange, setDraftDateRange] = useState<DateRange | undefined>();
  const hasFilter = Boolean(from || to);
  const hasDraftFilter = Boolean(draftDateRange?.from);
  const buttonLabel = formatOpsDateRangeLabel({
    emptyLabel,
    from,
    prefix,
    to,
  });
  const resolvedButtonSize = buttonSize ?? (label ? "default" : "compact");

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!containerRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  const applyDraftDateRange = () => {
    onChange(
      toOpsDateOnly(draftDateRange?.from),
      toOpsDateOnly(draftDateRange?.to ?? draftDateRange?.from)
    );
    setOpen(false);
  };

  const togglePopover = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setDraftDateRange(dateRange);
    setOpen(true);
  };

  return (
    <div
      ref={containerRef}
      className={cx("relative", label && "flex flex-col", className)}
    >
      {label ? (
        <label
          htmlFor={buttonId}
          className={cx(opsTheme.label, labelClassName)}
        >
          {label}
        </label>
      ) : null}
      <BareButton
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={togglePopover}
        className={cx(
          "inline-flex items-center justify-between gap-2 rounded-md border px-3 text-xs font-medium transition",
          resolvedButtonSize === "default"
            ? "h-10 min-w-[180px]"
            : "h-9 min-w-[148px]",
          label && "mt-2",
          hasFilter ? activeButtonClassName : inactiveButtonClassName,
          buttonClassName
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{buttonLabel}</span>
        </span>
        <ChevronDown
          className={cx(
            "h-3.5 w-3.5 shrink-0 transition",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </BareButton>
      {open ? (
        <div
          role="dialog"
          aria-label={label ?? emptyLabel}
          className={cx(
            "absolute top-[calc(100%+6px)] z-[1000] w-[300px] rounded-md border border-neutral-1000-a10 bg-bg-floating p-2 shadow-[0_18px_48px_color-mix(in_srgb,var(--color-neutral-1000)_16%,transparent)]",
            align === "end" ? "right-0" : "left-0",
            popoverClassName
          )}
        >
          <Calendar
            mode="range"
            selected={draftDateRange}
            onSelect={setDraftDateRange}
            numberOfMonths={numberOfMonths}
            disabled={disabledDates ?? { after: new Date() }}
            className={cx(
              "p-2 text-[12px] [--cell-size:1.85rem]",
              calendarClassName
            )}
          />
          <div className="mt-1 flex items-center justify-end gap-2 border-t border-neutral-1000-a05 pt-2">
            <BareButton
              type="button"
              onClick={() => setDraftDateRange(undefined)}
              disabled={!hasDraftFilter && !hasFilter}
              className="h-7 rounded-md px-2 text-[11px] font-medium text-neutral-muted transition hover:bg-bg-weak disabled:cursor-not-allowed disabled:opacity-40"
            >
              초기화
            </BareButton>
            <BareButton
              type="button"
              onClick={applyDraftDateRange}
              className="h-7 rounded-md bg-black px-2.5 text-[11px] font-medium text-neutral-00 transition hover:bg-black/88"
            >
              확인
            </BareButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
