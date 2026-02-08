// pages/result/[id].tsx
import AppLayout from "@/components/layout/app";
import ResultHeader from "./ResultHeader";
import ResultBody from "./ResultBody";
import ChatPanel, { ChatScope } from "@/components/chat/ChatPanel";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { useQueryDetail } from "@/hooks/useQueryDetail";
import { logger } from "@/utils/logger";
import { useCredits } from "@/hooks/useCredit";
import { useRunDetail } from "@/hooks/useRunDetail";
import { useRunPagesInfinite } from "@/hooks/useRunResults";
import { doSearch, runSearch } from "@/hooks/useStartSearch";
import { Loading } from "@/components/ui/loading";
import { supabase } from "@/lib/supabase";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const MAX_PREFETCH_PAGES = 20;

export default function ResultPage() {
  const router = useRouter();
  const { id, page, run } = router.query;
  const resultScrollRef = useRef<HTMLDivElement>(null);

  const queryId = typeof id === "string" ? id : undefined;
  const runId = typeof run === "string" ? run : undefined; // ✅ runs.id (uuid)
  const { data: runData, isLoading: isRunDetailLoading } = useRunDetail(runId);

  const [finishedTick, setFinishedTick] = useState(0);

  const { companyUser } = useCompanyUserStore();
  const userId = companyUser?.user_id;

  const { data: queryItem } = useQueryDetail(queryId);

  const derivedChatFull = !!queryId && (!runId && (queryItem?.runs?.length ?? 0) === 0);
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

  const scrollResultToTop = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = resultScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, left: 0, behavior });
  }, []);

  const setPageInUrl = useCallback(
    (nextIdx: number, mode: "push" | "replace" = "push") => {
      const method = mode === "push" ? router.push : router.replace;
      scrollResultToTop();

      method(
        {
          pathname: router.pathname,
          query: { ...router.query, page: String(nextIdx) },
        },
        undefined,
        { shallow: true, scroll: false }
      );
    },
    [router, scrollResultToTop]
  );

  const searchEnabled = useMemo(() => ready && !!runId, [ready, runId]);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useRunPagesInfinite({
    userId,
    runId,
    enabled: ready && !!runId,
  });

  const doSearchRef = useRef(false);

  useEffect(() => {
    if (isLoading) return console.log("[effect] return: isLoading");
    if (isFetchingNextPage) return console.log("[effect] return: isFetchingNextPage");
    if (!ready) return console.log("[effect] return: !ready");
    if (!runId || !queryId || !userId) return console.log("[effect] return: missing ids");
    if (doSearchRef.current) return console.log("[effect] return: doSearchRef.current");
    if (data?.pages?.length === 0) return console.log("[effect] return: pages length 0");
    if (runData?.status?.includes("error") || runData?.status?.includes("finished")) return console.log("[effect] return: finished/error");

    console.log("[ResultPage effect] doSearch about to run", { runId, pageIdx, pagesLen: data?.pages?.length, status: runData?.status });

    doSearchRef.current = true;
    doSearch({ runId: runId, queryId: queryId, userId: userId, pageIdx: pageIdx });
  }, [data, runData, isLoading, isFetchingNextPage, runId, ready, pageIdx, queryId, userId]);

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
  const { credits, deduct, isDeducting } = useCredits();

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
    updatingSeenRef.current = false;
    isRunPagesMetaLoadingRef.current = false;
    if (runId) loadRunPagesMeta();
  }, [runId, loadRunPagesMeta]);

  useEffect(() => {
    if (!runPagesMeta && pages.length > 0) loadRunPagesMeta();
  }, [runPagesMeta, pages.length, loadRunPagesMeta]);

  const seenPage = runPagesMeta?.seen_page ?? -1;
  const isPageLoaded = pageIdx < pages.length && !isLoading;
  const shouldChargeForPage = items.length >= 10;

  useEffect(() => {
    if (!ready || !runId || !userId) return;
    if (!isPageLoaded) return;
    if (!runPagesMeta) return;

    const targetSeen = pageIdx;
    const effectiveSeen = Math.max(seenPage, seenPageRef.current);
    if (targetSeen <= effectiveSeen) return;
    if (updatingSeenRef.current) return;
    if (shouldChargeForPage && isDeducting) return;

    updatingSeenRef.current = true;
    (async () => {
      try {
        if (shouldChargeForPage) {
          await deduct(1);
        }
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
              ? { ...prev, seen_page: Math.max(prev.seen_page ?? -1, targetSeen) }
              : prev
          );
        }
      } catch (e) {
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
    pageIdx,
    seenPage,
    deduct,
    isDeducting,
    shouldChargeForPage,
  ]);

  const nextWillCharge =
    canNext &&
    pageIdx + 1 > Math.max(seenPage, seenPageRef.current) &&
    (nextPageKnownCount == null || nextPageKnownCount >= 10);

  const prevPage = () => {
    if (!canPrev) return;
    setPageInUrl(pageIdx - 1, "push");
  };

  const nextPage = async () => {
    if (pageIdx + 1 < pages.length) {
      setPageInUrl(pageIdx + 1, "push");
      return;
    }
    if (!hasNextPage || isFetchingNextPage) return;

    const res = await fetchNextPage();
    const newCount = res.data?.pages?.length ?? pages.length;
    if (newCount > pages.length) setPageInUrl(pageIdx + 1, "push");
  };

  // Ensure target page loaded by sequentially fetching until we have it (or can't)
  const ensuringRef = useRef(false);
  const ensurePageLoaded = useCallback(
    async (targetIdx: number) => {
      let len = data?.pages?.length ?? 0;
      if (len > targetIdx) return;

      if (isFetchingNextPage) return;

      while (len <= targetIdx) {
        logger.log("ensurePageLoaded: ", len, targetIdx);
        if (!hasNextPage) break;
        if (isFetchingNextPage) return;

        const res = await fetchNextPage();
        const nextLen = res.data?.pages?.length ?? len;
        if (nextLen <= len) break;
        len = nextLen;
      }
    },
    [data?.pages?.length, fetchNextPage, hasNextPage]
  );

  useEffect(() => {
    if (!ready) return;
    if (!searchEnabled) return;
    if (!runId) return;
    if (pageIdx <= 0) return;
    if (ensuringRef.current) return;

    ensuringRef.current = true;
    ensurePageLoaded(pageIdx).finally(() => {
      ensuringRef.current = false;
    });
  }, [ready, searchEnabled, runId, pageIdx, ensurePageLoaded]);

  useEffect(() => {
    scrollResultToTop();
  }, [pageIdx, scrollResultToTop]);

  const onSearchFromConversation = useCallback(
    async (messageId: number) => {
      if (!queryId || !userId) return;

      try {
        logger.log("\n 검색 messageId: ", messageId);
        doSearchRef.current = false;
        setUserChatFull(false);
        const newRunId = await runSearch({ messageId: messageId, queryId: queryId, userId: userId });
        if (!newRunId) return;

        router.replace(
          {
            pathname: router.pathname,
            query: { ...router.query, run: newRunId, page: "0" },
          },
          undefined,
          { shallow: true, scroll: false }
        );

        // 여기서 함수 실행
      } catch (e) {
        logger.log("onSearchFromConversation failed:", e);
      }
    },
    [queryId, userId, router, credits]
  );

  const currentRunCriterias = useMemo(() => {
    if (!runData || !runData.criteria || runData.criteria.length === 0) return [];

    return runData.criteria
  }, [runData, runId, isRunDetailLoading]);

  const scope = useMemo(
    () => ({ type: "query", queryId: queryId ?? "" } as ChatScope),
    [queryId]
  );


  const prevStatusRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const prev = prevStatusRef.current;
    const curr = runData?.status;

    if (prev && curr && prev !== "finished" && curr === "finished") {
      logger.log("\n\n FINISHED!! \n\n")
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

  return (
    <AppLayout initialCollapse={true}>
      <div className={`w-full flex flex-row min-h-screen overflow-hidden ${isChatFull ? "items-center justify-center" : "items-start justify-between"}`}>
        <div className={`flex-shrink-0 transition-all duration-300 ease-in-out border-r ${isChatFull ? "w-[50%] border-transparent" : "w-[30%] min-w-[390px] border-white/10"}`}>
          <ChatPanel
            title={queryItem?.query_keyword ?? ""}
            scope={scope}
            userId={userId}
            onSearchFromConversation={onSearchFromConversation}
            isChatFull={isChatFull}
            setIsChatFull={setUserChatFull}
            finishedTick={finishedTick}
          />
        </div>
        <div className={`relative transition-all duration-300 ease-in-out ${isChatFull ? "w-0 opacity-0 pointer-events-none" : "w-[70%] opacity-100"}`}>
          {/* <CandidateModalRoot /> */}
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
              />
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
                onPrevPage={prevPage}
                onNextPage={nextPage}
                criterias={currentRunCriterias}
                nextWillCharge={nextWillCharge}
              />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
