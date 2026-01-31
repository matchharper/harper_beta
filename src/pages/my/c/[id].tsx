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
import { MIN_CREDITS_FOR_SEARCH } from "@/utils/constantkeys";
import { useCredits } from "@/hooks/useCredit";
import { showToast } from "@/components/toast/toast";
import { useRunDetail } from "@/hooks/useRunDetail";
import { useRunPagesInfinite } from "@/hooks/useRunResults";
import { doSearch, runSearch } from "@/hooks/useStartSearch";
import { scrollToTop } from "@/utils/func";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const MAX_PREFETCH_PAGES = 20;

export default function ResultPage() {
  const router = useRouter();
  const { id, page, run } = router.query;

  const queryId = typeof id === "string" ? id : undefined;
  const runId = typeof run === "string" ? run : undefined; // ✅ runs.id (uuid)
  const { data: runData, isLoading: isRunDetailLoading } = useRunDetail(runId);

  const [isChatFull, setIsChatFull] = useState(false);
  const [finishedTick, setFinishedTick] = useState(0);

  const { companyUser } = useCompanyUserStore();
  const userId = companyUser?.user_id;

  const { data: queryItem, isLoading: isQueryDetailLoading } =
    useQueryDetail(queryId);

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

  const setPageInUrl = useCallback(
    (nextIdx: number, mode: "push" | "replace" = "push") => {
      const method = mode === "push" ? router.push : router.replace;
      scrollToTop();

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
    if (queryItem && queryItem.runs && queryItem.runs.length === 0 && !runId) {
      setIsChatFull(true);
    } else {
      setIsChatFull(false);
    }
  }, [queryItem, runId, router]);

  const pages = data?.pages ?? [];
  const current = pages[pageIdx];
  const items = current?.items ?? [];
  const { credits } = useCredits();

  const canPrev = pageIdx > 0;
  const canNext = pageIdx + 1 < pages.length || !!hasNextPage;

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

  /**
   * ✅ ChatPanel에서 confirm 눌렀을 때:
   * - messageId 기반으로 run 생성 + 검색 실행
   * - URL을 newRunId로 이동 (?run=...&page=0)
   */
  const onSearchFromConversation = useCallback(
    async (messageId: number) => {
      if (!queryId || !userId) return;
      if (credits && credits.remain_credit <= MIN_CREDITS_FOR_SEARCH) {
        showToast({
          message: "크레딧이 부족합니다.",
          variant: "white",
        });
        return;
      }

      try {
        logger.log("\n 검색 messageId: ", messageId);
        doSearchRef.current = false;
        setIsChatFull(false);
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
  }, [runData, runId]);

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


  if (!queryId) return <AppLayout>Loading...</AppLayout>;

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
            setIsChatFull={setIsChatFull}
            finishedTick={finishedTick}
          />
        </div>
        <div className={`relative transition-all duration-300 ease-in-out ${isChatFull ? "w-0 opacity-0 pointer-events-none" : "w-[70%] opacity-100"}`}>
          {/* <CandidateModalRoot /> */}
          <div
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
                queryItem={queryItem}
                isLoading={isLoading}
                isQueryDetailLoading={isQueryDetailLoading}
                pageIdx={pageIdx}
                pageIdxRaw={pageIdxRaw}
                maxPrefetchPages={MAX_PREFETCH_PAGES}
                canPrev={canPrev}
                canNext={canNext}
                isFetchingNextPage={isFetchingNextPage}
                onPrevPage={prevPage}
                onNextPage={nextPage}
                criterias={currentRunCriterias}
              />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
