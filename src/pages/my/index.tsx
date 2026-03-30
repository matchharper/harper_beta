import React, { useEffect, useMemo, useState } from "react";
import type { NextPage } from "next";
import { motion } from "framer-motion";
import {
  ArrowUp,
  Github,
  GraduationCap,
  Linkedin,
  Loader2,
  MessageSquareIcon,
} from "lucide-react";
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
import {
  SearchSource,
  isEnabledSearchSource,
} from "@/lib/searchSource";
import { Tooltips } from "@/components/ui/tooltip";

const PLACEHOLDER_SWITCH_MS = 4500;
const PLACEHOLDER_SLIDE_MS = 500;
const PLACEHOLDER_LINE_HEIGHT_PX = 24;
const SEARCH_SOURCE_STORAGE_KEY = "harper_my_search_source";
type SearchSourceConfig = {
  label: string;
  prompt: string;
  desc: string;
  placeholder: string;
  placeholders: string[];
  examples: Array<{
    label: string;
    query: string;
  }>;
  Icon: typeof Linkedin;
};

const Home: NextPage = () => {
  const [query, setQuery] = useState("");
  const [selectedSource, setSelectedSource] =
    useState<SearchSource>("linkedin");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [nextPlaceholderIdx, setNextPlaceholderIdx] = useState<number | null>(
    null
  );
  const [isPlaceholderAnimating, setIsPlaceholderAnimating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasHydratedSourcePreference, setHasHydratedSourcePreference] =
    useState(false);
  const { locale, m } = useMessages();
  const [isNoCreditModalOpen, setIsNoCreditModalOpen] = useState(false);

  const { companyUser } = useCompanyUserStore();
  const { credits } = useCredits();
  const { open: openFeedbackModal } = useFeedbackModalStore();
  const router = useRouter();
  const isQueryEmpty = query.trim().length === 0;
  const canSend = query.trim().length > 0 && Boolean(credits) && !isLoading;
  const searchSourceConfigs = useMemo<
    Record<SearchSource, SearchSourceConfig>
  >(() => {
    const linkedinPlaceholders = m.home.queryPlaceholders?.length
      ? [...m.home.queryPlaceholders]
      : [m.home.queryPlaceholder];
    const linkedinExamples = m.home.examples.map((example) => ({
      label: example.label,
      query: example.query,
    }));

    if (locale === "ko") {
      return {
        linkedin: {
          label: "LinkedIn",
          prompt: "어떤 인재를 찾고 계신가요?",
          desc: "경력 / 학력 등을 중심으로 인재를 찾습니다.",
          placeholder: m.home.queryPlaceholder,
          placeholders: linkedinPlaceholders,
          examples: linkedinExamples,
          Icon: Linkedin,
        },
        scholar: {
          label: "Publications",
          prompt: "어떤 인재를 찾고 계신가요?",
          desc: "연구 기록 / 논문을 중심으로 연구자를 찾습니다.",
          placeholder:
            "ICML / NeurIPS에서 LLM alignment 논문을 낸 박사급 연구자",
          placeholders: [
            "ICML / NeurIPS에서 LLM alignment 논문을 낸 박사급 연구자",
            "CVPR / ICCV에서 3D vision 또는 diffusion 연구를 한 컴퓨터비전 연구자",
            "CHI / UIST에서 HCI + AI 논문을 발표한 applied research 인재",
            "KDD / WWW / RecSys에서 추천시스템 또는 검색 랭킹 연구를 한 연구자",
            "RSS / CoRL에서 robotics 또는 embodied AI 성과가 있는 연구자",
          ],
          examples: [
            {
              label: "LLM",
              query:
                "NeurIPS / ICLR에서 LLM alignment 또는 reasoning 관련 논문을 발표했고 최근 3년간 활발히 연구한 박사급 연구자",
            },
            {
              label: "Vision",
              query:
                "CVPR / ICCV / ECCV에서 3D vision, video understanding, diffusion 관련 논문 경험이 있는 컴퓨터비전 연구자",
            },
            {
              label: "Recsys",
              query:
                "KDD / WWW / RecSys에서 추천시스템 또는 검색 랭킹 논문을 발표한 applied ML researcher",
            },
          ],
          Icon: GraduationCap,
        },
        github: {
          label: "Open Source",
          prompt: "어떤 빌더를 찾고 계신가요?",
          desc: "Github 활동 / 오픈소스 기여 중심으로 Github profile을 찾습니다.",
          placeholder:
            "TypeScript와 React 생태계에서 오픈소스 기여가 꾸준한 프론트엔드 엔지니어",
          placeholders: [
            "TypeScript와 React 생태계에서 오픈소스 기여가 꾸준한 프론트엔드 엔지니어",
            "Go / Kubernetes 기반 인프라를 운영하고 주요 OSS에 PR을 남긴 백엔드 엔지니어",
            "PyTorch / Hugging Face 프로젝트를 공개했거나 활발히 기여한 ML 엔지니어",
            "Rust 기반 개발자 툴링을 만들고 GitHub stars를 확보한 시스템 엔지니어",
            "Next.js 또는 React Native로 제품을 직접 출시한 풀스택 개발자",
          ],
          examples: [
            {
              label: "Backend",
              query:
                "Go 또는 Java로 대규모 백엔드 서비스를 운영했고 Kubernetes / infrastructure 관련 오픈소스에 의미 있는 PR 또는 maintainer 경험이 있는 엔지니어",
            },
            {
              label: "Frontend",
              query:
                "TypeScript / React 기반 라이브러리나 디자인 시스템을 공개했고 GitHub에서 지속적으로 이슈 대응과 릴리스를 해온 프론트엔드 엔지니어",
            },
            {
              label: "ML",
              query:
                "PyTorch, Transformers, evaluation tooling 등 ML 오픈소스를 직접 만들거나 활발히 기여한 머신러닝 엔지니어",
            },
          ],
          Icon: Github,
        },
      };
    }

    return {
      linkedin: {
        label: "LinkedIn",
        prompt: "Who are you looking for through LinkedIn career history?",
        desc: "Career history / education / etc. to find candidates.",
        placeholder: m.home.queryPlaceholder,
        placeholders: linkedinPlaceholders,
        examples: linkedinExamples,
        Icon: Linkedin,
      },
      scholar: {
        label: "Publications",
        prompt:
          "Who are you looking for through Google Scholar research history?",
        desc: "Research history / papers to find researchers.",
        placeholder:
          "PhD-level researcher with LLM alignment papers at ICML or NeurIPS",
        placeholders: [
          "PhD-level researcher with LLM alignment papers at ICML or NeurIPS",
          "Computer vision researcher with 3D vision or diffusion papers at CVPR or ICCV",
          "Applied researcher who published HCI + AI work at CHI or UIST",
          "Researcher with papers on recommendation systems or search ranking at KDD, WWW, or RecSys",
          "Researcher with strong results in robotics or embodied AI at RSS or CoRL",
        ],
        examples: [
          {
            label: "LLM",
            query:
              "PhD-level researcher who has published on LLM alignment or reasoning at NeurIPS / ICLR and stayed active over the last 3 years",
          },
          {
            label: "Vision",
            query:
              "Computer vision researcher with publications in 3D vision, video understanding, or diffusion at CVPR / ICCV / ECCV",
          },
          {
            label: "Recsys",
            query:
              "Applied ML researcher with publications on recommendation systems or search ranking at KDD / WWW / RecSys",
          },
        ],
        Icon: GraduationCap,
      },
      github: {
        label: "Open Source",
        prompt: "Who are you looking for through GitHub activity?",
        desc: "GitHub activity / open-source contributions to find developers.",
        placeholder:
          "Frontend engineer with consistent open-source contributions in the TypeScript and React ecosystem",
        placeholders: [
          "Frontend engineer with consistent open-source contributions in the TypeScript and React ecosystem",
          "Backend engineer who has operated Go or Kubernetes infrastructure and contributed meaningful PRs to major OSS projects",
          "ML engineer who has shipped public projects or made active contributions to PyTorch or Hugging Face repositories",
          "Systems engineer who built Rust-based developer tooling and earned GitHub stars",
          "Full-stack developer who has shipped products directly with Next.js or React Native",
        ],
        examples: [
          {
            label: "Backend",
            query:
              "Engineer who has operated large-scale backend services in Go or Java and made meaningful PRs or maintainer-level contributions to Kubernetes or infrastructure OSS",
          },
          {
            label: "Frontend",
            query:
              "Frontend engineer who has published TypeScript / React libraries or design systems and consistently handled issues and releases on GitHub",
          },
          {
            label: "ML",
            query:
              "Machine learning engineer who has built or actively contributed to ML open-source projects such as PyTorch, Transformers, or evaluation tooling",
          },
        ],
        Icon: Github,
      },
    };
  }, [
    locale,
    m.home.examples,
    m.home.queryPlaceholder,
    m.home.queryPlaceholders,
  ]);
  const selectedSourceConfig = searchSourceConfigs[selectedSource];
  const placeholderOptions = useMemo(() => {
    if (selectedSourceConfig.placeholders.length) {
      return selectedSourceConfig.placeholders;
    }
    return [selectedSourceConfig.placeholder];
  }, [selectedSourceConfig.placeholder, selectedSourceConfig.placeholders]);
  const activePlaceholder =
    placeholderOptions[placeholderIdx % placeholderOptions.length] ??
    selectedSourceConfig.placeholder;
  const incomingPlaceholder =
    placeholderOptions[
      (nextPlaceholderIdx ?? placeholderIdx + 1) % placeholderOptions.length
    ] ?? activePlaceholder;

  const qc = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedSource = window.localStorage.getItem(SEARCH_SOURCE_STORAGE_KEY);
    if (savedSource && isEnabledSearchSource(savedSource)) {
      setSelectedSource(savedSource);
    }
    setHasHydratedSourcePreference(true);
  }, []);

  useEffect(() => {
    if (!isEnabledSearchSource(selectedSource)) {
      setSelectedSource("linkedin");
    }
  }, [selectedSource]);

  useEffect(() => {
    if (!hasHydratedSourcePreference || typeof window === "undefined") return;
    window.localStorage.setItem(SEARCH_SOURCE_STORAGE_KEY, selectedSource);
  }, [hasHydratedSourcePreference, selectedSource]);

  useEffect(() => {
    setPlaceholderIdx(0);
    setNextPlaceholderIdx(null);
    setIsPlaceholderAnimating(false);
  }, [locale, placeholderOptions.length, selectedSource]);

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
      body: JSON.stringify({ queryText: query, type: selectedSource }),
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
            {selectedSourceConfig.prompt}
          </h1>

          <form className="mt-8 w-full max-w-[640px]">
            <div
              className={[
                "w-full relative rounded-3xl p-1 bg-white/5 border border-white/10",
              ].join(" ")}
            >
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void onSubmit();
                    }
                  }}
                  placeholder=""
                  aria-label={selectedSourceConfig.prompt}
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
              <div className="flex flex-row items-center justify-center gap-2 absolute right-3 bottom-3">
                <button
                  onClick={onSubmit}
                  disabled={!canSend}
                  className={[
                    "inline-flex items-center justify-center rounded-full cursor-pointer hover:opacity-90",
                    "h-9 w-9",
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
                    <ArrowUp size={18} strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>
          </form>
          {/* <fieldset
            className="mt-4"
            aria-label={
              locale === "ko" ? "검색 소스 선택" : "Choose a search source"
            }
          >
            <div
              className="flex items-center rounded-full border border-white/5 bg-white/5 p-0.5"
              role="radiogroup"
              aria-label={
                locale === "ko" ? "검색 소스 선택" : "Choose a search source"
              }
            >
              {SEARCH_SOURCE_VALUES.map((source) => {
                const option = searchSourceConfigs[source];
                const checked = selectedSource === source;

                return (
                  <Tooltips key={source} text={option.desc}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => setSelectedSource(source)}
                      className="relative flex min-w-0 flex-1 items-center justify-center rounded-full px-6 py-2 transition-colors duration-200"
                    >
                      {checked && (
                        <motion.span
                          layoutId="search-source-indicator"
                          className="absolute inset-0 rounded-full bg-white shadow-[0_10px_30px_rgba(255,255,255,0.12)]"
                          transition={{
                            type: "spring",
                            stiffness: 380,
                            damping: 34,
                          }}
                        />
                      )}
                      <span
                        className={[
                          "relative z-10 inline-flex items-center gap-2 whitespace-nowrap text-xs font-normal sm:text-[13px] transition-all duration-300",
                          checked ? "text-black" : "text-hgray800",
                        ].join(" ")}
                      >
                        <span>{option.label}</span>
                      </span>
                    </button>
                  </Tooltips>
                );
              })}
            </div>
          </fieldset> */}
          <div className="grid grid-cols-1 md:grid-cols-3 items-start justify-between gap-4 mt-[25vh] max-w-[1080px] w-[90%] pb-20">
            {selectedSourceConfig.examples.map((example) => (
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
