import { useMemo, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { formatKstRelativeDateTime } from "@/components/ops/dateUtils";
import {
  TalentIdentity,
  TalentStatusBadges,
} from "@/components/ops/matching/MatchingTalentCells";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { useOpsMatchingFits } from "@/hooks/ops/useOpsMatching";
import type { OpsMatchingFitItem } from "@/lib/ops/matching";

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

function getFitLabelMeta(label: string | null | undefined) {
  const normalized = normalizeFitLabel(label);
  return (
    FIT_LABEL_META[normalized] ?? {
      className: "border-neutral-200 bg-neutral-50 text-neutral-700",
      label: normalized || "미분류",
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

function MatchingFitTable({ items }: { items: OpsMatchingFitItem[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-neutral-1000-a05 bg-bg-floating">
      <table className="w-full min-w-[1480px] table-fixed border-collapse text-left text-xs">
        <thead className="bg-bg-weak text-neutral-muted">
          <tr>
            <th className="w-[260px] px-3 py-2 font-medium">Talent</th>
            <th className="w-[260px] px-3 py-2 font-medium">Internal role</th>
            <th className="w-[200px] px-3 py-2 font-medium">판정</th>
            <th className="w-[90px] px-3 py-2 font-medium">Score</th>
            <th className="w-[430px] px-3 py-2 font-medium">
              판단 이유 / 재평가 기준
            </th>
            <th className="w-[240px] px-3 py-2 font-medium">검토 시각</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-1000-a05">
          {items.map((item) => (
            <tr key={item.fitId} className="align-top text-neutral-muted">
              <td className="px-3 py-3 align-top">
                <TalentIdentity talent={item.talent} />
                <TalentStatusBadges talent={item.talent} />
                <div className="mt-1 text-[11px] text-neutral-soft">
                  {item.talent.userId}
                </div>
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
                <div className="flex flex-wrap gap-1.5">
                  <FitLabelBadge label={item.effectiveLabel} />
                  <FitLabelBadge label={item.label} prefix="LLM" />
                  {item.humanLabel ? (
                    <FitLabelBadge label={item.humanLabel} prefix="Human" />
                  ) : null}
                </div>
                {item.humanReason ? (
                  <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-[11px] leading-5 text-neutral-soft">
                    {item.humanReason}
                  </div>
                ) : null}
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
}: {
  canFetchInternal: boolean;
}) {
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const fitsQuery = useOpsMatchingFits({
    enabled: canFetchInternal,
    limit: 20,
    query: searchQuery,
  });
  const items = useMemo(
    () => fitsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [fitsQuery.data?.pages]
  );
  const totalCount = fitsQuery.data?.pages[0]?.totalCount ?? null;
  const hasActiveFilters = Boolean(searchQuery);

  return (
    <section className="space-y-4">
      <div className="rounded-md space-y-2">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full max-w-[720px]">
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
                }}
                className={cx(opsTheme.buttonSecondary, "h-10 px-3 text-xs")}
              >
                초기화
              </BareButton>
            ) : null}
          </div>
        </div>
        <div className="mt-3 text-xs text-neutral-muted">
          {totalCount === null
            ? "Fit 기록"
            : `${totalCount.toLocaleString("ko-KR")}개 fit 기록`}
        </div>
      </div>

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
        <MatchingFitTable items={items} />
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
    </section>
  );
}
