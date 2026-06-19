import { useMemo, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { formatKstRelativeDateTime } from "@/components/ops/dateUtils";
import {
  FitReasonCell,
  MatchingFitLabelCell,
  MatchingFitLabelChips,
  MatchingFitLabelFilter,
  normalizeFitLabelFilters,
} from "@/components/ops/matching/MatchingFitLabelControls";
import {
  TalentIdentity,
  TalentStatusBadges,
} from "@/components/ops/matching/MatchingTalentCells";
import { MatchingTalentDrawer } from "@/components/ops/matching/MatchingTalentDrawer";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
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

function toDrawerRole(role: OpsMatchingFitRole): OpsMatchingRoleOption {
  return {
    companyName: role.companyName ?? "회사명 없음",
    companyWorkspaceId: role.companyWorkspaceId ?? "",
    descriptionSummary: null,
    locationText: role.locationText,
    roleId: role.roleId,
    roleName: role.roleName ?? "역할명 없음",
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
                  {item.role.roleName ?? "역할명 없음"}
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-neutral-soft">
                  {item.role.locationText ? (
                    <span>{item.role.locationText}</span>
                  ) : null}
                  {item.role.status ? <span>{item.role.status}</span> : null}
                </div>
              </td>
              <td className="px-3 py-3 align-top">
                <MatchingFitLabelCell
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
