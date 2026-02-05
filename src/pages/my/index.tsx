import React, { useMemo, useState } from "react";
import type { NextPage } from "next";
import { ArrowUp, Loader2, Plus, SendHorizonal } from "lucide-react";
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

const Home: NextPage = () => {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { m } = useMessages();
  const [isNoCreditModalOpen, setIsNoCreditModalOpen] = useState(false);

  const { companyUser } = useCompanyUserStore();
  const { credits } = useCredits();
  const router = useRouter();
  const canSend = query.trim().length > 0 && credits && !isLoading;

  const qc = useQueryClient();

  const onSubmit = async (e?: React.FormEvent) => {
    setIsLoading(true);
    e?.preventDefault();
    e?.stopPropagation();
    if (!canSend) {
      setIsLoading(false);
      return;
    }
    if (credits.remain_credit <= MIN_CREDITS_FOR_SEARCH) {
      setIsNoCreditModalOpen(true);
      setIsLoading(false);
      return;
    }

    // 여기서 첫 메세지까지 들어감.
    const response = await fetch("/api/search/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queryText: query, userId: companyUser.user_id }),
    });
    const data = await response.json();

    if (data.error) {
      alert(data.error);
      return;
    }
    const queryId = data.id;
    fetch("/api/search/keyword", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    const sql =
      ``;
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
      body: JSON.stringify({ systemPrompt: systemPrompt, userPrompt: userPrompt }),
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
        title="크레딧이 모두 소진되었습니다."
        description="크레딧 충전 후 다시 시도해주세요."
        confirmLabel="확인"
      />
      <main className="flex-1 flex font-sans items-center justify-center px-6 w-full pt-[25vh]">
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
              <div className="rounded-2xl backdrop-blur-xl">
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={m.home.queryPlaceholder}
                  rows={4}
                  autoFocus={true}
                  className={[
                    "w-full resize-none rounded-2xl bg-transparent",
                    "px-4 py-4 text-[15px] leading-6 text-white/95",
                    "placeholder:text-hgray600",
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
      <div className="text-xs text-accenta1 mb-2">
        {label}
      </div>
      {query}
    </div>
  );
};
