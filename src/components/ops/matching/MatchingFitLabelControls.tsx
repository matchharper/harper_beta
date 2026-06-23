import { useState } from "react";
import { BadgeCheck, Check, ChevronDown, LoaderCircle } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import {
  isOpsMatchingNoHumanLabelFilter,
  OPS_MATCHING_NO_HUMAN_LABEL_FILTER_VALUE,
} from "@/lib/ops/matchingFilters";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  OpsMatchingFitLabel,
  OpsMatchingHumanLabelFilter,
} from "@/lib/ops/matching";

export const FIT_LABEL_OPTIONS = [
  {
    label: "적합",
    value: "fit",
  },
  { label: "보류", value: "hold" },
  { label: "애매", value: "ambiguous" },
  { label: "불만족", value: "dissatisfied" },
  { label: "부적합", value: "unfit" },
] as const satisfies readonly { label: string; value: OpsMatchingFitLabel }[];

const HUMAN_LABEL_MISSING_OPTION = {
  label: "Human label 없음",
  value: OPS_MATCHING_NO_HUMAN_LABEL_FILTER_VALUE,
} as const;

const FIT_LABEL_META: Record<
  string,
  {
    className: string;
    label: string;
  }
> = {
  ambiguous: {
    className: "border-sky-200 bg-sky-50 text-sky-700",
    label: "애매",
  },
  dissatisfied: {
    className: "border-orange-200 bg-orange-50 text-orange-700",
    label: "불만족",
  },
  fit: {
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    label: "적합",
  },
  hold: {
    className: "border-amber-200 bg-amber-50 text-amber-700",
    label: "보류",
  },
  unfit: {
    className: "border-red-200 bg-red-50 text-red-700",
    label: "부적합",
  },
};

export type MatchingFitLabelCellValue = {
  effectiveLabel: string | null;
  humanLabel: string | null;
  humanReason: string | null;
  humanReviewedBy: string | null;
  label: string | null;
};

export function normalizeFitLabel(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function normalizeFitLabelFilters(values: readonly string[]) {
  const allowedLabels = new Set(
    FIT_LABEL_OPTIONS.map((option) => option.value)
  );
  const seen = new Set<string>();
  const labels: OpsMatchingFitLabel[] = [];
  values.forEach((value) => {
    const normalized = normalizeFitLabel(value);
    if (!allowedLabels.has(normalized as OpsMatchingFitLabel)) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    labels.push(normalized as OpsMatchingFitLabel);
  });
  return labels;
}

export function normalizeHumanLabelFilters(
  values: readonly string[]
): OpsMatchingHumanLabelFilter[] {
  const labels = normalizeFitLabelFilters(values);
  if (values.some(isOpsMatchingNoHumanLabelFilter)) {
    return [OPS_MATCHING_NO_HUMAN_LABEL_FILTER_VALUE];
  }
  return labels;
}

export function getFitLabelMeta(label: string | null | undefined) {
  if (isOpsMatchingNoHumanLabelFilter(label)) {
    return {
      className: "border-neutral-200 bg-neutral-50 text-neutral-700",
      label: "없음",
    };
  }

  const normalized = normalizeFitLabel(label);
  return (
    FIT_LABEL_META[normalized] ?? {
      className: "border-neutral-200 bg-neutral-50 text-neutral-700",
      label: normalized || "미지정",
    }
  );
}

export function FitLabelBadge({
  label,
  prefix,
}: {
  label: string | null | undefined;
  prefix?: string;
}) {
  const meta = getFitLabelMeta(label);
  return (
    <span
      className={cx(
        "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium",
        meta.className
      )}
    >
      {prefix ? `${prefix}: ` : null}
      {meta.label}
    </span>
  );
}

export function MatchingFitLabelFilter({
  emptyLabel,
  includeMissingOption = false,
  onChange,
  selectedLabels,
}: {
  emptyLabel: string;
  includeMissingOption?: boolean;
  onChange: (labels: string[]) => void;
  selectedLabels: string[];
}) {
  const [open, setOpen] = useState(false);
  const [draftLabels, setDraftLabels] = useState<string[]>([]);
  const options = includeMissingOption
    ? [HUMAN_LABEL_MISSING_OPTION, ...FIT_LABEL_OPTIONS]
    : FIT_LABEL_OPTIONS;

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraftLabels(selectedLabels);
    setOpen(nextOpen);
  };

  const toggleDraftLabel = (label: string, checked: boolean) => {
    setDraftLabels((current) => {
      if (includeMissingOption && isOpsMatchingNoHumanLabelFilter(label)) {
        return checked ? [OPS_MATCHING_NO_HUMAN_LABEL_FILTER_VALUE] : [];
      }

      const next = new Set(current);
      if (includeMissingOption) {
        next.delete(OPS_MATCHING_NO_HUMAN_LABEL_FILTER_VALUE);
      }
      if (checked) next.add(label);
      else next.delete(label);
      return options
        .map((option) => option.value)
        .filter((value) => next.has(value));
    });
  };

  const buttonLabel =
    selectedLabels.length === 1
      ? getFitLabelMeta(selectedLabels[0]).label
      : selectedLabels.length > 0
        ? `${emptyLabel.replace(" 전체", "")} ${selectedLabels.length}개`
        : emptyLabel;

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <BareButton
          type="button"
          className={cx(
            "inline-flex h-9 min-w-[148px] items-center justify-between gap-2 rounded-md border px-3 text-xs font-medium transition",
            selectedLabels.length > 0
              ? "border-positive/30 bg-positive-faded text-positive"
              : "border-neutral-1000-a05 bg-bg-floating text-neutral-muted hover:border-neutral-1000-a10 hover:bg-bg-weak"
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{buttonLabel}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </BareButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={draftLabels.includes(option.value)}
            className="gap-2"
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => {
              toggleDraftLabel(option.value, checked === true);
            }}
          >
            {option.label}
            {draftLabels.includes(option.value) ? (
              <Check className="ml-auto h-3.5 w-3.5 text-neutral-primary" />
            ) : null}
          </DropdownMenuCheckboxItem>
        ))}
        <div className="mt-1 flex items-center justify-end gap-2 border-t border-neutral-1000-a05 px-1 pt-2">
          <BareButton
            type="button"
            onClick={() => setDraftLabels([])}
            disabled={draftLabels.length === 0}
            className="h-7 rounded-md px-2 text-[11px] font-medium text-neutral-muted transition hover:bg-bg-weak disabled:cursor-not-allowed disabled:opacity-40"
          >
            초기화
          </BareButton>
          <BareButton
            type="button"
            onClick={() => {
              onChange(draftLabels);
              setOpen(false);
            }}
            className="h-7 rounded-md bg-black px-2.5 text-[11px] font-medium text-neutral-00 transition hover:bg-black/88"
          >
            확인
          </BareButton>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MatchingFitLabelChips({
  labels,
  prefix,
}: {
  labels: string[];
  prefix: string;
}) {
  if (labels.length === 0) return null;

  return (
    <>
      <span className="text-neutral-soft">· {prefix}</span>
      {labels.map((label) => (
        <FitLabelBadge key={`${prefix}:${label}`} label={label} />
      ))}
    </>
  );
}

function getRecordSummaryText(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, "summary")) {
    return undefined;
  }

  return typeof record.summary === "string" ? record.summary.trim() : "";
}

function formatCriteriaText(value: unknown) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return "";
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        const parsed = JSON.parse(text) as unknown;
        const summary = getRecordSummaryText(parsed);
        if (summary !== undefined) return summary;
      } catch {
        return text;
      }
    }
    return text;
  }

  const summary = getRecordSummaryText(value);
  if (summary !== undefined) return summary;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatFitReasonText(reason: string | null | undefined) {
  const text = String(reason ?? "").trim();
  if (!text) return "";

  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      const summary = getRecordSummaryText(parsed);
      if (summary !== undefined) return summary;
      if (typeof parsed === "object" && parsed !== null) return "";
    } catch {
      return text;
    }
  }

  return text;
}

export function FitReasonCell({
  criteria,
  expanded = false,
  reason,
}: {
  criteria: unknown;
  expanded?: boolean;
  reason: string | null;
}) {
  const criteriaText = formatCriteriaText(criteria);
  const reasonText = formatFitReasonText(reason);
  return (
    <div className="space-y-2">
      <div
        className={cx(
          "whitespace-pre-wrap break-words text-[13px] font-normal leading-5 text-neutral-primary"
        )}
      >
        {reasonText || "-"}
      </div>
      {criteriaText && (
        <div
          className={cx(
            "overflow-auto whitespace-pre-wrap break-words rounded bg-bg-weak p-2 text-[12px] leading-5 text-neutral-primary",
            expanded ? "max-h-64" : "max-h-32"
          )}
        >
          {criteriaText}
        </div>
      )}
    </div>
  );
}

function HumanLabelDropdown<TItem extends { humanLabel: string | null }>({
  disabled,
  item,
  onChange,
}: {
  disabled: boolean;
  item: TItem;
  onChange: (item: TItem, label: OpsMatchingFitLabel | null) => void;
}) {
  const label = item.humanLabel ? "변경" : "설정";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <BareButton
          type="button"
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className={cx(
            opsTheme.buttonSecondary,
            "mt-2 h-[40px] px-[13px] text-[14px] disabled:cursor-wait"
          )}
        >
          {disabled ? (
            <LoaderCircle className="h-[16px] w-[16px] animate-spin" />
          ) : null}
          Human label {label}
        </BareButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {FIT_LABEL_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            selected={item.humanLabel === option.value}
            onSelect={() => onChange(item, option.value)}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          tone="danger"
          disabled={!item.humanLabel}
          onSelect={() => onChange(item, null)}
        >
          Human label 지우기
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MatchingFitLabelCell<TItem extends MatchingFitLabelCellValue>({
  isUpdating,
  item,
  onHumanLabelChange,
}: {
  isUpdating: boolean;
  item: TItem;
  onHumanLabelChange?: (item: TItem, label: OpsMatchingFitLabel | null) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <FitLabelBadge label={item.effectiveLabel} prefix="현재" />
        <FitLabelBadge label={item.label} prefix="LLM" />
      </div>
      <div className="mt-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-normal uppercase text-neutral-soft">
            Human 평가
          </span>
          {item.humanLabel && <FitLabelBadge label={item.humanLabel} />}
        </div>
        {item.humanReviewedBy ? (
          <div className="mt-1 truncate text-[11px] text-neutral-soft">
            by {item.humanReviewedBy}
          </div>
        ) : null}
        {item.humanReason ? (
          <div className="mt-1 line-clamp-2 whitespace-pre-wrap text-[11px] leading-5 text-neutral-soft">
            {item.humanReason}
          </div>
        ) : null}
        {onHumanLabelChange ? (
          <HumanLabelDropdown
            disabled={isUpdating}
            item={item}
            onChange={onHumanLabelChange}
          />
        ) : null}
      </div>
    </div>
  );
}
