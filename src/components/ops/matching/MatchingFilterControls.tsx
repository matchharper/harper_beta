import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, Tag } from "lucide-react";
import { toDateOnly } from "@/components/ops/career/utils";
import {
  getMatchingTagLabel,
  getMatchingTagOption,
  MATCHING_TAG_FILTER_OPTIONS,
} from "@/components/ops/matching/tagMeta";
import { cx } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  isOpsMatchingExcludeNotInterestedFilter,
  OPS_MATCHING_EXCLUDE_NOT_INTERESTED_FILTER_VALUE,
} from "@/lib/ops/matchingFilters";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DateRange } from "react-day-picker";

type MatchingDateRangeFilterProps = {
  align?: "end" | "start";
  emptyLabel: string;
  from: string;
  onChange: (from: string, to: string) => void;
  prefix: string;
  to: string;
};

type MatchingTagFilterProps = {
  onChange: (tags: string[]) => void;
  selectedTags: string[];
};

function parseDateOnly(value: string) {
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

function toDateRange(from: string, to: string): DateRange | undefined {
  const fromDate = parseDateOnly(from);
  if (!fromDate) return undefined;
  return {
    from: fromDate,
    to: parseDateOnly(to) ?? fromDate,
  };
}

function formatShortDate(date: Date | undefined) {
  if (!date) return "";
  return date.toLocaleDateString("ko-KR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatDateRangeLabel(args: {
  emptyLabel: string;
  from: string;
  prefix: string;
  to: string;
}) {
  const range = toDateRange(args.from, args.to);
  if (!range?.from) return args.emptyLabel;
  const from = formatShortDate(range.from);
  const to = formatShortDate(range.to ?? range.from);
  return from === to
    ? `${args.prefix} ${from}`
    : `${args.prefix} ${from} - ${to}`;
}

export function MatchingDateRangeFilter({
  align = "start",
  emptyLabel,
  from,
  onChange,
  prefix,
  to,
}: MatchingDateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dateRange = useMemo(() => toDateRange(from, to), [from, to]);
  const hasFilter = Boolean(from || to);
  const label = formatDateRangeLabel({ emptyLabel, from, prefix, to });

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

  return (
    <div ref={containerRef} className="relative">
      <BareButton
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cx(
          "inline-flex h-9 min-w-[148px] items-center justify-between gap-2 rounded-md border px-3 text-xs font-medium transition",
          hasFilter
            ? "border-positive/30 bg-positive-faded text-positive"
            : "border-neutral-1000/20 bg-bg-floating text-neutral-muted hover:border-neutral-1000-a10 hover:bg-bg-weak"
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
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
          className={cx(
            "absolute top-[calc(100%+6px)] z-50 w-[300px] rounded-md border border-neutral-1000-a10 bg-bg-floating p-2 shadow-[0_18px_48px_color-mix(in_srgb,var(--color-neutral-1000)_16%,transparent)]",
            align === "end" ? "right-0" : "left-0"
          )}
        >
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={(range) => {
              onChange(
                toDateOnly(range?.from),
                toDateOnly(range?.to ?? range?.from)
              );
            }}
            numberOfMonths={1}
            disabled={{ after: new Date() }}
            className="p-2 text-[12px] [--cell-size:1.85rem]"
          />
          <div className="mt-1 flex items-center justify-end gap-2 border-t border-neutral-1000-a05 pt-2">
            <BareButton
              type="button"
              onClick={() => onChange("", "")}
              disabled={!hasFilter}
              className="h-7 rounded-md px-2 text-[11px] font-medium text-neutral-muted transition hover:bg-bg-weak disabled:cursor-not-allowed disabled:opacity-40"
            >
              초기화
            </BareButton>
            <BareButton
              type="button"
              onClick={() => setOpen(false)}
              className="h-7 rounded-md bg-black px-2.5 text-[11px] font-medium text-neutral-00 transition hover:bg-black/88"
            >
              닫기
            </BareButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MatchingTagFilter({
  onChange,
  selectedTags,
}: MatchingTagFilterProps) {
  const [open, setOpen] = useState(false);
  const [draftTags, setDraftTags] = useState<string[]>([]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraftTags(selectedTags);
    setOpen(nextOpen);
  };

  const toggleDraftTag = (tag: string, checked: boolean) => {
    setDraftTags((current) => {
      if (checked && isOpsMatchingExcludeNotInterestedFilter(tag)) {
        return [tag];
      }
      const next = new Set(current);
      next.delete(OPS_MATCHING_EXCLUDE_NOT_INTERESTED_FILTER_VALUE);
      if (checked) next.add(tag);
      else next.delete(tag);
      return MATCHING_TAG_FILTER_OPTIONS.map((option) => option.value).filter(
        (value) => next.has(value)
      );
    });
  };

  const label =
    selectedTags.length === 1
      ? getMatchingTagLabel(selectedTags[0] ?? "")
      : selectedTags.length > 0
        ? `태그 ${selectedTags.length}개`
        : "태그 전체";

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <BareButton
          type="button"
          className={cx(
            "inline-flex h-9 min-w-[148px] items-center justify-between gap-2 rounded-md border px-3 text-xs font-medium transition",
            selectedTags.length > 0
              ? "border-positive/30 bg-positive-faded text-positive"
              : "border-neutral-1000-a05 bg-bg-floating text-neutral-muted hover:border-neutral-1000-a10 hover:bg-bg-weak"
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </BareButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {MATCHING_TAG_FILTER_OPTIONS.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={draftTags.includes(option.value)}
            className="gap-2"
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => {
              toggleDraftTag(option.value, checked === true);
            }}
          >
            <span
              className={cx(
                "h-2 w-2 shrink-0 rounded-full",
                option.dotClassName
              )}
              aria-hidden
            />
            {option.label}
            {draftTags.includes(option.value) ? (
              <Check className="ml-auto h-3.5 w-3.5 text-neutral-primary" />
            ) : null}
          </DropdownMenuCheckboxItem>
        ))}
        <div className="mt-1 flex items-center justify-end gap-2 border-t border-neutral-1000-a05 px-1 pt-2">
          <BareButton
            type="button"
            onClick={() => setDraftTags([])}
            disabled={draftTags.length === 0}
            className="h-7 rounded-md px-2 text-[11px] font-medium text-neutral-muted transition hover:bg-bg-weak disabled:cursor-not-allowed disabled:opacity-40"
          >
            초기화
          </BareButton>
          <BareButton
            type="button"
            onClick={() => {
              onChange(draftTags);
              setOpen(false);
            }}
            className="h-7 rounded-md bg-black px-2.5 text-[11px] font-medium text-neutral-00 transition hover:bg-black/88"
          >
            저장
          </BareButton>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MatchingFilterTagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <>
      <span className="text-neutral-soft">· 태그</span>
      {tags.map((tag) => {
        const tagOption = getMatchingTagOption(tag);
        return (
          <span
            key={tag}
            className={cx(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-4",
              tagOption?.badgeClassName ??
                "border-neutral-200 bg-neutral-100 text-neutral-700"
            )}
          >
            <span
              className={cx(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                tagOption?.dotClassName ?? "bg-neutral-500"
              )}
              aria-hidden
            />
            {getMatchingTagLabel(tag)}
          </span>
        );
      })}
    </>
  );
}
