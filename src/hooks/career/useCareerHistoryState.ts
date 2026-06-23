import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import type {
  CareerHistoryOpportunity,
  CareerHistoryOpportunityCounts,
  CareerHistoryOpportunityFeedback,
  CareerHistoryOpportunityPageFilter,
  CareerInternalOpportunityCallRequest,
  CareerMessagePayload,
  CareerOpportunityFeedbackFollowUpTrigger,
  CareerOpportunitySavedStage,
} from "@/components/career/types";
import { getErrorMessage } from "@/hooks/career/careerHelpers";
import { showOpportunityDiscoveryStartedToast } from "@/hooks/career/opportunityDiscoveryToast";
import {
  deriveHistoryOpportunityCounts,
  getDefaultSavedStage,
  normalizeHistoryOpportunityCounts,
  normalizeHistoryOpportunities,
} from "@/hooks/career/careerSessionData";
import type { FetchWithAuth } from "@/hooks/career/useCareerApi";
import { useCareerMessageFormatter } from "@/i18n/useCareerMessageFormatter";
import { useMessages } from "@/i18n/useMessage";
import { CAREER_HOOK_MESSAGES as H } from "./careerHookMessages";

const CAREER_HISTORY_PAGE_SIZE = 10;
const CAREER_HISTORY_GC_TIME = 30 * 60_000;
const CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_DELAY_MS = 10_000;

type CareerHistoryPage = {
  counts: CareerHistoryOpportunityCounts | null;
  items: CareerHistoryOpportunity[];
  nextOffset: number | null;
};

type InitialCareerHistoryPage = {
  counts?: CareerHistoryOpportunityCounts | null;
  items?: CareerHistoryOpportunity[];
  nextOffset?: number | null;
} | null;

type FilteredPageState = {
  loading: boolean;
  nextOffset: number | null;
};

type FilteredPageStateMap = Record<string, FilteredPageState | undefined>;

type OpportunityFeedbackFollowUpRequestOptions = {
  delayMs?: number | null;
  feedback?: CareerHistoryOpportunityFeedback | null;
  feedbackReason?: string | null;
  internalCallRequestId?: string | null;
  opportunityId?: string | null;
  refreshHistory?: boolean;
  shouldCreateInternalCallRequest?: boolean;
  trigger?: CareerOpportunityFeedbackFollowUpTrigger | null;
};

const FOLLOW_UP_TRIGGER_PRIORITY: Record<
  CareerOpportunityFeedbackFollowUpTrigger,
  number
> = {
  delayed_external_feedback: 1,
  all_visible_feedback_submitted: 2,
  all_recommended_opportunities_cleared: 3,
  immediate_internal_feedback: 4,
};

const getFollowUpTriggerPriority = (
  trigger: CareerOpportunityFeedbackFollowUpTrigger | null | undefined
) => (trigger ? (FOLLOW_UP_TRIGGER_PRIORITY[trigger] ?? 0) : 0);

export const careerHistoryOpportunitiesKey = (userId: string | null) =>
  ["career-history-opportunities", userId] as const;

const toHistoryPage = (
  value: unknown,
  nextOffset?: number | null,
  counts?: unknown
): CareerHistoryPage => ({
  counts: normalizeHistoryOpportunityCounts(counts),
  items: normalizeHistoryOpportunities(
    value as Parameters<typeof normalizeHistoryOpportunities>[0]
  ),
  nextOffset: typeof nextOffset === "number" ? nextOffset : null,
});

const getHistoryBucket = (item: CareerHistoryOpportunity) => {
  if (item.feedback === "positive") return "saved";
  if (item.feedback === "negative") return "archived";
  return "new";
};

const getHistoryFilterKey = (
  filter: CareerHistoryOpportunityPageFilter
): string => {
  if (filter.historyTab === "saved") {
    return `saved:${filter.savedStage ?? "all"}`;
  }
  return filter.historyTab;
};

const cloneHistoryCounts = (
  counts: CareerHistoryOpportunityCounts
): CareerHistoryOpportunityCounts => ({
  ...counts,
  savedStages: { ...counts.savedStages },
});

const incrementCountsForItem = (
  counts: CareerHistoryOpportunityCounts,
  item: CareerHistoryOpportunity
) => {
  const bucket = getHistoryBucket(item);
  counts[bucket] += 1;
  counts.total += 1;

  if (bucket === "saved") {
    const stage = item.savedStage ?? getDefaultSavedStage(item);
    counts.savedStages[stage] += 1;
  }
};

const mergePagesWithFirstPage = (
  current: InfiniteData<CareerHistoryPage, number> | undefined,
  firstPage: CareerHistoryPage
): InfiniteData<CareerHistoryPage, number> => {
  if (!current || current.pages.length === 0) {
    return {
      pages: [firstPage],
      pageParams: [0],
    };
  }

  return {
    pages: [firstPage, ...current.pages.slice(1)],
    pageParams: current.pageParams.length > 0 ? current.pageParams : [0],
  };
};

export function useCareerHistoryState(args: {
  conversationId: string | null;
  enabled: boolean;
  fetchWithAuth: FetchWithAuth;
  initialSessionPage?: InitialCareerHistoryPage;
  onHistoryActionAssistantMessage?: (message: CareerMessagePayload) => void;
  onHistoryActionUserMessage?: (message: CareerMessagePayload) => void;
  onPendingInternalOpportunityCallRequestChanged?: (
    callRequest: CareerInternalOpportunityCallRequest | null
  ) => void;
  onPendingInternalOpportunityCallRequestsChanged?: (
    callRequests: CareerInternalOpportunityCallRequest[]
  ) => void;
  onOpportunityFeedbackFollowUpPendingChanged?: (state: {
    pending: boolean;
    trigger: CareerOpportunityFeedbackFollowUpTrigger | null;
  }) => void;
  userId: string | null;
}) {
  const {
    conversationId,
    enabled,
    fetchWithAuth,
    initialSessionPage,
    onHistoryActionAssistantMessage,
    onHistoryActionUserMessage,
    onPendingInternalOpportunityCallRequestChanged,
    onPendingInternalOpportunityCallRequestsChanged,
    onOpportunityFeedbackFollowUpPendingChanged,
    userId,
  } = args;
  const tCareer = useCareerMessageFormatter();
  const { locale } = useMessages();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => careerHistoryOpportunitiesKey(userId),
    [userId]
  );
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyOpportunityCounts, setHistoryOpportunityCounts] =
    useState<CareerHistoryOpportunityCounts | null>(null);
  const [historyUpdatingOpportunityIds, setHistoryUpdatingOpportunityIds] =
    useState<string[]>([]);
  const [historyUpdateError, setHistoryUpdateError] = useState("");
  const [filteredPageState, setFilteredPageState] =
    useState<FilteredPageStateMap>({});
  const filteredPageStateRef = useRef<FilteredPageStateMap>({});
  const feedbackFollowUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const feedbackFollowUpRequestRef =
    useRef<OpportunityFeedbackFollowUpRequestOptions | null>(null);
  const feedbackFollowUpPendingSequenceRef = useRef(0);
  const feedbackActionSequenceRef = useRef(0);

  const cancelPendingOpportunityFeedbackFollowUp = useCallback(() => {
    if (!feedbackFollowUpTimerRef.current) return;
    clearTimeout(feedbackFollowUpTimerRef.current);
    feedbackFollowUpTimerRef.current = null;
    feedbackFollowUpRequestRef.current = null;
  }, []);

  const updateFilteredPageState = useCallback(
    (updater: (current: FilteredPageStateMap) => FilteredPageStateMap) => {
      const next = updater(filteredPageStateRef.current);
      filteredPageStateRef.current = next;
      setFilteredPageState(next);
    },
    []
  );

  const requestOpportunityFeedbackFollowUp = useCallback(
    async (options?: OpportunityFeedbackFollowUpRequestOptions) => {
      if (!conversationId) return;

      const trigger = options?.trigger ?? "delayed_external_feedback";
      const pendingSequence = feedbackFollowUpPendingSequenceRef.current + 1;
      feedbackFollowUpPendingSequenceRef.current = pendingSequence;
      onOpportunityFeedbackFollowUpPendingChanged?.({
        pending: true,
        trigger,
      });

      try {
        const response = await fetchWithAuth(
          "/api/talent/opportunities/feedback-followup",
          {
            method: "POST",
            body: JSON.stringify({
              conversationId,
              feedback: options?.feedback ?? null,
              feedbackReason: options?.feedbackReason ?? null,
              internalCallRequestId: options?.internalCallRequestId ?? null,
              opportunityId: options?.opportunityId ?? null,
              shouldCreateInternalCallRequest:
                options?.shouldCreateInternalCallRequest === true,
              trigger,
            }),
          }
        );
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, tCareer(H.feedbackFollowUpCreateFailed))
          );
        }

        if (payload.assistantMessage) {
          onHistoryActionAssistantMessage?.(
            payload.assistantMessage as CareerMessagePayload
          );
        }
        if (Array.isArray(payload.pendingInternalOpportunityCallRequests)) {
          onPendingInternalOpportunityCallRequestsChanged?.(
            payload.pendingInternalOpportunityCallRequests as CareerInternalOpportunityCallRequest[]
          );
        } else if (payload.pendingInternalOpportunityCallRequest) {
          onPendingInternalOpportunityCallRequestChanged?.(
            payload.pendingInternalOpportunityCallRequest as CareerInternalOpportunityCallRequest
          );
        }
        if (options?.refreshHistory) {
          await queryClient.invalidateQueries({ queryKey });
        }
      } catch (error) {
        setHistoryUpdateError(
          error instanceof Error
            ? error.message
            : tCareer(H.feedbackFollowUpCreateFailed)
        );
      } finally {
        if (feedbackFollowUpPendingSequenceRef.current === pendingSequence) {
          onOpportunityFeedbackFollowUpPendingChanged?.({
            pending: false,
            trigger: null,
          });
        }
      }
    },
    [
      conversationId,
      fetchWithAuth,
      onHistoryActionAssistantMessage,
      onOpportunityFeedbackFollowUpPendingChanged,
      onPendingInternalOpportunityCallRequestChanged,
      onPendingInternalOpportunityCallRequestsChanged,
      queryClient,
      queryKey,
      tCareer,
    ]
  );

  const scheduleOpportunityFeedbackFollowUp = useCallback(
    (options?: OpportunityFeedbackFollowUpRequestOptions) => {
      const currentRequest = feedbackFollowUpRequestRef.current;
      if (
        feedbackFollowUpTimerRef.current &&
        getFollowUpTriggerPriority(currentRequest?.trigger) >
          getFollowUpTriggerPriority(options?.trigger)
      ) {
        return;
      }

      cancelPendingOpportunityFeedbackFollowUp();
      const delayMs =
        typeof options?.delayMs === "number" && Number.isFinite(options.delayMs)
          ? Math.max(0, Math.floor(options.delayMs))
          : CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_DELAY_MS;
      feedbackFollowUpRequestRef.current = options ?? null;
      feedbackFollowUpTimerRef.current = setTimeout(() => {
        feedbackFollowUpTimerRef.current = null;
        const scheduledOptions =
          feedbackFollowUpRequestRef.current ?? undefined;
        feedbackFollowUpRequestRef.current = null;
        void requestOpportunityFeedbackFollowUp(scheduledOptions);
      }, delayMs);
    },
    [
      cancelPendingOpportunityFeedbackFollowUp,
      requestOpportunityFeedbackFollowUp,
    ]
  );

  useEffect(
    () => () => {
      cancelPendingOpportunityFeedbackFollowUp();
    },
    [cancelPendingOpportunityFeedbackFollowUp]
  );

  const fetchHistoryPage = useCallback(
    async (offset: number, filter?: CareerHistoryOpportunityPageFilter) => {
      if (!userId) {
        return {
          counts: null,
          items: [],
          nextOffset: null,
        } satisfies CareerHistoryPage;
      }

      const searchParams = new URLSearchParams({
        limit: String(CAREER_HISTORY_PAGE_SIZE),
        offset: String(Math.max(0, offset)),
      });
      if (filter?.historyTab) {
        searchParams.set("historyTab", filter.historyTab);
      }
      if (filter?.savedStage) {
        searchParams.set("savedStage", filter.savedStage);
      }
      const response = await fetchWithAuth(
        `/api/talent/opportunities?${searchParams.toString()}`
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as Partial<CareerHistoryPage> &
        Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, tCareer(H.opportunityListLoadFailed))
        );
      }

      const counts = normalizeHistoryOpportunityCounts(payload.counts);
      if (counts) {
        setHistoryOpportunityCounts(counts);
      }

      return {
        counts,
        items: normalizeHistoryOpportunities(
          payload.items as Parameters<typeof normalizeHistoryOpportunities>[0]
        ),
        nextOffset:
          typeof payload.nextOffset === "number" ? payload.nextOffset : null,
      } satisfies CareerHistoryPage;
    },
    [fetchWithAuth, tCareer, userId]
  );

  const initialData = useMemo(() => {
    if (!initialSessionPage || !userId) return undefined;

    return {
      pages: [
        toHistoryPage(
          initialSessionPage.items ?? [],
          initialSessionPage.nextOffset ?? null,
          initialSessionPage.counts ?? null
        ),
      ],
      pageParams: [0],
    } satisfies InfiniteData<CareerHistoryPage, number>;
  }, [initialSessionPage, userId]);

  const infinite = useInfiniteQuery({
    queryKey,
    enabled: enabled && Boolean(userId),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchHistoryPage(pageParam),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    gcTime: CAREER_HISTORY_GC_TIME,
    initialData,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const historyOpportunities = useMemo(() => {
    const seen = new Set<string>();
    const items: CareerHistoryOpportunity[] = [];

    for (const page of infinite.data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
      }
    }

    return items;
  }, [infinite.data?.pages]);

  const historyOpportunityById = useMemo(
    () =>
      new Map(
        historyOpportunities.map((opportunity) => [opportunity.id, opportunity])
      ),
    [historyOpportunities]
  );

  const findCachedHistoryOpportunity = useCallback(
    (opportunityId: string, roleId?: string | null) => {
      const normalizedOpportunityId = opportunityId.trim();
      const normalizedRoleId = String(roleId ?? "").trim();
      const current =
        queryClient.getQueryData<InfiniteData<CareerHistoryPage, number>>(
          queryKey
        );

      for (const page of current?.pages ?? []) {
        for (const item of page.items) {
          if (item.id === normalizedOpportunityId) return item;
          if (normalizedRoleId && item.roleId === normalizedRoleId) return item;
        }
      }

      return null;
    },
    [queryClient, queryKey]
  );

  const resolvedHistoryOpportunityCounts = useMemo(
    () =>
      historyOpportunityCounts ??
      deriveHistoryOpportunityCounts(historyOpportunities),
    [historyOpportunityCounts, historyOpportunities]
  );

  const applyHistoryOpportunityCountsTransition = useCallback(
    (
      previousItem: CareerHistoryOpportunity,
      nextItem: CareerHistoryOpportunity
    ) => {
      setHistoryOpportunityCounts((current) => {
        const baseCounts =
          current ?? deriveHistoryOpportunityCounts(historyOpportunities);
        const nextCounts = cloneHistoryCounts(baseCounts);
        const previousBucket = getHistoryBucket(previousItem);
        const nextBucket = getHistoryBucket(nextItem);

        if (previousBucket !== nextBucket) {
          nextCounts[previousBucket] = Math.max(
            0,
            nextCounts[previousBucket] - 1
          );
          nextCounts[nextBucket] += 1;
        }

        if (previousBucket === "saved") {
          const previousStage =
            previousItem.savedStage ?? getDefaultSavedStage(previousItem);
          nextCounts.savedStages[previousStage] = Math.max(
            0,
            nextCounts.savedStages[previousStage] - 1
          );
        }

        if (nextBucket === "saved") {
          const nextStage =
            nextItem.savedStage ?? getDefaultSavedStage(nextItem);
          nextCounts.savedStages[nextStage] += 1;
        }

        nextCounts.total =
          nextCounts.new + nextCounts.saved + nextCounts.archived;

        return nextCounts;
      });
    },
    [historyOpportunities]
  );

  const applyHistoryOpportunityCountsInsertion = useCallback(
    (item: CareerHistoryOpportunity) => {
      setHistoryOpportunityCounts((current) => {
        const baseCounts =
          current ?? deriveHistoryOpportunityCounts(historyOpportunities);
        const nextCounts = cloneHistoryCounts(baseCounts);
        incrementCountsForItem(nextCounts, item);
        return nextCounts;
      });
    },
    [historyOpportunities]
  );

  const updateHistoryOpportunityLocally = useCallback(
    (
      opportunityId: string,
      updater: (current: CareerHistoryOpportunity) => CareerHistoryOpportunity
    ) => {
      queryClient.setQueryData<InfiniteData<CareerHistoryPage, number>>(
        queryKey,
        (current) => {
          if (!current) return current;

          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === opportunityId ? updater(item) : item
              ),
            })),
          };
        }
      );
    },
    [queryClient, queryKey]
  );

  const upsertHistoryOpportunityLocally = useCallback(
    (
      item: CareerHistoryOpportunity,
      options?: { replaceOpportunityId?: string | null }
    ) => {
      queryClient.setQueryData<InfiniteData<CareerHistoryPage, number>>(
        queryKey,
        (current) => {
          const replaceOpportunityId = String(
            options?.replaceOpportunityId ?? ""
          ).trim();
          const matchesItem = (candidate: CareerHistoryOpportunity) =>
            candidate.id === item.id ||
            (replaceOpportunityId.length > 0 &&
              candidate.id === replaceOpportunityId);

          if (!current || current.pages.length === 0) {
            return {
              pages: [
                {
                  counts: null,
                  items: [item],
                  nextOffset: null,
                },
              ],
              pageParams: [0],
            };
          }

          let inserted = false;
          const pages = current.pages.map((page, pageIndex) => {
            const nextItems: CareerHistoryOpportunity[] = [];

            for (const candidate of page.items) {
              if (matchesItem(candidate)) {
                if (!inserted) {
                  nextItems.push(item);
                  inserted = true;
                }
                continue;
              }

              nextItems.push(candidate);
            }

            if (pageIndex === 0 && !inserted) {
              nextItems.unshift(item);
              inserted = true;
            }

            return {
              ...page,
              items: nextItems,
            };
          });

          return {
            ...current,
            pages,
          };
        }
      );
    },
    [queryClient, queryKey]
  );

  const removeHistoryOpportunityLocally = useCallback(
    (opportunityId: string) => {
      queryClient.setQueryData<InfiniteData<CareerHistoryPage, number>>(
        queryKey,
        (current) => {
          if (!current) return current;

          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => item.id !== opportunityId),
            })),
          };
        }
      );
    },
    [queryClient, queryKey]
  );

  const restoreHistoryOpportunity = useCallback(
    (opportunityId: string, previousItem: CareerHistoryOpportunity) => {
      queryClient.setQueryData<InfiniteData<CareerHistoryPage, number>>(
        queryKey,
        (current) => {
          if (!current) return current;

          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === opportunityId ? previousItem : item
              ),
            })),
          };
        }
      );
    },
    [queryClient, queryKey]
  );

  const beginHistoryUpdate = useCallback((opportunityId: string) => {
    setHistoryUpdateError("");
    setHistoryUpdatingOpportunityIds((current) =>
      current.includes(opportunityId) ? current : [...current, opportunityId]
    );
  }, []);

  const endHistoryUpdate = useCallback((opportunityId: string) => {
    setHistoryUpdatingOpportunityIds((current) =>
      current.filter((item) => item !== opportunityId)
    );
  }, []);

  const patchHistoryOpportunity = useCallback(
    async (body: {
      action: "feedback" | "saved_stage" | "view" | "click" | "memo";
      conversationId?: string | null;
      feedback?: CareerHistoryOpportunityFeedback | null;
      feedbackReason?: string | null;
      locale?: string;
      opportunityId: string;
      promptImmediately?: boolean;
      savedStage?: CareerOpportunitySavedStage | null;
      interactionSource?: "position_tab";
      talentMemo?: string | null;
    }) => {
      const response = await fetchWithAuth("/api/talent/opportunities", {
        method: "PATCH",
        body: JSON.stringify({ ...body, locale }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, tCareer(H.opportunityStatusUpdateFailed))
        );
      }

      return payload as {
        assistantMessage?: CareerMessagePayload | null;
        feedbackFollowUp?: {
          delayMs?: number | null;
          delayed?: boolean;
          feedback?: CareerHistoryOpportunityFeedback | null;
          immediate?: boolean;
          internalCallRequestId?: string | null;
          opportunityId?: string | null;
          shouldCreateInternalCallRequest?: boolean;
          trigger?: CareerOpportunityFeedbackFollowUpTrigger | null;
        } | null;
        followUpRunId?: string | null;
        historyShouldRefresh?: boolean;
        opportunity?: CareerHistoryOpportunity | null;
        opportunityDiscoveryQueued?: boolean;
        pendingInternalOpportunityCallRequest?: CareerInternalOpportunityCallRequest | null;
        pendingInternalOpportunityCallRequests?: CareerInternalOpportunityCallRequest[];
        userMessage?: CareerMessagePayload | null;
      };
    },
    [fetchWithAuth, locale, tCareer]
  );

  const onUpdateHistoryOpportunityFeedback = useCallback(
    async (
      opportunityId: string,
      feedback: CareerHistoryOpportunityFeedback | null,
      options?: {
        feedbackReason?: string | null;
        fallbackOpportunity?: CareerHistoryOpportunity;
        interactionSource?: "position_tab";
        promptImmediately?: boolean;
        savedStage?: CareerOpportunitySavedStage | null;
      }
    ) => {
      const normalizedOpportunityId = opportunityId.trim();
      if (!normalizedOpportunityId) return;

      const fallbackOpportunity = options?.fallbackOpportunity;
      const cachedPreviousItem =
        historyOpportunityById.get(normalizedOpportunityId) ??
        findCachedHistoryOpportunity(
          normalizedOpportunityId,
          fallbackOpportunity?.roleId
        );
      const previousItem = cachedPreviousItem ?? fallbackOpportunity;
      if (!previousItem) return;
      const localOpportunityId =
        cachedPreviousItem?.id ?? normalizedOpportunityId;
      const shouldUpdateHistoryCache = Boolean(cachedPreviousItem);
      const feedbackActionSequence = feedback
        ? (feedbackActionSequenceRef.current += 1)
        : feedbackActionSequenceRef.current;
      const now = new Date().toISOString();
      const nextSavedStage =
        feedback === "positive"
          ? (options?.savedStage ??
            previousItem.savedStage ??
            getDefaultSavedStage(previousItem))
          : null;
      const nextItem: CareerHistoryOpportunity = {
        ...previousItem,
        dismissedAt: feedback === "negative" ? now : null,
        feedback,
        feedbackAt: feedback ? now : null,
        feedbackReason: feedback ? (options?.feedbackReason ?? null) : null,
        savedStage: nextSavedStage,
      };
      const previousCounts = historyOpportunityCounts;
      let insertedFallbackOpportunity = false;

      beginHistoryUpdate(normalizedOpportunityId);
      if (localOpportunityId !== normalizedOpportunityId) {
        beginHistoryUpdate(localOpportunityId);
      }
      if (shouldUpdateHistoryCache) {
        updateHistoryOpportunityLocally(localOpportunityId, () => nextItem);
        applyHistoryOpportunityCountsTransition(previousItem, nextItem);
      } else {
        upsertHistoryOpportunityLocally(nextItem);
        applyHistoryOpportunityCountsInsertion(nextItem);
        insertedFallbackOpportunity = true;
      }

      try {
        const payload = await patchHistoryOpportunity({
          action: "feedback",
          conversationId,
          feedback,
          feedbackReason: options?.feedbackReason ?? null,
          interactionSource: options?.interactionSource,
          opportunityId: normalizedOpportunityId,
          promptImmediately: options?.promptImmediately === true,
          savedStage: nextSavedStage,
        });
        const [updatedOpportunity] = normalizeHistoryOpportunities(
          payload.opportunity ? [payload.opportunity] : []
        );
        if (updatedOpportunity) {
          upsertHistoryOpportunityLocally(updatedOpportunity, {
            replaceOpportunityId: localOpportunityId,
          });
        }
        if (payload.userMessage) {
          onHistoryActionUserMessage?.(payload.userMessage);
        }
        if (Array.isArray(payload.pendingInternalOpportunityCallRequests)) {
          onPendingInternalOpportunityCallRequestsChanged?.(
            payload.pendingInternalOpportunityCallRequests
          );
        } else if ("pendingInternalOpportunityCallRequest" in payload) {
          onPendingInternalOpportunityCallRequestChanged?.(
            payload.pendingInternalOpportunityCallRequest ?? null
          );
        }
        if (payload.assistantMessage) {
          cancelPendingOpportunityFeedbackFollowUp();
          onHistoryActionAssistantMessage?.(payload.assistantMessage);
        } else {
          const followUp = payload.feedbackFollowUp;
          const followUpTrigger = followUp?.trigger ?? null;
          const shouldScheduleFollowUp =
            feedback &&
            followUpTrigger &&
            (feedbackActionSequence === feedbackActionSequenceRef.current ||
              followUpTrigger === "immediate_internal_feedback");

          if (shouldScheduleFollowUp) {
            scheduleOpportunityFeedbackFollowUp({
              delayMs: followUp?.delayMs,
              feedback: followUp?.feedback ?? feedback,
              feedbackReason: options?.feedbackReason ?? null,
              internalCallRequestId: followUp?.internalCallRequestId ?? null,
              opportunityId:
                followUp?.opportunityId ??
                updatedOpportunity?.id ??
                normalizedOpportunityId,
              refreshHistory:
                payload.historyShouldRefresh || followUp?.immediate === true,
              shouldCreateInternalCallRequest:
                followUp?.shouldCreateInternalCallRequest === true,
              trigger: followUpTrigger,
            });
          }
        }
        if (payload.opportunityDiscoveryQueued) {
          showOpportunityDiscoveryStartedToast(
            tCareer(H.opportunityDiscoveryStarted)
          );
        }
        if (payload.historyShouldRefresh || !shouldUpdateHistoryCache) {
          await queryClient.invalidateQueries({ queryKey });
        }
      } catch (error) {
        if (shouldUpdateHistoryCache) {
          restoreHistoryOpportunity(localOpportunityId, previousItem);
          setHistoryOpportunityCounts(previousCounts);
        } else if (insertedFallbackOpportunity) {
          removeHistoryOpportunityLocally(normalizedOpportunityId);
          setHistoryOpportunityCounts(previousCounts);
        }
        setHistoryUpdateError(
          error instanceof Error
            ? error.message
            : tCareer(H.opportunityStatusUpdateFailed)
        );
      } finally {
        endHistoryUpdate(normalizedOpportunityId);
        if (localOpportunityId !== normalizedOpportunityId) {
          endHistoryUpdate(localOpportunityId);
        }
      }
    },
    [
      beginHistoryUpdate,
      endHistoryUpdate,
      findCachedHistoryOpportunity,
      historyOpportunityById,
      historyOpportunityCounts,
      applyHistoryOpportunityCountsInsertion,
      applyHistoryOpportunityCountsTransition,
      conversationId,
      cancelPendingOpportunityFeedbackFollowUp,
      onHistoryActionAssistantMessage,
      onHistoryActionUserMessage,
      onPendingInternalOpportunityCallRequestChanged,
      onPendingInternalOpportunityCallRequestsChanged,
      patchHistoryOpportunity,
      queryClient,
      queryKey,
      removeHistoryOpportunityLocally,
      restoreHistoryOpportunity,
      scheduleOpportunityFeedbackFollowUp,
      tCareer,
      updateHistoryOpportunityLocally,
      upsertHistoryOpportunityLocally,
    ]
  );

  const onUpdateHistoryOpportunitySavedStage = useCallback(
    async (opportunityId: string, savedStage: CareerOpportunitySavedStage) => {
      const normalizedOpportunityId = opportunityId.trim();
      if (!normalizedOpportunityId) return;

      const previousItem = historyOpportunityById.get(normalizedOpportunityId);
      if (!previousItem) return;

      beginHistoryUpdate(normalizedOpportunityId);
      const nextItem: CareerHistoryOpportunity = {
        ...previousItem,
        feedback: "positive",
        savedStage,
      };
      const previousCounts = historyOpportunityCounts;

      updateHistoryOpportunityLocally(normalizedOpportunityId, () => nextItem);
      applyHistoryOpportunityCountsTransition(previousItem, nextItem);

      try {
        const payload = await patchHistoryOpportunity({
          action: "saved_stage",
          opportunityId: normalizedOpportunityId,
          savedStage,
        });
        const [updatedOpportunity] = normalizeHistoryOpportunities(
          payload.opportunity ? [payload.opportunity] : []
        );
        if (updatedOpportunity) {
          upsertHistoryOpportunityLocally(updatedOpportunity, {
            replaceOpportunityId: normalizedOpportunityId,
          });
        }
      } catch (error) {
        restoreHistoryOpportunity(normalizedOpportunityId, previousItem);
        setHistoryOpportunityCounts(previousCounts);
        setHistoryUpdateError(
          error instanceof Error
            ? error.message
            : tCareer(H.opportunityStatusUpdateFailed)
        );
      } finally {
        endHistoryUpdate(normalizedOpportunityId);
      }
    },
    [
      beginHistoryUpdate,
      endHistoryUpdate,
      historyOpportunityById,
      historyOpportunityCounts,
      applyHistoryOpportunityCountsTransition,
      patchHistoryOpportunity,
      restoreHistoryOpportunity,
      tCareer,
      updateHistoryOpportunityLocally,
      upsertHistoryOpportunityLocally,
    ]
  );

  const onUpdateHistoryOpportunityTalentMemo = useCallback(
    async (opportunityId: string, talentMemo: string | null) => {
      const normalizedOpportunityId = opportunityId.trim();
      if (!normalizedOpportunityId) return;

      const previousItem = historyOpportunityById.get(normalizedOpportunityId);
      if (!previousItem) return;

      const nextMemo = String(talentMemo ?? "").trim() || null;
      const nextItem: CareerHistoryOpportunity = {
        ...previousItem,
        talentMemo: nextMemo,
      };

      beginHistoryUpdate(normalizedOpportunityId);
      updateHistoryOpportunityLocally(normalizedOpportunityId, () => nextItem);

      try {
        const payload = await patchHistoryOpportunity({
          action: "memo",
          opportunityId: normalizedOpportunityId,
          talentMemo: nextMemo,
        });
        const [updatedOpportunity] = normalizeHistoryOpportunities(
          payload.opportunity ? [payload.opportunity] : []
        );
        if (updatedOpportunity) {
          upsertHistoryOpportunityLocally(updatedOpportunity, {
            replaceOpportunityId: normalizedOpportunityId,
          });
        }
      } catch (error) {
        restoreHistoryOpportunity(normalizedOpportunityId, previousItem);
        setHistoryUpdateError(
          error instanceof Error ? error.message : tCareer(H.memoSaveFailed)
        );
      } finally {
        endHistoryUpdate(normalizedOpportunityId);
      }
    },
    [
      beginHistoryUpdate,
      endHistoryUpdate,
      historyOpportunityById,
      patchHistoryOpportunity,
      restoreHistoryOpportunity,
      tCareer,
      updateHistoryOpportunityLocally,
      upsertHistoryOpportunityLocally,
    ]
  );

  const onMarkHistoryOpportunityViewed = useCallback(
    async (opportunityId: string) => {
      const normalizedOpportunityId = opportunityId.trim();
      if (!normalizedOpportunityId) return;

      const currentItem = historyOpportunityById.get(normalizedOpportunityId);
      if (!currentItem || currentItem.viewedAt) return;
      const now = new Date().toISOString();

      updateHistoryOpportunityLocally(normalizedOpportunityId, (item) => ({
        ...item,
        viewedAt: now,
      }));

      try {
        await patchHistoryOpportunity({
          action: "view",
          opportunityId: normalizedOpportunityId,
        });
      } catch (error) {
        restoreHistoryOpportunity(normalizedOpportunityId, currentItem);
        setHistoryUpdateError(
          error instanceof Error
            ? error.message
            : tCareer(H.opportunityStatusUpdateFailed)
        );
      }
    },
    [
      historyOpportunityById,
      patchHistoryOpportunity,
      restoreHistoryOpportunity,
      tCareer,
      updateHistoryOpportunityLocally,
    ]
  );

  const onMarkHistoryOpportunityClicked = useCallback(
    async (opportunityId: string) => {
      const normalizedOpportunityId = opportunityId.trim();
      if (!normalizedOpportunityId) return;

      const currentItem = historyOpportunityById.get(normalizedOpportunityId);
      if (!currentItem || currentItem.clickedAt) return;
      const now = new Date().toISOString();

      updateHistoryOpportunityLocally(normalizedOpportunityId, (item) => ({
        ...item,
        clickedAt: now,
      }));

      try {
        await patchHistoryOpportunity({
          action: "click",
          opportunityId: normalizedOpportunityId,
        });
      } catch (error) {
        restoreHistoryOpportunity(normalizedOpportunityId, currentItem);
        setHistoryUpdateError(
          error instanceof Error
            ? error.message
            : tCareer(H.opportunityStatusUpdateFailed)
        );
      }
    },
    [
      historyOpportunityById,
      patchHistoryOpportunity,
      restoreHistoryOpportunity,
      tCareer,
      updateHistoryOpportunityLocally,
    ]
  );

  const hydrateHistoryOpportunities = useCallback(
    (value: unknown, nextOffset?: number | null, counts?: unknown) => {
      const firstPage = toHistoryPage(value, nextOffset, counts);

      queryClient.setQueryData<InfiniteData<CareerHistoryPage, number>>(
        queryKey,
        (current) => mergePagesWithFirstPage(current, firstPage)
      );
      setHistoryOpportunityCounts(firstPage.counts);
      setHistoryLoaded(true);
      setHistoryUpdatingOpportunityIds([]);
      setHistoryUpdateError("");
    },
    [queryClient, queryKey]
  );

  const refreshLatestHistoryOpportunities = useCallback(async () => {
    if (!enabled || !userId) return;

    try {
      const firstPage = await fetchHistoryPage(0);
      queryClient.setQueryData<InfiniteData<CareerHistoryPage, number>>(
        queryKey,
        (current) => mergePagesWithFirstPage(current, firstPage)
      );
      setHistoryOpportunityCounts(firstPage.counts);
      setHistoryLoaded(true);
      setHistoryUpdateError("");
    } catch (error) {
      setHistoryUpdateError(
        error instanceof Error
          ? error.message
          : tCareer(H.opportunityListRefreshFailed)
      );
    }
  }, [enabled, fetchHistoryPage, queryClient, queryKey, tCareer, userId]);

  const appendHistoryOpportunityPage = useCallback(
    (page: CareerHistoryPage, offset: number) => {
      queryClient.setQueryData<InfiniteData<CareerHistoryPage, number>>(
        queryKey,
        (current) => {
          if (!current || current.pages.length === 0) {
            return {
              pages: [page],
              pageParams: [offset],
            };
          }

          return {
            ...current,
            pages: [...current.pages, page],
            pageParams: [...current.pageParams, offset],
          };
        }
      );
    },
    [queryClient, queryKey]
  );

  const loadHistoryOpportunityByRoleId = useCallback(
    async (roleId: string) => {
      const normalizedRoleId = String(roleId ?? "").trim();
      if (!enabled || !userId || !normalizedRoleId) return null;

      const searchParams = new URLSearchParams({ id: normalizedRoleId });
      const response = await fetchWithAuth(
        `/api/talent/opportunities?${searchParams.toString()}`
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as Partial<CareerHistoryPage> &
        Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, tCareer(H.opportunityLoadFailed))
        );
      }

      const [item] = normalizeHistoryOpportunities(
        payload.items as Parameters<typeof normalizeHistoryOpportunities>[0]
      );

      if (item) {
        upsertHistoryOpportunityLocally(item);
      }

      return item ?? null;
    },
    [enabled, fetchWithAuth, tCareer, upsertHistoryOpportunityLocally, userId]
  );

  const loadMoreHistoryOpportunities = useCallback(
    async (filter?: CareerHistoryOpportunityPageFilter) => {
      if (!filter) {
        if (!infinite.hasNextPage || infinite.isFetchingNextPage) return;
        await infinite.fetchNextPage();
        return;
      }

      if (!enabled || !userId) return;

      const filterKey = getHistoryFilterKey(filter);
      const currentState = filteredPageStateRef.current[filterKey];
      if (currentState?.loading || currentState?.nextOffset === null) return;

      const offset = currentState?.nextOffset ?? 0;
      updateFilteredPageState((current) => ({
        ...current,
        [filterKey]: {
          loading: true,
          nextOffset: offset,
        },
      }));

      try {
        const page = await fetchHistoryPage(offset, filter);
        appendHistoryOpportunityPage(page, offset);
        if (page.counts) {
          setHistoryOpportunityCounts(page.counts);
        }
        setHistoryLoaded(true);
        setHistoryUpdateError("");
        updateFilteredPageState((current) => ({
          ...current,
          [filterKey]: {
            loading: false,
            nextOffset: page.nextOffset,
          },
        }));
      } catch (error) {
        updateFilteredPageState((current) => ({
          ...current,
          [filterKey]: {
            loading: false,
            nextOffset: offset,
          },
        }));
        setHistoryUpdateError(
          error instanceof Error
            ? error.message
            : tCareer(H.opportunityListLoadMoreFailed)
        );
      }
    },
    [
      appendHistoryOpportunityPage,
      enabled,
      fetchHistoryPage,
      infinite,
      tCareer,
      updateFilteredPageState,
      userId,
    ]
  );

  const resetHistoryState = useCallback(() => {
    cancelPendingOpportunityFeedbackFollowUp();
    queryClient.removeQueries({ queryKey: ["career-history-opportunities"] });
    setHistoryLoaded(false);
    setHistoryOpportunityCounts(null);
    filteredPageStateRef.current = {};
    setFilteredPageState({});
    setHistoryUpdatingOpportunityIds([]);
    setHistoryUpdateError("");
  }, [cancelPendingOpportunityFeedbackFollowUp, queryClient]);

  const isFilteredPageLoading = Object.values(filteredPageState).some(
    (state) => state?.loading
  );

  return {
    hasMoreHistoryOpportunities: Boolean(infinite.hasNextPage),
    historyOpportunityCounts: resolvedHistoryOpportunityCounts,
    historyInitialLoading: infinite.isPending && !infinite.data,
    historyLoaded: historyLoaded || Boolean(infinite.data),
    historyLoadingMore: infinite.isFetchingNextPage || isFilteredPageLoading,
    historyOpportunities,
    historyOpportunityById,
    historyUpdateError,
    historyUpdatingOpportunityIds,
    hydrateHistoryOpportunities,
    loadHistoryOpportunityByRoleId,
    loadMoreHistoryOpportunities,
    onMarkHistoryOpportunityClicked,
    onMarkHistoryOpportunityViewed,
    onUpdateHistoryOpportunityFeedback,
    onUpdateHistoryOpportunitySavedStage,
    onUpdateHistoryOpportunityTalentMemo,
    cancelPendingOpportunityFeedbackFollowUp,
    refreshLatestHistoryOpportunities,
    resetHistoryState,
    setHistoryLoaded,
  };
}
