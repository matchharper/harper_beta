import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  LoaderCircle,
  Search,
} from "lucide-react";
import { formatKstRelativeDateTime } from "@/components/ops/dateUtils";
import {
  TalentIdentity,
  TalentStatusBadges,
} from "@/components/ops/matching/MatchingTalentCells";
import { MatchingTalentDrawer } from "@/components/ops/matching/MatchingTalentDrawer";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input as UiInput } from "@/components/ui/input";
import {
  useOpsMatchingFits,
  useUpdateOpsMatchingFitHumanLabel,
} from "@/hooks/ops/useOpsMatching";
import type {
  OpsMatchingFitItem,
  OpsMatchingFitLabel,
  OpsMatchingFitRole,
  OpsMatchingRoleOption,
} from "@/lib/ops/matching";

const FIT_LABEL_OPTIONS = [
  { label: "적합", value: "fit" },
  { label: "보류", value: "hold" },
  { label: "애매", value: "ambiguous" },
  { label: "불만족", value: "dissatisfied" },
  { label: "부적합", value: "unfit" },
] as const satisfies readonly { label: string; value: OpsMatchingFitLabel }[];

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

function normalizeFitLabel(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeFitLabelFilters(values: readonly string[]) {
  const allowedLabels = new Set(FIT_LABEL_OPTIONS.map((option) => option.value));
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

function getFitLabelMeta(label: string | null | undefined) {
  const normalized = normalizeFitLabel(label);
  return (
    FIT_LABEL_META[normalized] ?? {
      className: "border-neutral-200 bg-neutral-50 text-neutral-700",
      label: normalized || "미지정",
    }
  );
}

function FitLabelBadge({
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

function MatchingFitLabelFilter({
  emptyLabel,
  onChange,
  selectedLabels,
}: {
  emptyLabel: string;
  onChange: (labels: OpsMatchingFitLabel[]) => void;
  selectedLabels: OpsMatchingFitLabel[];
}) {
  const [open, setOpen] = useState(false);
  const [draftLabels, setDraftLabels] = useState<OpsMatchingFitLabel[]>([]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraftLabels(selectedLabels);
    setOpen(nextOpen);
  };

  const toggleDraftLabel = (label: OpsMatchingFitLabel, checked: boolean) => {
    setDraftLabels((current) => {
      const next = new Set(current);
      if (checked) next.add(label);
      else next.delete(label);
      return FIT_LABEL_OPTIONS.map((option) => option.value).filter((value) =>
        next.has(value)
      );
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
        {FIT_LABEL_OPTIONS.map((option) => (
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

function MatchingFitLabelChips({
  labels,
  prefix,
}: {
  labels: OpsMatchingFitLabel[];
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

function formatJsonValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function FitReasonCell({
  criteria,
  reason,
}: {
  criteria: unknown;
  reason: string | null;
}) {
  const criteriaText = formatJsonValue(criteria);
  return (
    <div className="space-y-2">
      <div className="line-clamp-4 whitespace-pre-wrap break-words text-[12px] leading-5 text-neutral-muted">
        {reason || "-"}
      </div>
      {criteriaText ? (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-bg-weak p-2 font-sans text-[11px] leading-5 text-neutral-soft">
          {criteriaText}
        </pre>
      ) : null}
    </div>
  );
}

function toDrawerRole(role: OpsMatchingFitRole): OpsMatchingRoleOption {
  return {
    companyName: role.companyName ?? "회사명 없음",
    companyWorkspaceId: role.companyWorkspaceId ?? "",
    descriptionSummary: null,
    locationText: role.locationText,
    roleId: role.roleId,
    roleName: role.roleName ?? role.roleId,
    sourceType: "internal",
    status: role.status ?? "",
    updatedAt: role.updatedAt ?? "",
  };
}

function RecommendationCell({ item }: { item: OpsMatchingFitItem }) {
  const recommendation = item.recommendation;
  if (!recommendation) {
    return (
      <div className="space-y-1">
        <span className="inline-flex rounded border border-neutral-1000-a05 bg-bg-default px-2 py-0.5 text-[11px] font-medium text-neutral-soft">
          미추천
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1 text-[12px] leading-5 text-neutral-soft">
      <span className="inline-flex rounded border border-positive/25 bg-positive-faded px-2 py-0.5 text-[11px] font-medium text-positive">
        추천됨
      </span>
      <div>{formatKstRelativeDateTime(recommendation.recommendedAt)}</div>
    </div>
  );
}

function HumanLabelDropdown({
  disabled,
  item,
  onChange,
}: {
  disabled: boolean;
  item: OpsMatchingFitItem;
  onChange: (item: OpsMatchingFitItem, label: OpsMatchingFitLabel | null) => void;
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
            "mt-2 h-7 px-2 text-[11px] disabled:cursor-wait"
          )}
        >
          {disabled ? <LoaderCircle className="h-3 w-3 animate-spin" /> : null}
          Human label {label}
        </BareButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
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

function LabelCell({
  isUpdating,
  item,
  onHumanLabelChange,
}: {
  isUpdating: boolean;
  item: OpsMatchingFitItem;
  onHumanLabelChange: (
    item: OpsMatchingFitItem,
    label: OpsMatchingFitLabel | null
  ) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <FitLabelBadge label={item.effectiveLabel} prefix="현재" />
        <FitLabelBadge label={item.label} prefix="LLM" />
      </div>
      <div className="rounded-md border border-neutral-1000-a05 bg-bg-default/70 px-2 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase text-neutral-soft">
            Human
          </span>
          {item.humanLabel ? (
            <FitLabelBadge label={item.humanLabel} />
          ) : (
            <span className="text-[11px] text-neutral-soft">미지정</span>
          )}
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
        <HumanLabelDropdown
          disabled={isUpdating}
          item={item}
          onChange={onHumanLabelChange}
        />
      </div>
    </div>
  );
}

function MatchingFitTable({
  items,
  onHumanLabelChange,
  onSelect,
  updatingFitId,
}: {
  items: OpsMatchingFitItem[];
  onHumanLabelChange: (
    item: OpsMatchingFitItem,
    label: OpsMatchingFitLabel | null
  ) => void;
  onSelect: (item: OpsMatchingFitItem) => void;
  updatingFitId: string | null;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-neutral-1000-a05 bg-bg-floating">
      <table className="w-full min-w-[1660px] table-fixed border-collapse text-left text-xs">
        <thead className="bg-bg-weak text-neutral-muted">
          <tr>
            <th className="w-[260px] px-3 py-2 font-medium">Talent</th>
            <th className="w-[260px] px-3 py-2 font-medium">Internal role</th>
            <th className="w-[250px] px-3 py-2 font-medium">판정</th>
            <th className="w-[160px] px-3 py-2 font-medium">추천 여부</th>
            <th className="w-[90px] px-3 py-2 font-medium">Score</th>
            <th className="w-[430px] px-3 py-2 font-medium">
              판단 이유 / 재평가 기준
            </th>
            <th className="w-[210px] px-3 py-2 font-medium">검토 시각</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-1000-a05">
          {items.map((item) => (
            <tr
              key={item.fitId}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(item);
                }
              }}
              className="cursor-pointer align-top text-neutral-muted transition hover:bg-bg-default"
            >
              <td className="px-3 py-3 align-top">
                <TalentIdentity talent={item.talent} />
                <TalentStatusBadges talent={item.talent} />
              </td>
              <td className="px-3 py-3 align-top">
                <div className="truncate text-sm font-medium text-neutral-primary">
                  {item.role.companyName ?? "회사명 없음"}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-neutral-muted">
                  {item.role.roleName ?? item.role.roleId}
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-neutral-soft">
                  {item.role.locationText ? (
                    <span>{item.role.locationText}</span>
                  ) : null}
                  {item.role.status ? <span>{item.role.status}</span> : null}
                </div>
              </td>
              <td className="px-3 py-3 align-top">
                <LabelCell
                  isUpdating={updatingFitId === item.fitId}
                  item={item}
                  onHumanLabelChange={onHumanLabelChange}
                />
              </td>
              <td className="px-3 py-3 align-top">
                <RecommendationCell item={item} />
              </td>
              <td className="px-3 py-3 align-top text-sm font-medium text-neutral-primary">
                {item.score}
              </td>
              <td className="px-3 py-3 align-top">
                <FitReasonCell
                  criteria={item.reevaluationCriteria}
                  reason={item.reason}
                />
              </td>
              <td className="px-3 py-3 align-top text-[12px] leading-5 text-neutral-soft">
                <div>
                  평가 {formatKstRelativeDateTime(item.lastEvaluatedAt)}
                </div>
                <div>
                  재검토 {formatKstRelativeDateTime(item.reevaluationCheckedAt)}
                </div>
                {item.humanReviewedAt ? (
                  <div>
                    사람 {formatKstRelativeDateTime(item.humanReviewedAt)}
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MatchingFitRecordBrowser({
  canFetchInternal,
  humanLabelFilters,
  llmLabelFilters,
  onHumanLabelFiltersChange,
  onLlmLabelFiltersChange,
}: {
  canFetchInternal: boolean;
  humanLabelFilters: string[];
  llmLabelFilters: string[];
  onHumanLabelFiltersChange: (labels: string[]) => void;
  onLlmLabelFiltersChange: (labels: string[]) => void;
}) {
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<OpsMatchingFitItem | null>(
    null
  );
  const normalizedLlmLabelFilters = useMemo(
    () => normalizeFitLabelFilters(llmLabelFilters),
    [llmLabelFilters]
  );
  const normalizedHumanLabelFilters = useMemo(
    () => normalizeFitLabelFilters(humanLabelFilters),
    [humanLabelFilters]
  );
  const fitsQuery = useOpsMatchingFits({
    enabled: canFetchInternal,
    humanLabels: normalizedHumanLabelFilters,
    limit: 20,
    llmLabels: normalizedLlmLabelFilters,
    query: searchQuery,
  });
  const updateHumanLabel = useUpdateOpsMatchingFitHumanLabel();
  const items = useMemo(
    () => fitsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [fitsQuery.data?.pages]
  );
  const totalCount = fitsQuery.data?.pages[0]?.totalCount ?? null;
  const hasActiveFilters = Boolean(
    searchQuery ||
      normalizedLlmLabelFilters.length > 0 ||
      normalizedHumanLabelFilters.length > 0
  );
  const selectedDrawerRole = selectedItem
    ? toDrawerRole(selectedItem.role)
    : null;

  const handleHumanLabelChange = (
    item: OpsMatchingFitItem,
    label: OpsMatchingFitLabel | null
  ) => {
    if (updateHumanLabel.isPending) return;
    updateHumanLabel.mutate({
      fitId: item.fitId,
      humanLabel: label,
    });
  };

  return (
    <section className="space-y-4">
      <div className="rounded-md space-y-2">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <div className="relative w-full max-w-[640px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
              <UiInput
                unstyled
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    setSearchQuery(searchDraft.trim());
                  }
                }}
                className={cx(opsTheme.input, "pl-9")}
                placeholder="이름/이메일/회사/역할 검색"
              />
            </div>
            <MatchingFitLabelFilter
              emptyLabel="LLM label 전체"
              selectedLabels={normalizedLlmLabelFilters}
              onChange={onLlmLabelFiltersChange}
            />
            <MatchingFitLabelFilter
              emptyLabel="Human label 전체"
              selectedLabels={normalizedHumanLabelFilters}
              onChange={onHumanLabelFiltersChange}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BareButton
              type="button"
              onClick={() => setSearchQuery(searchDraft.trim())}
              className={cx(opsTheme.buttonPrimary, "h-10 px-3 text-xs")}
            >
              적용
            </BareButton>
            {hasActiveFilters ? (
              <BareButton
                type="button"
                onClick={() => {
                  setSearchDraft("");
                  setSearchQuery("");
                  onLlmLabelFiltersChange([]);
                  onHumanLabelFiltersChange([]);
                }}
                className={cx(opsTheme.buttonSecondary, "h-10 px-3 text-xs")}
              >
                초기화
              </BareButton>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-neutral-muted">
          <span>
            {totalCount === null
              ? "Fit 기록"
              : `${totalCount.toLocaleString("ko-KR")}개 fit 기록`}
          </span>
          <MatchingFitLabelChips
            labels={normalizedLlmLabelFilters}
            prefix="LLM"
          />
          <MatchingFitLabelChips
            labels={normalizedHumanLabelFilters}
            prefix="Human"
          />
        </div>
      </div>

      {updateHumanLabel.error ? (
        <div className={opsTheme.errorNotice}>
          {updateHumanLabel.error instanceof Error
            ? updateHumanLabel.error.message
            : "Human label을 저장하지 못했습니다."}
        </div>
      ) : null}

      {fitsQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
        </div>
      ) : fitsQuery.error ? (
        <div className={opsTheme.errorNotice}>
          {fitsQuery.error instanceof Error
            ? fitsQuery.error.message
            : "Fit 기록을 불러오지 못했습니다."}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-10 text-center text-sm text-neutral-soft">
          조건에 맞는 fit 기록이 없습니다.
        </div>
      ) : (
        <MatchingFitTable
          items={items}
          onHumanLabelChange={handleHumanLabelChange}
          onSelect={setSelectedItem}
          updatingFitId={updateHumanLabel.variables?.fitId ?? null}
        />
      )}

      {fitsQuery.hasNextPage ? (
        <div className="flex justify-center">
          <BareButton
            type="button"
            onClick={() => void fitsQuery.fetchNextPage()}
            disabled={fitsQuery.isFetchingNextPage}
            className={cx(opsTheme.buttonSecondary, "h-10 px-4 text-xs")}
          >
            {fitsQuery.isFetchingNextPage ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            20개 더 보기
          </BareButton>
        </div>
      ) : null}

      <MatchingTalentDrawer
        role={selectedDrawerRole}
        talent={selectedItem?.talent ?? null}
        onClose={() => setSelectedItem(null)}
      />
    </section>
  );
}
