import { useMemo, useState } from "react";
import { Columns3, LoaderCircle, Search, Table2 } from "lucide-react";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import {
  MatchingDateRangeFilter,
  MatchingFilterTagChips,
  MatchingTagFilter,
} from "@/components/ops/matching/MatchingFilterControls";
import {
  ProfileLabelCell,
  TalentIdentity,
  TalentStatusBadges,
} from "@/components/ops/matching/MatchingTalentCells";
import { MatchingTalentDrawer } from "@/components/ops/matching/MatchingTalentDrawer";
import {
  MatchingMemoQuickAdd,
  MatchingTagEditor,
} from "@/components/ops/matching/MatchingTalentInlineActions";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { useOpsMatchingTalents } from "@/hooks/useOpsMatching";
import type {
  OpsMatchingRoleOption,
  OpsMatchingTalentItem,
} from "@/lib/opsMatching";

type MatchingTalentBrowserProps = {
  canFetchInternal: boolean;
  createdFrom: string;
  createdTo: string;
  onCreatedDateRangeChange: (from: string, to: string) => void;
  onTagFiltersChange: (tags: string[]) => void;
  role: OpsMatchingRoleOption;
  tagFilters: string[];
};

type ViewMode = "card" | "table";

function MatchingTalentTable({
  onSelect,
  roleId,
  talents,
}: {
  onSelect: (talent: OpsMatchingTalentItem) => void;
  roleId: string;
  talents: OpsMatchingTalentItem[];
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-neutral-1000-a05 bg-bg-floating">
      <table className="w-full min-w-[1320px] table-fixed border-collapse text-left text-xs">
        <thead className="bg-bg-weak text-neutral-muted">
          <tr>
            <th className="w-[250px] px-3 py-2 font-medium">Talent</th>
            <th className="w-[240px] px-3 py-2 font-medium">최근 회사</th>
            <th className="w-[240px] px-3 py-2 font-medium">최근 학교</th>
            <th className="w-[220px] px-3 py-2 font-medium">설명</th>
            <th className="w-[260px] px-3 py-2 font-medium">메모</th>
            <th className="w-[260px] px-3 py-2 font-medium">태그</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-1000-a05">
          {talents.map((talent) => (
            <tr
              key={talent.userId}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(talent)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(talent);
                }
              }}
              className="cursor-pointer align-top text-neutral-muted transition hover:bg-bg-default"
            >
              <td className="px-3 py-3 align-top">
                <TalentIdentity talent={talent} />
                <TalentStatusBadges talent={talent} />
                <div className="mt-1 text-[11px] text-neutral-soft">
                  가입 {formatKstRelativeDate(talent.createdAt)}
                </div>
              </td>
              <td className="px-3 py-3 align-top">
                <ProfileLabelCell
                  emptyLabel="회사 없음"
                  labels={talent.recentCompanies}
                />
              </td>
              <td className="px-3 py-3 align-top">
                <ProfileLabelCell
                  emptyLabel="학교 없음"
                  labels={talent.recentSchools}
                />
              </td>
              <td className="px-3 py-3 align-top text-sm text-neutral-soft">
                {talent.description ?? ""}
              </td>
              <td className="px-3 py-3 align-top">
                <MatchingMemoQuickAdd
                  memoPreview={talent.memoPreview}
                  talentId={talent.userId}
                />
              </td>
              <td className="px-3 py-3 align-top">
                <MatchingTagEditor roleId={roleId} talent={talent} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchingTalentCards({
  onSelect,
  roleId,
  talents,
}: {
  onSelect: (talent: OpsMatchingTalentItem) => void;
  roleId: string;
  talents: OpsMatchingTalentItem[];
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {talents.map((talent) => (
        <div
          key={talent.userId}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(talent)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(talent);
            }
          }}
          className={cx(
            opsTheme.panel,
            "cursor-pointer border border-neutral-1000-a05 p-4 transition hover:bg-bg-default"
          )}
        >
          <TalentIdentity talent={talent} />
          <div className="mt-4 space-y-3">
            <div>
              <div className={opsTheme.eyebrow}>최근 회사</div>
              <ProfileLabelCell
                emptyLabel="회사 없음"
                labels={talent.recentCompanies}
              />
            </div>
            <div>
              <div className={opsTheme.eyebrow}>최근 학교</div>
              <ProfileLabelCell
                emptyLabel="학교 없음"
                labels={talent.recentSchools}
              />
            </div>
            <div>
              <div className={opsTheme.eyebrow}>메모</div>
              <MatchingMemoQuickAdd
                memoPreview={talent.memoPreview}
                talentId={talent.userId}
              />
            </div>
            <div>
              <div className={opsTheme.eyebrow}>태그</div>
              <MatchingTagEditor roleId={roleId} talent={talent} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MatchingTalentBrowser({
  canFetchInternal,
  createdFrom,
  createdTo,
  onCreatedDateRangeChange,
  onTagFiltersChange,
  role,
  tagFilters,
}: MatchingTalentBrowserProps) {
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedTalent, setSelectedTalent] =
    useState<OpsMatchingTalentItem | null>(null);
  const hasCreatedDateFilter = Boolean(createdFrom || createdTo);
  const talentsQuery = useOpsMatchingTalents({
    createdFrom,
    createdTo,
    enabled: canFetchInternal,
    limit: 20,
    query: searchQuery,
    roleId: role.roleId,
    tags: tagFilters,
  });
  const talents = useMemo(
    () => talentsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [talentsQuery.data?.pages]
  );
  const totalCount = talentsQuery.data?.pages[0]?.totalCount ?? null;
  const hasActiveFilters = Boolean(
    searchQuery || createdFrom || createdTo || tagFilters.length > 0
  );
  return (
    <section className="space-y-4">
      <div className="rounded-md space-y-2">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-row gap-3">
            <div className="relative w-full flex items-center">
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
                className={cx(opsTheme.input, "pl-9 w-[640px]")}
                placeholder="이름/이메일 검색"
              />
            </div>
            <MatchingDateRangeFilter
              emptyLabel="가입일 전체"
              from={createdFrom}
              onChange={onCreatedDateRangeChange}
              prefix="가입"
              to={createdTo}
            />
            <MatchingTagFilter
              selectedTags={tagFilters}
              onChange={onTagFiltersChange}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BareButton
              type="button"
              onClick={() => {
                setSearchQuery(searchDraft.trim());
              }}
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
                  onCreatedDateRangeChange("", "");
                  onTagFiltersChange([]);
                }}
                className={cx(opsTheme.buttonSecondary, "h-10 px-3 text-xs")}
              >
                초기화
              </BareButton>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-neutral-muted">
            <span>
              {totalCount === null
                ? "Talent 목록"
                : `${totalCount.toLocaleString("ko-KR")}명`}
            </span>
            <MatchingFilterTagChips tags={tagFilters} />
          </div>
          <div className="flex h-10 w-fit rounded-md border border-neutral-1000-a05 bg-bg-default/65 p-1">
            {[
              { icon: Table2, id: "table" as const, label: "Table" },
              { icon: Columns3, id: "card" as const, label: "Card" },
            ].map((option) => {
              const Icon = option.icon;
              return (
                <BareButton
                  key={option.id}
                  type="button"
                  onClick={() => setViewMode(option.id)}
                  className={cx(
                    "inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition",
                    viewMode === option.id
                      ? "bg-black text-neutral-00"
                      : "text-neutral-muted hover:bg-bg-default hover:text-neutral-primary"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {option.label}
                </BareButton>
              );
            })}
          </div>
        </div>
      </div>

      {talentsQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
        </div>
      ) : talentsQuery.error ? (
        <div className={opsTheme.errorNotice}>
          {talentsQuery.error instanceof Error
            ? talentsQuery.error.message
            : "Talent 목록을 불러오지 못했습니다."}
        </div>
      ) : talents.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-10 text-center text-sm text-neutral-soft">
          조건에 맞는 talent가 없습니다.
        </div>
      ) : viewMode === "table" ? (
        <MatchingTalentTable
          roleId={role.roleId}
          talents={talents}
          onSelect={setSelectedTalent}
        />
      ) : (
        <MatchingTalentCards
          roleId={role.roleId}
          talents={talents}
          onSelect={setSelectedTalent}
        />
      )}

      {talentsQuery.hasNextPage ? (
        <div className="flex justify-center">
          <BareButton
            type="button"
            onClick={() => void talentsQuery.fetchNextPage()}
            disabled={talentsQuery.isFetchingNextPage}
            className={cx(opsTheme.buttonSecondary, "h-10 px-4 text-xs")}
          >
            {talentsQuery.isFetchingNextPage ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            20명 더 보기
          </BareButton>
        </div>
      ) : null}

      <MatchingTalentDrawer
        role={role}
        talent={selectedTalent}
        onClose={() => setSelectedTalent(null)}
      />
    </section>
  );
}
