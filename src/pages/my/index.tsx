import React, { useEffect, useMemo, useState } from "react";
import type { NextPage } from "next";
import { ArrowUp, Loader2, MessageSquareIcon } from "lucide-react";
import AppLayout from "@/components/layout/app";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { useRouter } from "next/router";
import { useQueryClient } from "@tanstack/react-query";
import { refreshQueriesHistory } from "@/hooks/useSearchHistory";
import { useCredits } from "@/hooks/useCredit";
import { MIN_CREDITS_FOR_SEARCH } from "@/utils/constantkeys";
import { supabase } from "@/lib/supabase";
import { useMessages } from "@/i18n/useMessage";
import { ensureGroupBy } from "@/utils/textprocess";
import { firstSqlPrompt } from "@/lib/prompt";
import ConfirmModal from "@/components/Modal/ConfirmModal";
import { useFeedbackModalStore } from "@/store/useFeedbackModalStore";

const PLACEHOLDER_SWITCH_MS = 4500;
const PLACEHOLDER_SLIDE_MS = 500;
const PLACEHOLDER_LINE_HEIGHT_PX = 24;

const Home: NextPage = () => {
  const [query, setQuery] = useState("");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [nextPlaceholderIdx, setNextPlaceholderIdx] = useState<number | null>(
    null
  );
  const [isPlaceholderAnimating, setIsPlaceholderAnimating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { m } = useMessages();
  const [isNoCreditModalOpen, setIsNoCreditModalOpen] = useState(false);

  const { companyUser } = useCompanyUserStore();
  const { credits } = useCredits();
  const { open: openFeedbackModal } = useFeedbackModalStore();
  const router = useRouter();
  const isQueryEmpty = query.trim().length === 0;
  const canSend = query.trim().length > 0 && Boolean(credits) && !isLoading;
  const placeholderOptions = useMemo(() => {
    if (m.home.queryPlaceholders?.length) {
      return m.home.queryPlaceholders;
    }
    return [m.home.queryPlaceholder];
  }, [m.home.queryPlaceholder, m.home.queryPlaceholders]);
  const activePlaceholder =
    placeholderOptions[placeholderIdx % placeholderOptions.length] ??
    m.home.queryPlaceholder;
  const incomingPlaceholder =
    placeholderOptions[
      (nextPlaceholderIdx ?? placeholderIdx + 1) % placeholderOptions.length
    ] ?? activePlaceholder;

  const qc = useQueryClient();

  useEffect(() => {
    setPlaceholderIdx((prev) => prev % placeholderOptions.length);
    setNextPlaceholderIdx(null);
    setIsPlaceholderAnimating(false);
  }, [placeholderOptions.length]);

  useEffect(() => {
    if (!isQueryEmpty) {
      setNextPlaceholderIdx(null);
      setIsPlaceholderAnimating(false);
      return;
    }
    if (placeholderOptions.length <= 1 || isPlaceholderAnimating) return;

    const timer = window.setTimeout(() => {
      setNextPlaceholderIdx((placeholderIdx + 1) % placeholderOptions.length);
      setIsPlaceholderAnimating(true);
    }, PLACEHOLDER_SWITCH_MS);

    return () => window.clearTimeout(timer);
  }, [
    isPlaceholderAnimating,
    isQueryEmpty,
    placeholderIdx,
    placeholderOptions.length,
  ]);

  useEffect(() => {
    if (!isPlaceholderAnimating || nextPlaceholderIdx === null) return;

    const timer = window.setTimeout(() => {
      setPlaceholderIdx(nextPlaceholderIdx);
      setNextPlaceholderIdx(null);
      setIsPlaceholderAnimating(false);
    }, PLACEHOLDER_SLIDE_MS);

    return () => window.clearTimeout(timer);
  }, [isPlaceholderAnimating, nextPlaceholderIdx]);

  const onSubmit = async (e?: React.FormEvent) => {
    setIsLoading(true);
    e?.preventDefault();
    e?.stopPropagation();
    if (!canSend) {
      setIsLoading(false);
      return;
    }
    if (
      credits?.remain_credit &&
      credits.remain_credit <= MIN_CREDITS_FOR_SEARCH
    ) {
      setIsNoCreditModalOpen(true);
      setIsLoading(false);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      setIsLoading(false);
      alert("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
      return;
    }

    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };

    // 여기서 첫 메세지까지 들어감.
    const response = await fetch("/api/search/create", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ queryText: query }),
    });
    const data = await response.json();

    if (data.error) {
      alert(data.error);
      setIsLoading(false);
      return;
    }
    const queryId = data.id;
    fetch("/api/search/keyword", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ queryId, queryText: query }),
    }).catch((err) => console.error("keyword enqueue failed", err));
    refreshQueriesHistory(qc, companyUser.user_id);
    setIsLoading(false);
    setQuery("");
    router.push(`/my/c/${queryId}`);
  };

  const testSqlQuery = async () => {
    const start = performance.now();
    console.log("testSqlQuery start");
    const sql = ``;
    const newSql = ensureGroupBy(sql, "");

    const { data: data1, error: error1 } = await supabase.rpc(
      "set_timeout_and_execute_raw_sql",
      {
        sql_query: newSql,
        page_idx: 0,
        limit_num: 10,
        offset_num: 0,
      }
    );

    console.log(data1, error1);
    const end = performance.now();
    console.log("testSqlQuery time", end - start);
  };

  const testLLM = async () => {
    console.log("testLLM start");
    const systemPrompt = `You are a head hunting expertand SQL Query parser. Your input is a natural-language request describing criteria for searching job candidates.`;

    const userPrompt = `
${firstSqlPrompt}
Natural Language Query: 네이버, 카카오, 라인, 쿠팡, 배달의민족 등 국내 주요 IT 기업에서 프로덕트 매니저(PM/PO)로 근무한 경험이 있으며, 개발 프로세스에 대한 깊은 이해도나 실제 개발 배경을 가진 인재를 찾습니다.
Criteria: [네카라쿠배 근무 경력, 프로덕트 매니저(PM/PO) 직무 경험, 개발자 출신 또는 CS 전공자]`;

    const response = await fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemPrompt: systemPrompt,
        userPrompt: userPrompt,
      }),
    });
    const data = await response.json();
    console.log(data);
  };

  return (
    <AppLayout initialCollapse={false}>
      <ConfirmModal
        open={isNoCreditModalOpen}
        onClose={() => setIsNoCreditModalOpen(false)}
        onConfirm={() => setIsNoCreditModalOpen(false)}
        title="이번 달 월 검색 한도를 모두 사용했습니다."
        description="다음 이용 기간이 시작된 뒤 다시 시도하거나, 플랜 변경으로 월 검색 한도를 늘려보세요."
        confirmLabel="확인"
      />
      <main className="flex-1 flex relative font-sans items-center justify-center px-6 w-full pt-[25vh]">
        <div className="absolute top-2 right-2 flex flex-row items-end gap-2">
          {/* <div
            onClick={() => router.push("/my/scout")}
            className="cursor-pointer hover:bg-white/10 transition text-xs text-accenta1/90 px-3.5 py-2 rounded-full bg-white/5 font-light flex flex-row items-center gap-1"
          >
            <Sparkles size={12} /> 인재 추천을 받고 싶다면?
          </div> */}
          <button
            onClick={openFeedbackModal}
            className="cursor-pointer hover:bg-white/10 transition text-sm text-hgray900 px-4 py-1.5 rounded-full bg-white/5 font-normal flex flex-row items-center gap-2"
          >
            <MessageSquareIcon size={14} />
            피드백
          </button>
        </div>
        <div className="w-full flex flex-col items-center">
          <h1
            className="text-2xl sm:text-3xl font-medium tracking-tight text-center leading-relaxed"
            // onClick={testSqlQuery}
          >
            {m.system.hello}, {companyUser?.name.split(" ")[0]}님
            <div className="h-3" />
            {m.system.intro}
          </h1>

          <form className="mt-8 w-full max-w-[640px]">
            <div className="w-full relative rounded-3xl p-1 bg-white/5 border border-white/10">
              <div className="relative rounded-2xl backdrop-blur-xl">
                {isQueryEmpty && (
                  <div
                    className="pointer-events-none absolute left-4 right-20 top-4 h-6 overflow-hidden text-[15px] leading-6 text-hgray600"
                    aria-hidden="true"
                  >
                    <div
                      className="flex flex-col"
                      style={{
                        transition: isPlaceholderAnimating
                          ? `transform ${PLACEHOLDER_SLIDE_MS}ms ease-out`
                          : "none",
                        transform: isPlaceholderAnimating
                          ? `translateY(-${PLACEHOLDER_LINE_HEIGHT_PX}px)`
                          : "translateY(0)",
                      }}
                    >
                      <div className="h-6 whitespace-nowrap overflow-hidden text-ellipsis">
                        {activePlaceholder}
                      </div>
                      <div className="h-6 whitespace-nowrap overflow-hidden text-ellipsis">
                        {incomingPlaceholder}
                      </div>
                    </div>
                  </div>
                )}
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder=""
                  aria-label={m.home.queryPlaceholder}
                  rows={4}
                  autoFocus={true}
                  className={[
                    "w-full resize-none rounded-2xl bg-transparent",
                    "px-4 py-4 text-[15px] leading-6 text-white/95",
                    "placeholder:text-transparent",
                    "outline-none",
                    "min-h-[140px]",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                  ].join(" ")}
                />
              </div>
              <div className="flex flex-row items-center justify-center gap-2 absolute right-5 bottom-5">
                {/* <Tooltips text="Search by JD file or link">
                    <button
                      disabled={!canSend}
                      className={[
                        "inline-flex items-center justify-center rounded-full cursor-pointer hover:opacity-90",
                        "h-11 w-11 bg-white/10 text-white",
                        "transition active:scale-[0.98]",
                      ].join(" ")}
                      aria-label="Send"
                    >
                      <Plus size={20} color="white" />
                    </button>
                  </Tooltips> */}
                <button
                  onClick={onSubmit}
                  disabled={!canSend}
                  className={[
                    "inline-flex items-center justify-center rounded-full cursor-pointer hover:opacity-90",
                    "h-11 w-11",
                    canSend
                      ? "bg-accenta1 text-black cursor-not-allowed"
                      : "bg-accenta1/50 text-black",
                    "transition active:scale-[0.98]",
                  ].join(" ")}
                  aria-label="Send"
                >
                  {isLoading ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <ArrowUp size={20} />
                  )}
                </button>
              </div>
            </div>
          </form>
          <div className="grid grid-cols-3 items-start justify-between gap-4 mt-[25vh] max-w-[1080px] w-[90%] pb-20">
            {m.home.examples.map((example) => (
              <ExampleQuery
                key={`${example.label}-${example.query}`}
                label={example.label}
                query={example.query}
                onClick={(v) => setQuery(v)}
              />
            ))}
          </div>

          <div className="flex flex-row items-center gap-2"></div>
        </div>
      </main>
    </AppLayout>
  );
};

export default Home;

const ExampleQuery = ({
  label,
  query,
  onClick,
}: {
  label: string;
  query: string;
  onClick: (v: string) => void;
}) => {
  return (
    <div
      className={[
        "group relative col-span-1 cursor-pointer",
        "rounded-2xl py-5 px-6",
        "bg-white/5 text-hgray900 text-sm",
        "border border-white/0",
        "transition-all duration-200 ease-out",
        "hover:border-white/5 hover:-translate-y-[2px]",
        "active:translate-y-[0px] active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
      ].join(" ")}
      onClick={() => onClick(query)}
      role="button"
      tabIndex={0}
    >
      <div className="text-xs text-accenta1 mb-2">{label}</div>
      {query}
    </div>
  );
};
