import OpsShell from "@/components/ops/OpsShell";
import { TalentDetail } from "@/components/ops/career/TalentDetail";
import { TalentListItem } from "@/components/ops/career/TalentListItem";
import {
  formatDateRangeButtonLabel,
  toDateOnly,
} from "@/components/ops/career/utils";
import { cx, opsTheme } from "@/components/ops/theme";
import { Calendar } from "@/components/ui/calendar";
import { useOpsCareerTalents } from "@/hooks/useOpsCareer";
import { isInternalEmail } from "@/lib/internalAccess";
import {
  isEmailExcludedByOpsInternalTerms,
  useOpsInternalDataExclusionStore,
} from "@/store/useOpsInternalDataExclusionStore";
import { useAuthStore } from "@/store/useAuthStore";
import {
  CalendarDays,
  ChevronDown,
  LoaderCircle,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Search,
} from "lucide-react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";

const FETCH_LIMIT = 40;

const readQueryValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
};

export default function OpsCareerPage() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuthStore();
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearchQuery = searchQuery.trim();
  const [createdDateRange, setCreatedDateRange] = useState<
    DateRange | undefined
  >();
  const [isCreatedDateOpen, setIsCreatedDateOpen] = useState(false);
  const [isListExpanded, setIsListExpanded] = useState(false);
  const [onboardingDoneOnly, setOnboardingDoneOnly] = useState(false);
  const [submittedMaterialOnly, setSubmittedMaterialOnly] = useState(false);
  const createdDateFilterRef = useRef<HTMLDivElement>(null);
  const createdFrom = toDateOnly(createdDateRange?.from);
  const createdTo = toDateOnly(createdDateRange?.to ?? createdDateRange?.from);
  const hasCreatedDateFilter = Boolean(createdFrom || createdTo);
  const createdDateLabel = formatDateRangeButtonLabel(createdDateRange);
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useOpsCareerTalents(
    FETCH_LIMIT,
    canFetchInternal,
    normalizedSearchQuery,
    {
      createdFrom,
      createdTo,
      includeExpandedProfile: isListExpanded,
      onboardingDoneOnly,
      submittedMaterialOnly,
    }
  );
  const emailExclusionTerms = useOpsInternalDataExclusionStore(
    (state) => state.emailExclusionTerms
  );

  const selectedUserId = useMemo(() => {
    if (!router.isReady) return null;
    return readQueryValue(router.query.userId).trim() || null;
  }, [router.isReady, router.query.userId]);

  const applySearchQuery = useCallback(() => {
    setSearchQuery(searchInput.trim());
  }, [searchInput]);

  useEffect(() => {
    if (!isCreatedDateOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!createdDateFilterRef.current?.contains(target)) {
        setIsCreatedDateOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isCreatedDateOpen]);

  const selectTalent = useCallback(
    (userId: string) => {
      const nextUserId = userId.trim();
      if (!nextUserId) return;

      void router.push(
        {
          pathname: router.pathname,
          query: {
            ...router.query,
            userId: nextUserId,
          },
        },
        undefined,
        { shallow: true }
      );
    },
    [router]
  );

  const allTalents = useMemo(
    () => data?.pages.flatMap((page) => page.talents) ?? [],
    [data]
  );

  const visibleTalents = useMemo(
    () =>
      allTalents.filter(
        (talent) =>
          !isEmailExcludedByOpsInternalTerms(talent.email, emailExclusionTerms)
      ),
    [allTalents, emailExclusionTerms]
  );

  const hiddenByInternalDataExclusionCount =
    allTalents.length - visibleTalents.length;
  const hasActiveListFilter = Boolean(
    normalizedSearchQuery ||
    hasCreatedDateFilter ||
    onboardingDoneOnly ||
    submittedMaterialOnly
  );
  const filterButtonClass = (active: boolean) =>
    cx(
      "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 font-geist text-[12px] font-medium transition",
      active
        ? "border-[#90a88f]/55 bg-[#e4eee4] text-[#2f553d] hover:bg-[#dbe8db]"
        : "border-beige900/10 bg-white/70 text-beige900/75 hover:border-beige900/18 hover:bg-white"
    );
  const emptyTalentMessage = hasActiveListFilter
    ? "검색 결과가 없습니다."
    : hiddenByInternalDataExclusionCount > 0
      ? "내부 데이터 제외 설정으로 숨겨진 talent만 있습니다."
      : "등록된 talent가 없습니다.";

  const totalCount = data?.pages[0]?.totalCount ?? 0;

  return (
    <>
      <Head>
        <title>Career Talents | Harper Ops</title>
      </Head>

      <OpsShell>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div ref={createdDateFilterRef} className="relative">
            <button
              type="button"
              onClick={() => setIsCreatedDateOpen((open) => !open)}
              className={filterButtonClass(hasCreatedDateFilter)}
            >
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              <span>{createdDateLabel}</span>
              <ChevronDown
                className={cx(
                  "h-3.5 w-3.5 transition",
                  isCreatedDateOpen ? "rotate-180" : ""
                )}
                aria-hidden
              />
            </button>

            {isCreatedDateOpen ? (
              <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[300px] rounded-md border border-beige900/12 bg-[#fbfaf7] p-2 shadow-[0_18px_48px_rgba(37,28,21,0.16)]">
                <Calendar
                  mode="range"
                  selected={createdDateRange}
                  onSelect={setCreatedDateRange}
                  numberOfMonths={1}
                  disabled={{ after: new Date() }}
                  className="p-2 text-[12px] [--cell-size:1.85rem]"
                />
                <div className="mt-1 flex items-center justify-end gap-2 border-t border-beige900/10 pt-2">
                  <button
                    type="button"
                    onClick={() => setCreatedDateRange(undefined)}
                    disabled={!hasCreatedDateFilter}
                    className="h-7 rounded-md px-2 font-geist text-[11px] font-medium text-beige900/45 transition hover:bg-beige900/5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    초기화
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreatedDateOpen(false)}
                    className="h-7 rounded-md bg-beige900 px-2.5 font-geist text-[11px] font-medium text-white transition hover:bg-beige900/88"
                  >
                    닫기
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setOnboardingDoneOnly((value) => !value)}
            className={filterButtonClass(onboardingDoneOnly)}
          >
            온보딩 완료한 사람만 보기
          </button>
          <button
            type="button"
            onClick={() => setSubmittedMaterialOnly((value) => !value)}
            className={filterButtonClass(submittedMaterialOnly)}
          >
            LinkedIn/이력서 제출한 사람만 보기
          </button>
        </div>
        <div
          className={cx(
            "grid grid-cols-1 gap-6",
            isListExpanded
              ? "lg:grid-cols-[minmax(460px,40%)_1fr]"
              : "lg:grid-cols-[380px_1fr]"
          )}
        >
          {/* Left: List */}
          <div className={cx(opsTheme.panel, "overflow-hidden")}>
            <div className="">
              <div className="flex items-center gap-2 flex-row p-3 border-b border-beige900/10 w-full">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/30" />
                  <input
                    type="text"
                    placeholder="이름, 이메일, 회사, role 검색..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        applySearchQuery();
                      }
                    }}
                    className={cx(opsTheme.input, "h-9 pl-9 pr-10")}
                  />
                </div>
                {hiddenByInternalDataExclusionCount > 0 ? (
                  <div className="mt-2 font-geist text-[11px] text-beige900/35">
                    내부 데이터 제외 설정으로 현재 불러온 목록에서{" "}
                    {hiddenByInternalDataExclusionCount}명을 숨겼습니다.
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setIsListExpanded((value) => !value)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-black hover:bg-black/5"
                  aria-label={isListExpanded ? "목록 축소" : "목록 확장"}
                  title={isListExpanded ? "목록 축소" : "목록 확장"}
                >
                  {isListExpanded ? (
                    <Minimize2 className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[calc(100vh-250px)] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <LoaderCircle className="h-5 w-5 animate-spin text-beige900/30" />
                </div>
              ) : error ? (
                <div className={cx(opsTheme.errorNotice, "m-4")}>
                  {error instanceof Error
                    ? error.message
                    : "데이터를 불러오지 못했습니다."}
                </div>
              ) : visibleTalents.length === 0 ? (
                <div className="px-4 py-12 text-center font-geist text-sm text-beige900/40">
                  {emptyTalentMessage}
                </div>
              ) : (
                <>
                  {visibleTalents.map((talent) => (
                    <TalentListItem
                      key={talent.userId}
                      talent={talent}
                      expanded={isListExpanded}
                      isActive={selectedUserId === talent.userId}
                      onSelect={selectTalent}
                    />
                  ))}
                  {hasNextPage && (
                    <div className="p-3">
                      <button
                        type="button"
                        onClick={() => void fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className={cx(
                          opsTheme.buttonSecondary,
                          "w-full h-9 text-xs"
                        )}
                      >
                        {isFetchingNextPage ? "불러오는 중..." : "더 보기"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right: Detail */}
          <div className={cx(opsTheme.panel, "overflow-hidden")}>
            {selectedUserId ? (
              <TalentDetail userId={selectedUserId} />
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <MessageSquareText className="h-10 w-10 text-beige900/15" />
                <div className="mt-4 font-geist text-sm text-beige900/40">
                  왼쪽에서 talent를 선택하세요
                </div>
              </div>
            )}
          </div>
        </div>
      </OpsShell>
    </>
  );
}
