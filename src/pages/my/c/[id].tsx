// pages/result/[id].tsx
import AppLayout from "@/components/layout/app";
import ResultHeader from "./ResultHeader";
import ResultBody from "./ResultBody";
import ChatPanel, { ChatScope } from "@/components/chat/ChatPanel";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import {
  SEARCH_CANDIDATE_MARK_FILTER_KEY,
  normalizeCandidateMarkFilter,
  useSettingStore,
} from "@/store/useSettingStore";
import { useQueryDetail } from "@/hooks/useQueryDetail";
import { logger } from "@/utils/logger";
import { useCredits } from "@/hooks/useCredit";
import { useRunDetail } from "@/hooks/useRunDetail";
import { useRunPagesInfinite } from "@/hooks/useRunResults";
import { runSearch } from "@/hooks/useStartSearch";
import { Loading } from "@/components/ui/loading";
import { supabase } from "@/lib/supabase";
import Head from "next/head";
import CreditModal from "@/components/Modal/CreditModal";
import {
  SearchSource,
  normalizeSearchSource,
  normalizeSearchSources,
  queryTypeToSearchSource,
} from "@/lib/searchSource";
import { MIN_CREDITS_FOR_SEARCH } from "@/utils/constantkeys";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hasInsufficientCreditError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("Insufficient credits");
}

const MAX_PREFETCH_PAGES = 20;
const MIN_CHAT_PANEL_WIDTH = 390;
const MIN_RESULT_PANEL_WIDTH = 520;
const ABSOLUTE_MAX_CHAT_PANEL_WIDTH = 920;

function getMaxChatPanelWidth(containerWidth: number) {
  const byContainer = Math.max(
    MIN_CHAT_PANEL_WIDTH,
    containerWidth - MIN_RESULT_PANEL_WIDTH
  );
  return Math.max(
    MIN_CHAT_PANEL_WIDTH,
    Math.min(ABSOLUTE_MAX_CHAT_PANEL_WIDTH, byContainer)
  );
}

export default function ResultPage() {
  const [finishedTick, setFinishedTick] = useState(0);
  const [chatPanelWidth, setChatPanelWidth] = useState(460);
  const [isResizing, setIsResizing] = useState(false);
  const [isNoCreditModalOpen, setIsNoCreditModalOpen] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);

  const router = useRouter();
  const { id, page, run } = router.query;
  const resultScrollRef = useRef<HTMLDivElement>(null);
  const resultScrollTopRef = useRef(0);
  const restoredResultScrollKeyRef = useRef<string | null>(null);
  const pendingResultScrollRestoreRef = useRef<{
    key: string;
    top: number;
  } | null>(null);

  const queryId = typeof id === "string" ? id : undefined;
  const runId = typeof run === "string" ? run : undefined; // ✅ runs.id (uuid)
  const { data: runData, isLoading: isRunDetailLoading } = useRunDetail(runId);

  const { companyUser } = useCompanyUserStore();
  const userId = companyUser?.user_id;
  const persistedExcludedMarkStatuses = useSettingStore(
    (state) => state.candidateMarkFilterByKey[SEARCH_CANDIDATE_MARK_FILTER_KEY]
  );
  const excludedMarkStatuses = useMemo(
    () => normalizeCandidateMarkFilter(persistedExcludedMarkStatuses ?? []),
    [persistedExcludedMarkStatuses]
  );

  const { data: queryItem } = useQueryDetail(queryId);

  const derivedChatFull =
    !!queryId && !runId && (queryItem?.runs?.length ?? 0) === 0;
  const [userChatFull, setUserChatFull] = useState<boolean | null>(null);

  const isChatFull = userChatFull ?? derivedChatFull;
  const ready = !!userId && !!queryId && !!queryItem?.query_id;

  // URL에서 page 읽기 (0-based)
  const pageIdxRaw = useMemo(() => {
    const raw = Array.isArray(page) ? page[0] : page;
    const n = raw == null ? 0 : parseInt(String(raw), 10);
    return Number.isFinite(n) ? n : 0;
  }, [page]);

  const pageIdx = useMemo(() => {
    const normalized = pageIdxRaw >= 0 ? pageIdxRaw : 0;
    return clamp(normalized, 0, MAX_PREFETCH_PAGES);
  }, [pageIdxRaw]);

  const resultScrollStorageKey = useMemo(() => {
    if (!queryId || !runId) return null;
    return `result-scroll:${queryId}:${runId}`;
  }, [queryId, runId]);

  const setPageInUrl = useCallback(
    (nextIdx: number, mode: "push" | "replace" = "push") => {
      const method = mode === "push" ? router.push : router.replace;

      method(
        {
          pathname: router.pathname,
          query: { ...router.query, page: String(nextIdx) },
        },
        undefined,
        { shallow: true, scroll: false }
      );
    },
    [router]
  );

  const searchEnabled = useMemo(() => ready && !!runId, [ready, runId]);
  const resultSourceType = useMemo<SearchSource>(() => {
    const runSearchSettings = runData?.search_settings as {
      type?: unknown;
      sources?: unknown;
    } | null;
    const runSource = runSearchSettings?.type;
    const runSources = normalizeSearchSources(runSearchSettings?.sources, {
      enabledOnly: true,
      fallback: runSource != null ? [normalizeSearchSource(runSource)] : [],
    });

    if (runSources.length > 1) {
      return "linkedin";
    }

    if (runSource != null) {
      return normalizeSearchSource(runSource);
    }

    return queryTypeToSearchSource(queryItem?.type);
  }, [queryItem?.type, runData?.search_settings]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useRunPagesInfinite({
      userId,
      runId,
      sourceType: resultSourceType,
      excludedMarkStatuses,
      enabled: ready && !!runId,
    });

  // Search execution now happens entirely in the worker.

  useEffect(() => {
    if (!runId && queryItem && queryItem.runs && queryItem.runs.length > 0) {
      logger.log("runId not found, set runId to ", queryItem.runs[0].id);
      router.replace(
        {
          pathname: router.pathname,
          query: { ...router.query, run: queryItem.runs[0].id, page: "0" },
        },
        undefined,
        { shallow: true, scroll: false }
      );
    }
  }, [queryItem, runId, router]);

  const pages = data?.pages ?? [];
  const current = pages[pageIdx];
  const items = current?.items ?? [];
  const totalCandidates =
    pages.find((p) => typeof (p as any)?.total === "number")?.total ?? null;
  const { credits, deductWithHistory, isDeducting } = useCredits();

  const canPrev = pageIdx > 0;
  const nextPageKnownCount =
    totalCandidates != null
      ? Math.max(0, Math.min(10, totalCandidates - (pageIdx + 1) * 10))
      : null;
  const canNextBase = pageIdx + 1 < pages.length || !!hasNextPage;
  const canNext =
    totalCandidates != null ? (nextPageKnownCount ?? 0) > 0 : canNextBase;

  const [runPagesMeta, setRunPagesMeta] = useState<{
    id: number;
    seen_page: number;
  } | null>(null);
  const seenPageRef = useRef(-1);
  const failedChargePageRef = useRef<number | null>(null);
  const updatingSeenRef = useRef(false);
  const isRunPagesMetaLoadingRef = useRef(false);

  const loadRunPagesMeta = useCallback(async () => {
    if (!runId || isRunPagesMetaLoadingRef.current) return;
    isRunPagesMetaLoadingRef.current = true;
    const { data, error } = await supabase
      .from("runs_pages")
      .select("id, seen_page, created_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      logger.log("runs_pages meta load error:", error);
      isRunPagesMetaLoadingRef.current = false;
      return;
    }

    const row = data?.[0];
    if (row) {
      setRunPagesMeta({
        id: row.id,
        seen_page: Number.isFinite(row.seen_page) ? row.seen_page : -1,
      });
    }
    isRunPagesMetaLoadingRef.current = false;
  }, [runId]);

  useEffect(() => {
    setRunPagesMeta(null);
    seenPageRef.current = -1;
    failedChargePageRef.current = null;
    updatingSeenRef.current = false;
    isRunPagesMetaLoadingRef.current = false;
    if (runId) loadRunPagesMeta();
  }, [runId, loadRunPagesMeta]);

  useEffect(() => {
    if ((credits?.remain_credit ?? 0) >= MIN_CREDITS_FOR_SEARCH) {
      failedChargePageRef.current = null;
    }
  }, [credits?.remain_credit]);

  useEffect(() => {
    if (!runPagesMeta && pages.length > 0) loadRunPagesMeta();
  }, [runPagesMeta, pages.length, loadRunPagesMeta]);

  const seenPage = runPagesMeta?.seen_page ?? -1;
  const maxReachablePage =
    runPagesMeta != null ? clamp(seenPage + 1, 0, MAX_PREFETCH_PAGES) : null;
  const maxPageByVisibleTotal = useMemo(() => {
    if (totalCandidates == null) return null;
    return clamp(
      Math.max(0, Math.ceil(totalCandidates / 10) - 1),
      0,
      MAX_PREFETCH_PAGES
    );
  }, [totalCandidates]);
  const maxAllowedPage = useMemo(() => {
    if (maxReachablePage == null) return maxPageByVisibleTotal;
    if (maxPageByVisibleTotal == null) return maxReachablePage;
    return Math.min(maxReachablePage, maxPageByVisibleTotal);
  }, [maxPageByVisibleTotal, maxReachablePage]);
  const shouldClampPage =
    maxAllowedPage != null && pageIdxRaw > maxAllowedPage;
  const isPageLoaded = pageIdx < pages.length && !isLoading;
  const shouldChargeForPage = items.length >= 10;

  useEffect(() => {
    if (!router.isReady) return;
    if (!runId) return;
    if (maxAllowedPage == null) return;
    if (!shouldClampPage) return;

    setPageInUrl(maxAllowedPage, "replace");
  }, [
    router.isReady,
    runId,
    maxAllowedPage,
    setPageInUrl,
    shouldClampPage,
  ]);

  useEffect(() => {
    if (!ready || !runId || !userId) return;
    if (!isPageLoaded) return;
    if (!runPagesMeta) return;
    if (shouldClampPage) return;

    const targetSeen = pageIdx;
    const effectiveSeen = Math.max(seenPage, seenPageRef.current);
    if (targetSeen <= effectiveSeen) return;
    if (failedChargePageRef.current === targetSeen) return;
    if (updatingSeenRef.current) return;
    if (shouldChargeForPage && isDeducting) return;

    updatingSeenRef.current = true;
    (async () => {
      try {
        if (shouldChargeForPage) {
          await deductWithHistory(
            1,
            pageIdx === 0
              ? "search_results_initial_page"
              : `search_results_next_10_more:${targetSeen}`,
            { suppressInsufficientToast: true }
          );
        }
        failedChargePageRef.current = null;
        seenPageRef.current = targetSeen;

        const { error } = await supabase
          .from("runs_pages")
          .update({ seen_page: targetSeen })
          .eq("id", runPagesMeta.id);

        if (error) {
          logger.log("runs_pages seen_page update error:", error);
        } else {
          setRunPagesMeta((prev) =>
            prev
              ? {
                  ...prev,
                  seen_page: Math.max(prev.seen_page ?? -1, targetSeen),
                }
              : prev
          );
        }
      } catch (e) {
        failedChargePageRef.current = targetSeen;
        if (hasInsufficientCreditError(e)) {
          setIsNoCreditModalOpen(true);
        }
        if (effectiveSeen >= 0 && targetSeen > effectiveSeen) {
          setPageInUrl(effectiveSeen, "replace");
        }
        logger.log("deduct or seen_page update failed:", e);
      } finally {
        updatingSeenRef.current = false;
      }
    })();
  }, [
    ready,
    runId,
    userId,
    isPageLoaded,
    runPagesMeta,
    shouldClampPage,
    pageIdx,
    seenPage,
    deductWithHistory,
    isDeducting,
    setPageInUrl,
    shouldChargeForPage,
  ]);

  const prevPage = () => {
    if (!canPrev) return;
    setPageInUrl(pageIdx - 1, "push");
  };

  const nextPage = async () => {
    const nextIdx = pageIdx + 1;
    const effectiveSeen = Math.max(seenPage, seenPageRef.current);
    const requiresCharge = nextIdx > effectiveSeen;

    if (
      requiresCharge &&
      credits != null &&
      credits.remain_credit < MIN_CREDITS_FOR_SEARCH
    ) {
      setIsNoCreditModalOpen(true);
      return;
    }

    failedChargePageRef.current = null;

    if (nextIdx < pages.length) {
      setPageInUrl(nextIdx, "push");
      return;
    }
    if (!hasNextPage || isFetchingNextPage) return;

    const res = await fetchNextPage();
    const newCount = res.data?.pages?.length ?? pages.length;
    if (newCount > pages.length) setPageInUrl(nextIdx, "push");
  };

  // Ensure target page loaded by sequentially fetching until we have it (or can't)
  const ensuringRef = useRef(false);
  const ensurePageLoaded = useCallback(
    async (targetIdx: number) => {
      let len = data?.pages?.length ?? 0;
      if (len > targetIdx) return;

      if (isFetchingNextPage) return;

      while (len <= targetIdx) {
        if (!hasNextPage) break;
        if (isFetchingNextPage) return;

        const res = await fetchNextPage();
        const nextLen = res.data?.pages?.length ?? len;
        if (nextLen <= len) break;
        len = nextLen;
      }
    },
    [data?.pages?.length, fetchNextPage, hasNextPage, isFetchingNextPage]
  );

  useEffect(() => {
    if (!ready) return;
    if (!searchEnabled) return;
    if (!runId) return;
    if (!runPagesMeta) return;
    if (shouldClampPage) return;
    if (pageIdx <= 0) return;
    if (ensuringRef.current) return;

    ensuringRef.current = true;
    ensurePageLoaded(pageIdx).finally(() => {
      ensuringRef.current = false;
    });
  }, [
    ready,
    searchEnabled,
    runId,
    runPagesMeta,
    shouldClampPage,
    pageIdx,
    ensurePageLoaded,
  ]);

  useEffect(() => {
    if (!resultScrollStorageKey) {
      pendingResultScrollRestoreRef.current = null;
      restoredResultScrollKeyRef.current = null;
      resultScrollTopRef.current = 0;
      return;
    }

    let savedTop = 0;
    try {
      const raw = window.sessionStorage.getItem(resultScrollStorageKey);
      const parsed = raw == null ? 0 : Number(raw);
      savedTop = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      savedTop = 0;
    }

    pendingResultScrollRestoreRef.current = {
      key: resultScrollStorageKey,
      top: savedTop,
    };
    restoredResultScrollKeyRef.current = null;
  }, [resultScrollStorageKey]);

  useEffect(() => {
    const el = resultScrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      resultScrollTopRef.current = el.scrollTop;
    };

    resultScrollTopRef.current = el.scrollTop;
    el.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, [resultScrollStorageKey]);

  useEffect(() => {
    if (!resultScrollStorageKey) return;

    const persistScroll = () => {
      try {
        window.sessionStorage.setItem(
          resultScrollStorageKey,
          String(resultScrollTopRef.current)
        );
      } catch {}
    };

    window.addEventListener("pagehide", persistScroll);

    return () => {
      persistScroll();
      window.removeEventListener("pagehide", persistScroll);
    };
  }, [resultScrollStorageKey]);

  useEffect(() => {
    const restoreTarget = pendingResultScrollRestoreRef.current;
    const el = resultScrollRef.current;
    if (!restoreTarget || !el) return;
    if (restoreTarget.key !== resultScrollStorageKey) return;
    if (restoredResultScrollKeyRef.current === resultScrollStorageKey) return;

    const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    const nextTop = Math.min(restoreTarget.top, maxScrollTop);

    el.scrollTo({ top: nextTop, left: 0, behavior: "auto" });
    resultScrollTopRef.current = nextTop;

    if (!isLoading || maxScrollTop >= restoreTarget.top) {
      restoredResultScrollKeyRef.current = resultScrollStorageKey;
    }
  }, [resultScrollStorageKey, isLoading, items.length, pageIdx]);

  const onSearchFromConversation = useCallback(
    async (messageId: number): Promise<string | null> => {
      if (!queryId || !userId) return null;

      try {
        logger.log("\n 검색 messageId: ", messageId);
        setUserChatFull(false);
        const newRunId = await runSearch({
          messageId: messageId,
          queryId: queryId,
          userId: userId,
        });
        if (!newRunId) return null;

        router.replace(
          {
            pathname: router.pathname,
            query: { ...router.query, run: newRunId, page: "0" },
          },
          undefined,
          { shallow: true, scroll: false }
        );

        return newRunId;
      } catch (e) {
        logger.log("onSearchFromConversation failed:", e);
        return null;
      }
    },
    [queryId, userId, router]
  );

  const currentRunCriterias = useMemo(() => {
    if (!runData || !runData.criteria || runData.criteria.length === 0)
      return [];

    return runData.criteria;
  }, [runData]);

  const scope = useMemo(
    () => ({ type: "query", queryId: queryId ?? "" }) as ChatScope,
    [queryId]
  );

  const isStreaming = runData?.status === "streaming";

  const prevStatusRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const prev = prevStatusRef.current;
    const curr = runData?.status;

    if (prev && curr && prev !== "finished" && curr === "finished") {
      logger.log("\n\n FINISHED!! \n\n");
      setFinishedTick((t) => t + 1);
    }

    prevStatusRef.current = curr ?? undefined;
  }, [runData?.status]);

  if (!queryId)
    return (
      <AppLayout>
        <Loading className="p-6 text-xgray800" />
      </AppLayout>
    );

  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isChatFull) return;
    const container = splitRef.current;
    if (!container) return;

    e.preventDefault();
    setIsResizing(true);

    const containerRect = container.getBoundingClientRect();

    const onMouseMove = (ev: MouseEvent) => {
      const offsetX = ev.clientX - containerRect.left;
      const maxWidth = getMaxChatPanelWidth(containerRect.width);
      const nextWidth = clamp(offsetX, MIN_CHAT_PANEL_WIDTH, maxWidth);
      setChatPanelWidth(nextWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const leftPaneStyle = isChatFull
    ? undefined
    : {
        width: `${chatPanelWidth}px`,
        minWidth: `${MIN_CHAT_PANEL_WIDTH}px`,
        maxWidth: `${ABSOLUTE_MAX_CHAT_PANEL_WIDTH}px`,
      };

  const rightPaneStyle = isChatFull
    ? undefined
    : { width: `calc(100% - ${chatPanelWidth}px)` };

  return (
    <AppLayout initialCollapse={true}>
      <CreditModal
        open={isNoCreditModalOpen}
        onClose={() => setIsNoCreditModalOpen(false)}
      />
      <Head>
        <title>Harper: 검색</title>
      </Head>
      <div
        ref={splitRef}
        className={`w-full flex flex-row min-h-screen overflow-hidden ${isChatFull ? "items-center justify-center" : "items-start justify-between"}`}
      >
        <div
          style={leftPaneStyle}
          className={`relative flex-shrink-0 border-r ${
            isResizing
              ? "transition-none"
              : "transition-all duration-300 ease-in-out"
          } ${isChatFull ? "w-[50%] border-transparent" : "border-white/10"}`}
        >
          <ChatPanel
            title={queryItem?.query_keyword ?? ""}
            scope={scope}
            userId={userId}
            onSearchFromConversation={onSearchFromConversation}
            isChatFull={isChatFull}
            setIsChatFull={setUserChatFull}
            finishedTick={finishedTick}
          />
          {!isChatFull && (
            <div
              onMouseDown={handleResizeStart}
              className={`absolute top-0 -right-[3px] z-50 h-full w-[2px] cursor-col-resize ${
                isResizing ? "bg-white/50" : "bg-transparent hover:bg-white/20"
              }`}
            />
          )}
        </div>
        <div
          style={rightPaneStyle}
          className={`relative ${
            isResizing
              ? "transition-none"
              : "transition-all duration-300 ease-in-out"
          } ${isChatFull ? "w-0 opacity-0 pointer-events-none" : "opacity-100"}`}
        >
          <div
            ref={resultScrollRef}
            className={`w-full max-h-screen min-h-screen py-2 transition-all duration-200 relative overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent hover:scrollbar-thumb-white/20`}
          >
            {queryItem && runId && (
              <ResultHeader
                queryItem={queryItem}
                runId={runId}
                status={runData?.status ?? ""}
                feedback={runData?.feedback ?? 0}
                sourceType={resultSourceType}
              />
            )}

            {isLoading && (
              <div className="w-full h-full min-h-[60vh] flex items-center justify-center">
                <Loading className="p-6 text-xgray800" />
              </div>
            )}

            {runId && (
              <ResultBody
                searchEnabled={searchEnabled}
                items={items}
                userId={userId}
                isLoading={isLoading}
                pageIdx={pageIdx}
                pageIdxRaw={pageIdxRaw}
                maxPrefetchPages={MAX_PREFETCH_PAGES}
                canPrev={canPrev}
                canNext={canNext}
                isFetchingNextPage={isFetchingNextPage}
                isStreaming={isStreaming}
                onPrevPage={prevPage}
                onNextPage={nextPage}
                criterias={currentRunCriterias}
                sourceType={resultSourceType}
              />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
