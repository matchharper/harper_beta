import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import {
  ChevronRight,
  LoaderCircle,
  Search,
  Tag,
  UserRound,
} from "lucide-react";
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
import {
  getMatchingTagLabel,
  MATCHING_TAG_OPTIONS,
} from "@/components/ops/matching/tagMeta";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import {
  useOpsCareerInsights,
  useOpsCareerProfile,
} from "@/hooks/ops/useOpsCareer";
import { useMatchingTalentPoolHotkeys } from "@/hooks/ops/useMatchingTalentPoolHotkeys";
import {
  useAddOpsMatchingTalentTag,
  useOpsMatchingTalentPool,
} from "@/hooks/ops/useOpsMatching";
import type {
  OpsMatchingTalentItem,
  OpsMatchingTalentPoolTabId,
} from "@/lib/ops/matching";

type MatchingTalentPoolProps = {
  canFetchInternal: boolean;
};

type TalentPoolListTabId = Exclude<OpsMatchingTalentPoolTabId, "needs_review">;

type ProfileExperiencePreview = {
  company_name?: string | null;
  description?: string | null;
  end_date?: string | null;
  role?: string | null;
  start_date?: string | null;
};

type ProfileEducationPreview = {
  degree?: string | null;
  field?: string | null;
  school?: string | null;
};

const TALENT_POOL_TABS = [
  { count: null, id: "tailored", label: "Tailored" },
  { count: null, id: "all", label: "All" },
  { count: null, id: "needs_review", label: "Needs Review" },
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
  tab: TalentPoolListTabId;
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

function TalentPoolInsightPanel({ userId }: { userId: string }) {
  const insightsQuery = useOpsCareerInsights(userId);
  const insightEntries = useMemo(() => {
    const insights = insightsQuery.data?.insights ?? {};
    const checklist = insightsQuery.data?.mergedChecklist ?? [];
    return checklist
      .map((item) => ({
        label: item.label,
        value: insights[item.key]?.trim() ?? "",
      }))
      .filter((item) => item.value)
      .slice(0, 8);
  }, [insightsQuery.data?.insights, insightsQuery.data?.mergedChecklist]);

  if (insightsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-14">
        <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
      </div>
    );
  }
  if (insightsQuery.error) {
    return (
      <div className={opsTheme.errorNotice}>
        인사이트를 불러오지 못했습니다.
      </div>
    );
  }
  if (insightEntries.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-neutral-1000-a10 px-4 py-10 text-center text-sm text-neutral-soft">
        채워진 insight가 없습니다.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {insightEntries.map((item) => (
        <div
          key={item.label}
          className="rounded-md border border-neutral-1000-a05 bg-bg-default/55 px-3 py-2.5"
        >
          <div className={opsTheme.eyebrow}>{item.label}</div>
          <div className="mt-1 line-clamp-4 text-sm leading-6 text-neutral-primary">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function TalentPoolProfilePanel({ userId }: { userId: string }) {
  const profileQuery = useOpsCareerProfile(userId);
  const experiences =
    (profileQuery.data?.structuredProfile?.experiences as
      | ProfileExperiencePreview[]
      | undefined) ?? [];
  const educations =
    (profileQuery.data?.structuredProfile?.educations as
      | ProfileEducationPreview[]
      | undefined) ?? [];

  if (profileQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-14">
        <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
      </div>
    );
  }
  if (profileQuery.error || !profileQuery.data) {
    return (
      <div className={opsTheme.errorNotice}>프로필을 불러오지 못했습니다.</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-neutral-1000-a05 bg-bg-default/55 px-3 py-2.5">
          <div className={opsTheme.eyebrow}>Location</div>
          <div className="mt-1 text-sm text-neutral-primary">
            {profileQuery.data.location || "-"}
          </div>
        </div>
        <div className="rounded-md border border-neutral-1000-a05 bg-bg-default/55 px-3 py-2.5">
          <div className={opsTheme.eyebrow}>Links</div>
          <div className="mt-1 truncate text-sm text-neutral-primary">
            {profileQuery.data.registeredLinks.length.toLocaleString("ko-KR")}개
          </div>
        </div>
      </div>
      {profileQuery.data.bio ? (
        <div className="rounded-md border border-neutral-1000-a05 bg-bg-default/55 px-3 py-2.5">
          <div className={opsTheme.eyebrow}>Bio</div>
          <div className="mt-1 line-clamp-5 text-sm leading-6 text-neutral-primary">
            {profileQuery.data.bio}
          </div>
        </div>
      ) : null}
      <div className="rounded-md border border-neutral-1000-a05 bg-bg-default/55 px-3 py-2.5">
        <div className={opsTheme.eyebrow}>Experience</div>
        <div className="mt-2 space-y-2">
          {experiences.slice(0, 4).map((experience, index) => (
            <div key={`${experience.company_name ?? "company"}-${index}`}>
              <div className="truncate text-sm font-medium text-neutral-primary">
                {experience.company_name || experience.role || "회사 없음"}
              </div>
              <div className="truncate text-xs text-neutral-muted">
                {[experience.role, experience.start_date, experience.end_date]
                  .filter(Boolean)
                  .join(" · ") || "-"}
              </div>
            </div>
          ))}
          {experiences.length === 0 ? (
            <div className="text-sm text-neutral-soft">경력 정보 없음</div>
          ) : null}
        </div>
      </div>
      <div className="rounded-md border border-neutral-1000-a05 bg-bg-default/55 px-3 py-2.5">
        <div className={opsTheme.eyebrow}>Education</div>
        <div className="mt-2 space-y-2">
          {educations.slice(0, 3).map((education, index) => (
            <div key={`${education.school ?? "school"}-${index}`}>
              <div className="truncate text-sm font-medium text-neutral-primary">
                {education.school || "학교 없음"}
              </div>
              <div className="truncate text-xs text-neutral-muted">
                {[education.degree, education.field]
                  .filter(Boolean)
                  .join(" · ") || "-"}
              </div>
            </div>
          ))}
          {educations.length === 0 ? (
            <div className="text-sm text-neutral-soft">학력 정보 없음</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TalentPoolNeedsReview({
  canFetchInternal,
}: {
  canFetchInternal: boolean;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedTalentIds, setReviewedTalentIds] = useState<Set<string>>(
    () => new Set()
  );
  const addTag = useAddOpsMatchingTalentTag();
  const talentsQuery = useOpsMatchingTalentPool({
    enabled: canFetchInternal,
    limit: 25,
    tab: "needs_review",
  });
  const talents = useMemo(() => {
    const items = talentsQuery.data?.pages.flatMap((page) => page.items) ?? [];
    if (reviewedTalentIds.size === 0) return items;
    return items.filter((talent) => !reviewedTalentIds.has(talent.userId));
  }, [reviewedTalentIds, talentsQuery.data?.pages]);
  const currentTalent = talents[currentIndex] ?? null;
  const totalCount = talentsQuery.data?.pages[0]?.totalCount ?? null;
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = talentsQuery;
  const needsMorePage = currentIndex >= talents.length && hasNextPage;

  const moveNext = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= talents.length - 3 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
    setCurrentIndex(nextIndex);
  }, [
    currentIndex,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    talents.length,
  ]);

  const handleQuickTag = useCallback(
    (index: number) => {
      const option = MATCHING_TAG_OPTIONS[index];
      if (!option || !currentTalent || addTag.isPending) return;
      addTag.mutate(
        {
          roleId: null,
          tag: option.value,
          talentId: currentTalent.userId,
        },
        {
          onSuccess: () => {
            if (
              currentIndex >= talents.length - 3 &&
              hasNextPage &&
              !isFetchingNextPage
            ) {
              void fetchNextPage();
            }
            setReviewedTalentIds((previous) => {
              const next = new Set(previous);
              next.add(currentTalent.userId);
              return next;
            });
          },
        }
      );
    },
    [
      addTag,
      currentIndex,
      currentTalent,
      fetchNextPage,
      hasNextPage,
      isFetchingNextPage,
      talents.length,
    ]
  );

  useMatchingTalentPoolHotkeys({
    enabled: Boolean(currentTalent) && !addTag.isPending,
    onTagIndex: handleQuickTag,
  });

  if (talentsQuery.isLoading) {
    return (
      <div className="flex min-h-[520px] items-center justify-center">
        <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
      </div>
    );
  }
  if (talentsQuery.error) {
    return (
      <div className={opsTheme.errorNotice}>
        {talentsQuery.error instanceof Error
          ? talentsQuery.error.message
          : "Needs Review 목록을 불러오지 못했습니다."}
      </div>
    );
  }
  if (needsMorePage || isFetchingNextPage) {
    return (
      <div className="flex min-h-[520px] items-center justify-center rounded-md border border-neutral-1000-a05 bg-bg-floating">
        <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
      </div>
    );
  }
  if (!currentTalent) {
    return (
      <div className="flex min-h-[520px] flex-col items-center justify-center rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 text-center">
        <Tag className="h-8 w-8 text-neutral-soft" />
        <div className="mt-3 text-sm font-medium text-neutral-primary">
          리뷰할 talent가 없습니다.
        </div>
        <div className="mt-1 text-sm text-neutral-muted">
          talent-level 태그가 없는 사람을 모두 확인했습니다.
        </div>
      </div>
    );
  }

  const displayName =
    currentTalent.name || currentTalent.email || "이름 없는 Talent";

  return (
    <section className="min-h-[calc(100vh-280px)] rounded-md border border-neutral-1000-a05 bg-bg-floating">
      <div className="flex flex-col gap-3 border-b border-neutral-1000-a05 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-neutral-soft">
            <span>Needs Review</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span>
              {totalCount === null
                ? `${currentIndex + 1}번째`
                : `${currentIndex + 1} / ${totalCount.toLocaleString("ko-KR")}`}
            </span>
          </div>
          <div className="mt-1 truncate text-lg font-semibold text-neutral-primary">
            {displayName}
          </div>
          <div className="mt-0.5 truncate text-sm text-neutral-muted">
            {currentTalent.email ?? currentTalent.headline ?? "-"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {MATCHING_TAG_OPTIONS.map((option, index) => (
            <BareButton
              key={option.value}
              type="button"
              onClick={() => handleQuickTag(index)}
              disabled={addTag.isPending}
              className={cx(
                "inline-flex h-9 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition",
                option.badgeClassName,
                addTag.isPending && "cursor-not-allowed opacity-60"
              )}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/75 text-[11px] text-neutral-primary">
                {index + 1}
              </span>
              <span>{getMatchingTagLabel(option.value)}</span>
            </BareButton>
          ))}
          <BareButton
            type="button"
            onClick={moveNext}
            className={cx(opsTheme.buttonSecondary, "h-9 px-3 text-xs")}
          >
            넘기기
          </BareButton>
        </div>
      </div>

      <div className="grid min-h-0 gap-0 lg:grid-cols-[360px_minmax(0,1fr)_minmax(360px,0.95fr)]">
        <aside className="border-b border-neutral-1000-a05 p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-start gap-3">
            {currentTalent.profilePicture ? (
              <Image
                src={currentTalent.profilePicture}
                alt=""
                width={56}
                height={56}
                unoptimized
                className="h-14 w-14 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-weak">
                <UserRound className="h-6 w-6 text-neutral-soft" />
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-neutral-primary">
                {displayName}
              </div>
              <div className="mt-1 text-xs text-neutral-muted">
                가입 {formatKstRelativeDate(currentTalent.createdAt)}
              </div>
              <TalentStatusBadges talent={currentTalent} />
            </div>
          </div>
          {currentTalent.headline ? (
            <div className="mt-4 text-sm leading-6 text-neutral-muted">
              {currentTalent.headline}
            </div>
          ) : null}
          <div className="mt-5 space-y-4">
            <div>
              <div className={opsTheme.eyebrow}>최근 회사</div>
              <div className="mt-1">
                <ProfileLabelCell
                  emptyLabel="회사 없음"
                  labels={currentTalent.recentCompanies}
                />
              </div>
            </div>
            <div>
              <div className={opsTheme.eyebrow}>최근 학교</div>
              <div className="mt-1">
                <ProfileLabelCell
                  emptyLabel="학교 없음"
                  labels={currentTalent.recentSchools}
                />
              </div>
            </div>
            <div>
              <div className={opsTheme.eyebrow}>메모</div>
              <div className="mt-1">
                <MatchingMemoQuickAdd
                  compact
                  memoPreview={currentTalent.memoPreview}
                  talentId={currentTalent.userId}
                />
              </div>
            </div>
            <div>
              <div className={opsTheme.eyebrow}>Talent 태그</div>
              <div className="mt-1">
                <MatchingTagEditor
                  compact
                  roleId={null}
                  talent={currentTalent}
                />
              </div>
            </div>
          </div>
        </aside>

        <div className="border-b border-neutral-1000-a05 p-5 lg:border-b-0 lg:border-r">
          <div className="mb-3 text-sm font-semibold text-neutral-primary">
            Insight
          </div>
          <TalentPoolInsightPanel userId={currentTalent.userId} />
        </div>

        <div className="p-5">
          <div className="mb-3 text-sm font-semibold text-neutral-primary">
            Profile
          </div>
          <TalentPoolProfilePanel userId={currentTalent.userId} />
        </div>
      </div>
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

      {activeTab === "needs_review" ? (
        <TalentPoolNeedsReview canFetchInternal={canFetchInternal} />
      ) : (
        <TalentPoolListView
          canFetchInternal={canFetchInternal}
          tab={activeTab}
        />
      )}
    </section>
  );
}
