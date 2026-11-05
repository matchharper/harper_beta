import { useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronRight,
  History,
  Loader2,
  X,
} from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { BareButton, MuteButton } from "@/components/ui/button";
import { AppleSwitch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";
import OpportunityResultRow from "./OpportunityResultRow";
import NewOpportunityCard, {
  type NewOpportunityCardActions,
} from "./NewOpportunityCard";
import type { CareerHistoryOpportunity } from "../types";
import { useCareerHistoryContext } from "../CareerSidebarContext";
import { useMessages } from "@/i18n/useMessage";
import { useCareerMessageFormatter } from "@/i18n/useCareerMessageFormatter";
import { CAREER_HOOK_MESSAGES } from "@/hooks/career/careerHookMessages";
import { assignHistoryFeedbackVariant } from "@/lib/career/historyFeedbackExperiment";
import { getPostingRoleIdFromOpportunityId } from "@/lib/career/postingLinks";

import type {
  CareerMatchingListPage,
  CareerMatchingResultsPage,
  CareerMatchingSummary,
} from "@/lib/career/matching/listTypes";

const sidePanel =
  "career-side-panel rounded-modal border-0 shadow-(--shadow-modal) data-[state=open]:slide-in-from-right-4 data-[state=closed]:slide-out-to-right-4 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 motion-reduce:animate-none";

function LoadingRows() {
  return (
    <div className="space-y-6 py-4" aria-busy="true">
      {[0, 1, 2, 3].map((key) => (
        <div className="space-y-2" key={key}>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

type MatchingActions = Omit<
  NewOpportunityCardActions,
  "onToggleOpportunity"
> & {
  pendingOpportunityIds?: ReadonlySet<string>;
};

function MatchingPanels({
  userId,
  onClose,
  onApply,
  onNegative,
  onPositive,
  onKeep,
  onOpenCompanyInfo,
  onOpenLink,
  pendingOpportunityIds,
}: MatchingActions & {
  userId: string;
  onClose: () => void;
}) {
  const t = useCareerT();
  const { fetchWithAuth } = useCareerApi();
  const { locale } = useMessages();
  const formatMessage = useCareerMessageFormatter();
  const queryClient = useQueryClient();
  const { onLoadHistoryOpportunityByRoleId, historyUpdateError } =
    useCareerHistoryContext();
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [preparingRoleId, setPreparingRoleId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const preparingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const feedbackVariant = assignHistoryFeedbackVariant(userId);
  // Undefined uses the newest matching; null explicitly returns to the list.
  const [excludeRecommended, setExcludeRecommended] = useState(true);
  const [selection, setSelected] = useState<CareerMatchingSummary | null>();
  const request = async <T,>(
    params: URLSearchParams,
    signal: AbortSignal
  ): Promise<T> => {
    params.set("locale", locale);
    const response = await fetchWithAuth(`/api/talent/matchings?${params}`, {
      signal,
    });
    if (!response.ok) throw new Error("Matching request failed");
    return response.json();
  };
  const matchings = useInfiniteQuery({
    queryKey: ["career-matchings", userId, locale],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      request<CareerMatchingListPage>(
        new URLSearchParams(pageParam ? { cursor: pageParam } : {}),
        signal
      ),
    getNextPageParam: (page) => page.nextCursor,
  });
  const rows = matchings.data?.pages.flatMap((page) => page.matchings) ?? [];
  const selected = selection === undefined ? (rows[0] ?? null) : selection;
  const results = useInfiniteQuery({
    queryKey: [
      "career-matching-results",
      userId,
      selected?.id,
      excludeRecommended,
      locale,
    ],
    enabled: Boolean(selected),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      request<CareerMatchingResultsPage>(
        new URLSearchParams({
          matchingId: selected!.id,
          excludeRecommended: String(excludeRecommended),
          ...(pageParam ? { cursor: pageParam } : {}),
        }),
        signal
      ),
    getNextPageParam: (page) => page.nextCursor,
  });
  const opportunities =
    results.data?.pages
      .flatMap((page) => page.opportunities)
      .filter((item) => !excludeRecommended || !item.isRecommended) ?? [];

  const runAction = async (
    item: CareerHistoryOpportunity,
    action: NewOpportunityCardActions["onApply"]
  ) => {
    if (preparingRef.current) return;
    preparingRef.current = true;
    setPreparingRoleId(item.roleId);
    setActionError(null);
    try {
      if (getPostingRoleIdFromOpportunityId(item.id)) {
        // The existing posting interaction saves the recommendation before recording the view.
        const response = await fetchWithAuth("/api/talent/opportunities", {
          method: "PATCH",
          body: JSON.stringify({
            action: "view",
            opportunityId: item.id,
            locale,
          }),
        });
        if (!response.ok)
          throw new Error("Unable to save posting recommendation");
      }
      // Hydrate the shared history so its feedback dialogs and mutations use the saved ID.
      const saved = await onLoadHistoryOpportunityByRoleId(item.roleId);
      if (!saved || getPostingRoleIdFromOpportunityId(saved.id))
        throw new Error("Saved recommendation unavailable");
      if (!mounted.current) return;
      queryClient.setQueriesData<InfiniteData<CareerMatchingResultsPage>>(
        { queryKey: ["career-matching-results", userId] },
        (current) =>
          current
            ? {
                ...current,
                pages: current.pages.map((page) => ({
                  ...page,
                  opportunities: page.opportunities.map((entry) =>
                    entry.roleId === saved.roleId
                      ? { ...entry, opportunity: saved, isRecommended: true }
                      : entry
                  ),
                })),
              }
            : current
      );
      if ((await action(saved)) === false)
        throw new Error("Opportunity action failed");
      void queryClient.invalidateQueries({
        queryKey: ["career-matching-results", userId],
      });
    } catch {
      if (mounted.current)
        setActionError(
          formatMessage(CAREER_HOOK_MESSAGES.opportunityStatusUpdateFailed)
        );
    } finally {
      preparingRef.current = false;
      if (mounted.current) setPreparingRoleId(null);
    }
  };
  const listTitle = t("career.matchings.title", "매칭 히스토리");
  const errorMessage = t(
    "career.matchings.load_failed",
    "목록을 불러오지 못했어요."
  );
  const retry = t("career.matchings.retry", "다시 시도");
  const more = t(
    "career.history.opportunity_recommendation_preview.show_more",
    "더보기"
  );

  const closeLabel = t(
    "career.common.talent_career_modal.18ppi14",
    "모달 닫기"
  );
  const excludeLabel = t(
    "career.matchings.exclude_recommended",
    "추천된 포지션 제외"
  );

  return (
    <TalentCareerModal
      open
      onClose={onClose}
      title={listTitle}
      overlayClassName="items-stretch justify-end p-2 sm:p-4"
      panelClassName={`${sidePanel} ${selected ? "max-w-[560px] lg:max-w-[980px]" : "max-w-[420px]"}`}
      showCloseButton={false}
      headerClassName="sr-only"
      bodyClassName="flex min-h-0 flex-1 overflow-hidden"
    >
      <section
        className={`min-h-0 w-full shrink-0 overflow-y-auto lg:w-[420px] ${selected ? "hidden lg:block" : "block"}`}
      >
        <header className="career-side-panel-header sticky top-0 z-10 flex items-center justify-between gap-3 px-5 pt-6 pb-8">
          <h3 className="text-base font-medium text-neutral-primary">
            {listTitle}
          </h3>
          <MuteButton
            variant="transparent"
            size="sm"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X aria-hidden className="size-4" />
          </MuteButton>
        </header>
        <div className="px-5 pb-6">
          {matchings.isPending ? <LoadingRows /> : null}
          {!matchings.isPending && !matchings.isError && rows.length === 0 ? (
            <p className="py-8 text-sm text-neutral-muted">
              {t("career.matchings.empty", "아직 매칭 목록이 없어요.")}
            </p>
          ) : null}
          <div className="divide-y divide-neutral-1000-a05">
            {rows.map((matching) => (
              <BareButton
                key={matching.id}
                onClick={() => {
                  setSelected(matching);
                  setExpandedRoleId(null);
                  setActionError(null);
                }}
                aria-pressed={selected?.id === matching.id}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 ${selected?.id === matching.id ? "bg-primary-faded ring-1 ring-inset ring-primary" : "hover:bg-bg-weak"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium text-neutral-primary">
                    {matching.title}
                  </span>
                  {matching.description ? (
                    <span className="mt-1 block line-clamp-2 break-words text-[13px] leading-5 text-neutral-muted">
                      {matching.description}
                    </span>
                  ) : null}
                </span>
                {selected?.id === matching.id ? (
                  <Check aria-hidden className="size-4 shrink-0 text-primary" />
                ) : (
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-neutral-soft"
                  />
                )}
              </BareButton>
            ))}
          </div>
          {matchings.isError ? (
            <div
              role="alert"
              className="space-y-2 py-4 text-sm text-neutral-muted"
            >
              <p>{errorMessage}</p>
              <MuteButton
                size="sm"
                onClick={() =>
                  void (matchings.isFetchNextPageError
                    ? matchings.fetchNextPage()
                    : matchings.refetch())
                }
              >
                {retry}
              </MuteButton>
            </div>
          ) : null}
          {matchings.hasNextPage && !matchings.isFetchNextPageError ? (
            <MuteButton
              variant="transparent"
              className="mt-4 w-full"
              disabled={matchings.isFetching}
              onClick={() => void matchings.fetchNextPage()}
            >
              {matchings.isFetchingNextPage ? (
                <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />
              ) : null}
              {more}
            </MuteButton>
          ) : null}
        </div>
      </section>
      {selected ? (
        <section className="min-h-0 min-w-0 flex-1 overflow-y-auto lg:border-l lg:border-neutral-1000-a05">
          <header className="career-side-panel-header sticky top-0 z-10 flex items-center justify-between gap-3 px-5 pt-6 pb-8">
            <div className="flex min-w-0 items-center gap-2">
              <MuteButton
                variant="transparent"
                size="sm"
                aria-label={listTitle}
                onClick={() => setSelected(null)}
              >
                <ArrowLeft aria-hidden className="size-4" />
              </MuteButton>
              <h3 className="min-w-0 break-words text-base font-medium text-neutral-primary">
                {selected.title}
              </h3>
            </div>
            <MuteButton
              variant="transparent"
              size="sm"
              onClick={onClose}
              aria-label={closeLabel}
            >
              <X aria-hidden className="size-4" />
            </MuteButton>
          </header>
          <div className="px-5 pb-6">
            <label className="mb-4 flex items-center justify-between gap-3 text-sm text-neutral-primary">
              {excludeLabel}
              <AppleSwitch
                checked={excludeRecommended}
                onCheckedChange={setExcludeRecommended}
                aria-label={excludeLabel}
              />
            </label>
            {results.isPending ? <LoadingRows /> : null}
            {!results.isPending &&
            !results.isError &&
            opportunities.length === 0 ? (
              <p className="py-8 text-sm text-neutral-muted">
                {excludeRecommended
                  ? t(
                      "career.matchings.no_unrecommended_results",
                      "아직 추천하지 않은 포지션이 없어요."
                    )
                  : t(
                      "career.matchings.no_results",
                      "아직 평가된 포지션이 없어요."
                    )}
              </p>
            ) : null}
            {actionError || historyUpdateError ? (
              <p role="alert" className="mb-3 text-sm text-critical">
                {actionError || historyUpdateError}
              </p>
            ) : null}
            <ol className="space-y-1.5">
              {opportunities.map((entry) => {
                const recommendedBadge = entry.isRecommended ? (
                  <span
                    className="shrink-0"
                    role="img"
                    aria-label={t(
                      "career.matchings.recommended",
                      "추천된 포지션"
                    )}
                  >
                    <BadgeCheck
                      aria-hidden
                      className="size-5 fill-action text-action [&>path:last-child]:fill-none [&>path:last-child]:stroke-white"
                    />
                  </span>
                ) : null;
                return (
                  <li key={entry.id}>
                    {entry.opportunity ? (
                      <NewOpportunityCard
                        showUnreadIndicator={false}
                        item={entry.opportunity}
                        feedbackVariant={feedbackVariant}
                        expanded={expandedRoleId === entry.roleId}
                        onToggleOpportunity={(item) =>
                          setExpandedRoleId((current) =>
                            current === item.roleId ? null : item.roleId
                          )
                        }
                        pending={Boolean(
                          preparingRoleId ||
                          pendingOpportunityIds?.has(entry.opportunity.id)
                        )}
                        onApply={(item) => runAction(item, onApply)}
                        onPositive={(item) => runAction(item, onPositive)}
                        onNegative={(item) => runAction(item, onNegative)}
                        onKeep={(item) => runAction(item, onKeep)}
                        onOpenCompanyInfo={onOpenCompanyInfo}
                        onOpenLink={onOpenLink}
                        titleAdornment={recommendedBadge}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <OpportunityResultRow
                          className="min-w-0 flex-1"
                          companyName={entry.companyName}
                          title={
                            entry.title ??
                            t(
                              "career.matchings.unavailable",
                              "포지션 정보 없음"
                            )
                          }
                        />
                        {recommendedBadge}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {results.isError ? (
              <div
                role="alert"
                className="space-y-2 py-4 text-sm text-neutral-muted"
              >
                <p>{errorMessage}</p>
                <MuteButton
                  size="sm"
                  onClick={() =>
                    void (results.isFetchNextPageError
                      ? results.fetchNextPage()
                      : results.refetch())
                  }
                >
                  {retry}
                </MuteButton>
              </div>
            ) : null}
            {results.hasNextPage && !results.isFetchNextPageError ? (
              <MuteButton
                variant="transparent"
                className="mt-4 w-full"
                disabled={results.isFetching}
                onClick={() => void results.fetchNextPage()}
              >
                {results.isFetchingNextPage ? (
                  <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />
                ) : null}
                {more}
              </MuteButton>
            ) : null}
          </div>
        </section>
      ) : null}
    </TalentCareerModal>
  );
}

export default function CareerMatchingList({
  userId,
  ...actions
}: MatchingActions & { userId?: string }) {
  const t = useCareerT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <MuteButton
        size="sm"
        variant="transparent"
        disabled={!userId}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t("career.matchings.title", "매칭 히스토리")}
      >
        <History aria-hidden className="mr-1.5 size-3.5" />
      </MuteButton>
      {open && userId ? (
        <MatchingPanels
          key={userId}
          {...actions}
          userId={userId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
