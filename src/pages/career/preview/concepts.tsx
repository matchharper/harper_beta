// career-i18n-skip-file: Local-only concept preview. All data and conversation feedback are synthetic.
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bookmark,
  CalendarDays,
  ChevronRight,
  Table2,
  X,
} from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { PreviewUI } from "@/components/career/chat/elements/DocumentPreviewCards";
import { Typography } from "@/components/ui/typography";
import { ChatComposerFrame } from "@/components/chat/ChatComposer";
import { MessagesProvider } from "@/i18n/useMessage";
import {
  concepts,
  jobs,
  type Job,
  type ConceptId,
} from "@/components/career/preview/concepts/data";
import {
  Quiet,
  type Context,
  type ChatContext,
  type Practice,
} from "@/components/career/preview/concepts/shared";
import { BrowsePane } from "@/components/career/preview/concepts/BrowsePane";
import {
  Application,
  ApplicationChecklist,
  usePreviewApplication,
} from "@/components/career/preview/concepts/Application";
import { OpportunityWorkspace } from "@/components/career/preview/concepts/OpportunityWorkspace";
import OpportunityCard from "@/components/career/history/OpportunityCard";
import { toOpportunity } from "@/components/career/preview/concepts/opportunityFixture";
import s from "@/components/career/preview/concepts/Concepts.module.css";

type Message = {
  role: "user" | "assistant";
  text: string;
  caption?: string;
  context?: ChatContext;
};
function ContextLabel({ context }: { context: ChatContext }) {
  return context.items?.length ? (
    <details className={s.contextLabel}>
      <summary>{context.label}</summary>
      <ul>
        {context.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </details>
  ) : (
    <span className={s.contextLabel}>{context.label}</span>
  );
}
const conversations: Record<ConceptId, Message[]> = {
  map: [
    {
      role: "user",
      text: "이번에는 적극적으로 옮겨보려고 해요. FDE 쪽으로 가능한 곳을 좀 넓게 보고 싶어요.",
    },
    {
      role: "assistant",
      text: "노바랩스와 오빗AI부터 보세요. 고객의 문제를 정의하고 배포까지 맡는 역할이라 지금 해온 일과 가장 가까워요.\n\nML을 더 깊게 하거나 초기 팀에서 제품 전체를 맡는 곳까지, 총 16곳을 정리했어요.",
    },
  ],
  workspace: [
    { role: "user", text: "노바랩스 면접 준비하던 것부터 이어서 볼까요?" },
    {
      role: "assistant",
      text: "금요일 오후 2시 노바랩스 제품팀 인터뷰예요. 고객이 요청한 기능에서 실제 문제를 어떻게 찾았는지, 지민님의 문서 검색 프로젝트로 이야기해보면 좋겠어요.\n\n고객별 개발과 공통 제품 개발의 비중은 이번에 물어볼 질문에 넣었어요.",
    },
  ],
  interview: [
    { role: "user", text: "노바랩스 면접을 제대로 준비하고 싶어요." },
    {
      role: "assistant",
      text: "지난 연습에서는 고객이 겪던 문제보다 기술 설명이 먼저 나왔어요. 이번에는 문제를 확인한 순간부터 시작해보죠. 공고와 제품 자료를 바탕으로 예상 질문 네 개를 골라뒀어요.",
    },
  ],
  apply: [
    { role: "user", text: "노바랩스 지원해주세요." },
    {
      role: "assistant",
      text: "고객 프로젝트가 먼저 보이도록 이력서를 다듬고, 채용팀에 보낼 소개 메일도 써뒀어요. 이번 지원에 포함할 항목을 골라주세요.",
    },
  ],
  categories: [
    {
      role: "user",
      text: "FDE도 좋고, ML을 더 깊게 하는 쪽도 궁금해요. 작은 팀도 괜찮고요.",
    },
    {
      role: "assistant",
      text: "고객 문제를 풀고 배포까지 하고 싶다면 노바랩스, 모델 평가와 서빙에 더 집중하고 싶다면 레이어웍스가 가까워요. 초기 팀에서 제품 전체를 맡는 기회도 따로 묶었어요.",
    },
  ],
  explore: [
    { role: "user", text: "추천해준 곳 말고도 제가 더 둘러볼 수 있나요?" },
    {
      role: "assistant",
      text: "그럼요. 아직 함께 살펴보지 않은 공고까지 열어둘게요.\n\n끌리는 곳을 몇 개 골라주시면, 지금까지 해온 일과 어떻게 연결되는지 같이 볼 수 있어요.",
    },
  ],
  metrics: [
    { role: "user", text: "조건이랑 연봉도 같이 보면서 비교하고 싶어요." },
    {
      role: "assistant",
      text: "노바랩스는 고객 배포 경험이 이어지고, 레이어웍스는 모델 평가와 서빙에 더 깊게 들어갈 수 있어요. 공개된 보상과 추정 범위를 함께 적었어요.",
    },
  ],
};
function OpportunityDetail({
  job,
  focus,
  ctx,
  onBack,
  saved,
  onSave,
  interviewRequest,
}: {
  job: Job;
  focus: ConceptId;
  ctx: Context;
  onBack: () => void;
  saved: boolean;
  onSave: () => void;
  interviewRequest: number;
}) {
  if (job.id === "1" && (focus === "workspace" || focus === "interview")) {
    return (
      <OpportunityWorkspace
        job={job}
        initialInterview={focus === "interview"}
        interviewRequest={interviewRequest}
        ctx={ctx}
        onBack={onBack}
        saved={saved}
        onSave={onSave}
      />
    );
  }

  return (
    <div className={s.detail}>
      <div className={s.breadcrumb}>
        <Quiet onClick={onBack}>
          <ArrowLeft size={14} /> 기회
        </Quiet>
        <Quiet
          label={saved ? "관심 기회 저장 해제" : "관심 기회 저장"}
          aria-pressed={saved}
          onClick={onSave}
        >
          <Bookmark size={15} fill={saved ? "currentColor" : "none"} />
        </Quiet>
      </div>
      <OpportunityCard
        item={toOpportunity(job)}
        showUnreadIndicator={false}
        actions={
          <MuteButton
            onClick={() =>
              ctx.ask({
                label: `${job.company} · ${job.role}`,
                prompt: `${job.company}의 ${job.role} 역할을 제 경험과 함께 살펴봐주세요.`,
              })
            }
          >
            Harper와 살펴보기 <ArrowRight size={14} />
          </MuteButton>
        }
      />
    </div>
  );
}

export default function ConceptsPage({
  initialConcept,
}: {
  initialConcept: ConceptId;
}) {
  const application = usePreviewApplication();
  const router = useRouter(),
    selected =
      concepts.find(
        (c) => c.id === (router.isReady ? router.query.concept : initialConcept)
      ) ?? concepts[0],
    id = selected.id;
  const [extra, setExtra] = useState<Partial<Record<ConceptId, Message[]>>>({}),
    [drafts, setDrafts] = useState<Partial<Record<ConceptId, string>>>({}),
    [practiceByScene, setPracticeByScene] = useState<
      Partial<Record<ConceptId, string>>
    >({}),
    [practiceDrafts, setPracticeDrafts] = useState<
      Partial<Record<ConceptId, Record<string, string>>>
    >({}),
    [chatContexts, setChatContexts] = useState<
      Partial<Record<ConceptId, ChatContext>>
    >({}),
    [records, setRecords] = useState<Practice[]>([]),
    [notes, setNotes] = useState(false),
    [expanded, setExpanded] = useState<Partial<Record<ConceptId, boolean>>>({}),
    [openRequests, setOpenRequests] = useState<
      Partial<Record<ConceptId, number>>
    >({}),
    [saved, setSaved] = useState<string[]>([]),
    [scoreView, setScoreView] = useState(false);
  const practice = practiceByScene[id];
  const chatContext = practice ? undefined : chatContexts[id];
  const draft = (practice ? practiceDrafts[id]?.[practice] : drafts[id]) ?? "";
  const setPractice = (question?: string) =>
    setPracticeByScene((v) => ({ ...v, [id]: question }));
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navigation.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    const reveal = () => {
      const navRect = nav.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      if (activeRect.left < navRect.left || activeRect.right > navRect.right) {
        nav.scrollLeft += activeRect.left - navRect.left;
      }
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [id]);
  const onSave = (ids: string[], force = false) =>
    setSaved((v) =>
      force
        ? [...new Set([...v, ...ids])]
        : v.includes(ids[0])
          ? v.filter((x) => x !== ids[0])
          : [...v, ids[0]]
    );
  const openArtifact = () => {
    if (id === "map" || id === "explore") {
      setExpanded((v) => ({ ...v, [id]: true }));
    }
    setOpenRequests((v) => ({ ...v, [id]: (v[id] ?? 0) + 1 }));
  };
  const chatEnd = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const append = (messages: Message[]) => {
    setExtra((v) => ({ ...v, [id]: [...(v[id] ?? []), ...messages] }));
    requestAnimationFrame(() => {
      chatEnd.current?.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
  };
  const setDraft = (value: string) => {
    if (practice) {
      setPracticeDrafts((v) => ({
        ...v,
        [id]: { ...v[id], [practice]: value },
      }));
    } else {
      setDrafts((v) => ({ ...v, [id]: value }));
    }
  };
  const focusInput = () =>
    requestAnimationFrame(() => composer.current?.focus());
  const ctx: Context = {
    records,
    activeQuestion: practice,
    ask: (context) => {
      setPractice();
      setChatContexts((v) => ({ ...v, [id]: context }));
      focusInput();
    },
    practice: (question) => {
      if (practice === question) {
        focusInput();
        return;
      }
      setPractice(question);
      append([
        {
          role: "assistant",
          caption: "노바랩스 · 면접 연습",
          text: question,
        },
      ]);
      focusInput();
    },
  };
  const submit = () => {
    const text = draft.trim() || chatContext?.prompt;
    if (!text) return;
    const messages: Message[] = [{ role: "user", text, context: chatContext }];
    if (practice) {
      setRecords((v) => [
        ...v,
        { question: practice, answer: text, id: crypto.randomUUID() },
      ]);
      messages.push({
        role: "assistant",
        caption: "연습 기록",
        text: `${records.length + 3}회차 답변으로 남겼어요. 면접 준비의 ‘연습 기록’에서 다시 읽을 수 있어요.`,
      });
      setPractice();
    } else
      messages.push({
        role: "assistant",
        caption: "대화 흐름 예시",
        text: "예시 대화에 요청을 남겼어요. 실제 Harper 답변은 연결된 제품에서 생성돼요.",
      });
    append(messages);
    setDraft("");
    setChatContexts((v) => ({ ...v, [id]: undefined }));
    focusInput();
  };
  return (
    <MessagesProvider locale="ko" persistPreference={false}>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>
          {selected.number} {selected.title} · Harper
        </title>
      </Head>
      <div data-career-theme="sky" className={`${s.root} career-sky-canvas`}>
        <div className={s.reviewBar}>
          <nav ref={navigation} aria-label="기능별 프리뷰">
            {concepts.map((c) => (
              <Link
                key={c.id}
                href={`?concept=${c.id}`}
                shallow
                aria-current={id === c.id ? "page" : undefined}
              >
                <span>{c.number}</span>
                {c.short}
              </Link>
            ))}
          </nav>
          <Quiet
            aria-expanded={notes}
            aria-controls="concept-review-note"
            onClick={() => setNotes((v) => !v)}
          >
            가상 데이터 · 논의용
          </Quiet>
        </div>
        <div id="concept-review-note" hidden={!notes} className={s.reviewNote}>
          <Typography variant="helper">{selected.question}</Typography>
          <Typography variant="caption" className="mt-1">
            새로고침하면 선택과 작성 내용이 초기화됩니다. 지원과 면접 피드백은
            예시입니다.
          </Typography>
        </div>
        <header className={s.appHeader}>
          <span className={s.wordmark}>harper</span>
          <div className={s.topTabs}>
            <Quiet onClick={focusInput} aria-controls="concept-chat">
              채팅
            </Quiet>
            <Quiet
              className={s.topSelected}
              onClick={() =>
                document
                  .querySelector<HTMLElement>("main:not([hidden])")
                  ?.focus()
              }
              aria-controls={`concept-pane-${id}`}
            >
              기회
            </Quiet>
          </div>
          <span className={s.avatar}>지</span>
        </header>
        <div className={s.workspace}>
          <aside
            id="concept-chat"
            className={s.chat}
            aria-label="Harper와 대화"
          >
            <div className={s.messages}>
              <div className={s.messageFlow}>
                <div className={s.date}>오늘</div>
                {[...conversations[id], ...(extra[id] ?? [])].map((m, i) => (
                  <div
                    key={`${id}-${i}`}
                    className={
                      m.role === "user" ? s.userMessage : s.assistantMessage
                    }
                  >
                    <span className="sr-only">
                      {m.role === "user" ? "나" : "Harper"}
                    </span>
                    {m.context && <ContextLabel context={m.context} />}
                    {m.caption && (
                      <div className={s.messageCaption}>{m.caption}</div>
                    )}
                    <Typography className="whitespace-pre-wrap">
                      {m.text}
                    </Typography>
                    {i === 1 && id === "apply" && (
                      <ApplicationChecklist
                        state={application}
                        onOpen={application.navigate}
                      />
                    )}
                    {i === 1 &&
                      (id === "map" ||
                        id === "explore" ||
                        id === "workspace" ||
                        id === "interview") && (
                        <div className={s.chatArtifact}>
                          <PreviewUI
                            onClick={openArtifact}
                            icon={
                              id === "map" || id === "explore" ? (
                                <Table2 size={17} />
                              ) : (
                                <CalendarDays size={17} />
                              )
                            }
                            title={
                              id === "map"
                                ? `정리한 기회 ${jobs.length}곳`
                                : id === "explore"
                                  ? "전체 공고 탐색"
                                  : "노바랩스 면접 준비"
                            }
                            description={
                              id === "map"
                                ? "추천 이유와 확인할 점"
                                : id === "explore"
                                  ? "회사·역할 검색, 조건 비교"
                                  : "예상 질문 4개 · 지난 연습 기록"
                            }
                            trailing={<ChevronRight size={13} />}
                          />
                        </div>
                      )}
                  </div>
                ))}
                <div ref={chatEnd} />
              </div>
            </div>
            <div className={s.composer}>
              {practice && (
                <div className={s.practiceContext}>
                  <span title={practice}>연습 중 · {practice}</span>
                  <Quiet
                    onClick={() => {
                      setPractice();
                      focusInput();
                    }}
                  >
                    연습 나가기
                  </Quiet>
                </div>
              )}
              {chatContext && (
                <div className={s.practiceContext}>
                  <ContextLabel context={chatContext} />
                  <Quiet
                    label="기회 맥락 제거"
                    onClick={() => {
                      setChatContexts((v) => ({ ...v, [id]: undefined }));
                      focusInput();
                    }}
                  >
                    <X size={14} />
                  </Quiet>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <ChatComposerFrame
                  ref={composer}
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key !== "Enter" ||
                      event.shiftKey ||
                      event.nativeEvent.isComposing ||
                      event.keyCode === 229
                    )
                      return;
                    event.preventDefault();
                    submit();
                  }}
                  placeholder={
                    practice
                      ? "이 질문에 편하게 답해보세요."
                      : "Harper에게 이야기하기"
                  }
                  aria-label="Harper에게 메시지"
                  actionLayout="footer"
                  action={
                    <MuteButton
                      type="submit"
                      variant="dark"
                      aria-label="메시지 보내기"
                      className="ml-auto"
                      disabled={!draft.trim() && !chatContext}
                    >
                      <ArrowUp size={16} />
                    </MuteButton>
                  }
                />
              </form>
            </div>
          </aside>
          {concepts.map((c) => (
            <main
              id={`concept-pane-${c.id}`}
              tabIndex={-1}
              className={s.rightPane}
              aria-label="기회 상세 작업 공간"
              key={c.id}
              hidden={c.id !== id}
            >
              {c.id === "apply" ? (
                <div className={s.detail}>
                  <OpportunityCard
                    item={toOpportunity({ ...jobs[0], intro: false })}
                    expanded={false}
                    showUnreadIndicator={false}
                  />
                  <Application state={application} />
                </div>
              ) : (
                <BrowsePane
                  concept={c.id}
                  ctx={ctx}
                  expanded={expanded[c.id] ?? false}
                  setExpanded={(v) =>
                    setExpanded((prev) => ({ ...prev, [c.id]: v }))
                  }
                  openRequest={openRequests[c.id] ?? 0}
                  scoreView={scoreView}
                  onScoreViewChange={setScoreView}
                  saved={saved}
                  onSave={onSave}
                  detail={(job, onBack) => (
                    <OpportunityDetail
                      job={job}
                      focus={c.id}
                      interviewRequest={openRequests[c.id] ?? 0}
                      ctx={ctx}
                      onBack={onBack}
                      saved={saved.includes(job.id)}
                      onSave={() => onSave([job.id])}
                    />
                  )}
                />
              )}
            </main>
          ))}
        </div>
      </div>
    </MessagesProvider>
  );
}
export const getServerSideProps: GetServerSideProps = async ({ query }) =>
  process.env.NODE_ENV === "development"
    ? {
        props: {
          initialConcept:
            concepts.find((c) => c.id === query.concept)?.id ?? concepts[0].id,
        },
      }
    : { notFound: true };
