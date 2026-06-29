import { useMemo, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
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
import { useOpsMatchingTalentPool } from "@/hooks/ops/useOpsMatching";
import type {
  OpsMatchingTalentItem,
  OpsMatchingTalentPoolTabId,
} from "@/lib/ops/matching";

type MatchingTalentPoolProps = {
  canFetchInternal: boolean;
};

const TALENT_POOL_TABS = [
  { count: null, id: "tailored", label: "Tailored" },
  { count: null, id: "all", label: "All" },
] as const satisfies readonly {
  count: number | null;
  id: OpsMatchingTalentPoolTabId;
  label: string;
}[];

function TalentPoolTable({
  onSelect,
  talents,
}: {
  onSelect: (talent: OpsMatchingTalentItem) => void;
  talents: OpsMatchingTalentItem[];
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-neutral-1000-a05 bg-bg-floating">
      <table className="w-full min-w-[1320px] table-fixed border-collapse text-left text-xs">
        <thead className="bg-bg-weak text-neutral-muted">
          <tr>
            <th className="w-[250px] px-3 py-2 font-medium">Talent</th>
            <th className="w-[230px] px-3 py-2 font-medium">최근 회사</th>
            <th className="w-[230px] px-3 py-2 font-medium">최근 학교</th>
            <th className="w-[240px] px-3 py-2 font-medium">Profile</th>
            <th className="w-[260px] px-3 py-2 font-medium">메모</th>
            <th className="w-[260px] px-3 py-2 font-medium">Talent 태그</th>
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
              <td className="px-3 py-3 align-top text-xs leading-5 text-neutral-muted">
                <div className="line-clamp-3">
                  {talent.headline || talent.description || "-"}
                </div>
              </td>
              <td className="px-3 py-3 align-top">
                <MatchingMemoQuickAdd
                  memoPreview={talent.memoPreview}
                  talentId={talent.userId}
                />
              </td>
              <td className="px-3 py-3 align-top">
                <MatchingTagEditor roleId={null} talent={talent} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TalentPoolListView({
  canFetchInternal,
  tab,
}: {
  canFetchInternal: boolean;
  tab: OpsMatchingTalentPoolTabId;
}) {
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTalent, setSelectedTalent] =
    useState<OpsMatchingTalentItem | null>(null);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const talentsQuery = useOpsMatchingTalentPool({
    createdFrom,
    createdTo,
    enabled: canFetchInternal,
    limit: 20,
    query: searchQuery,
    tab,
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

  const handleCreatedDateRangeChange = (from: string, to: string) => {
    setCreatedFrom(from);
    setCreatedTo(to);
  };

  return (
    <section className="space-y-4">
      <div className="rounded-md space-y-2">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-row gap-3">
            <div className="relative flex w-full items-center">
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
                className={cx(opsTheme.input, "w-[640px] pl-9")}
                placeholder="이름/이메일 검색"
              />
            </div>
            <MatchingDateRangeFilter
              emptyLabel="가입일 전체"
              from={createdFrom}
              onChange={handleCreatedDateRangeChange}
              prefix="가입"
              to={createdTo}
            />
            <MatchingTagFilter
              selectedTags={tagFilters}
              onChange={setTagFilters}
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
                  setCreatedFrom("");
                  setCreatedTo("");
                  setSearchDraft("");
                  setSearchQuery("");
                  setTagFilters([]);
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
              ? "Talent Pool"
              : `${totalCount.toLocaleString("ko-KR")}명`}
          </span>
          <MatchingFilterTagChips tags={tagFilters} />
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
            : "Talent Pool을 불러오지 못했습니다."}
        </div>
      ) : talents.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-10 text-center text-sm text-neutral-soft">
          조건에 맞는 talent가 없습니다.
        </div>
      ) : (
        <TalentPoolTable talents={talents} onSelect={setSelectedTalent} />
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
        talent={selectedTalent}
        onClose={() => setSelectedTalent(null)}
      />
    </section>
  );
}

export function MatchingTalentPool({
  canFetchInternal,
}: MatchingTalentPoolProps) {
  const [activeTab, setActiveTab] =
    useState<OpsMatchingTalentPoolTabId>("tailored");

  return (
    <section className="space-y-4">
      <section className="flex flex-row gap-2">
        {TALENT_POOL_TABS.map((tab) => (
          <BareButton
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cx(
              "flex min-h-16 min-w-48 items-center justify-between rounded-md border-2 px-4 py-3 text-left",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-neutral-1000-a05 bg-bg-floating text-neutral-muted hover:border-primary hover:text-primary"
            )}
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{tab.label}</span>
              {tab.count !== null ? (
                <span className="text-xs">{tab.count} talents</span>
              ) : null}
            </div>
          </BareButton>
        ))}
      </section>

      <TalentPoolListView canFetchInternal={canFetchInternal} tab={activeTab} />
    </section>
  );
}
