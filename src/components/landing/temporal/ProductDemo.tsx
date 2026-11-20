import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Archive,
  ArrowRight,
  ArrowUp,
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  Home,
  Plus,
  Settings,
} from "lucide-react";
import Image from "next/image";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "@/lib/cn";
import {
  CompanyMark,
  EASE,
  RichText,
  WorkingDots,
  useSceneTimeline,
  useTypewriter,
  useC,
  SectionReveal,
  WaveTitle,
} from "./primitives";
import { tw } from "./tw";
import type { CarouselBlock } from "./types";

/**
 * 랜딩의 제품 목업. 실제 /career(Floating Sky)와 같은 배치·표면을 고정 크기로 그리고 화면 너비에 맞춰 줄인다.
 * 대화와 화면 구성은 첨부 HTML의 "일하는 동안에도" 목업을 따르고, 채팅 안의 첫 기회만 공고 카드와 버튼으로 보여 준다.
 * 장면: 입력 → 전송 → 살펴보는 중 → 공고 카드 → 저장하기 → 나머지 답변 → 기회 탭으로 이동.
 */

type DemoCopy = ReturnType<typeof useDemoCopy>;
type Viewport = "desktop" | "mobile";

const SIZE: Record<Viewport, { width: number; height: number }> = {
  desktop: { width: 1440, height: 820 },
  mobile: { width: 390, height: 760 },
};

// 0 대기 · 1 입력 · 2 전송 · 3 살펴보는 중 · 4 공고 카드 · 5 저장으로 이동 · 6 저장
// 7 나머지 답변 · 8 탭으로 이동 · 9 기회 탭 · 10 정리
const STEPS = [
  700, 2400, 600, 1300, 1300, 800, 1000, 1900, 900, 3800, 600,
] as const;
const STATIC_STEP = 9;
const FADE_STEP = 10;

/** 목업 대화·화면 문구. 첨부 HTML의 "일하는 동안에도" 목업을 따른다. 한국어·영어를 `c("한글", "English")`로 나란히 적는다. */
function useDemoCopy() {
  const c = useC();
  return {
    nav: {
      chat: c("채팅", "Chat"),
      opportunities: c("기회", "Opportunities"),
      settings: c("설정", "Settings"),
      home: c("홈", "Home"),
    },
    time: c("오늘 오후 2:37", "Today 2:37 PM"),
    prompt: c(
      "결제 백엔드 4년 했어요. 에이전트 만드는 팀 위주로 찾아 주고, 공고 없는 곳은 대표한테 직접 연락해 줘도 돼요.",
      "4 years in payments backend. Find teams building agents, and if there’s no opening, reach out to the founder directly."
    ),
    placeholder: c(
      "원하는 방향을 편하게 말해주세요. @로 기회를 골라 물어볼 수 있어요.",
      "Tell me what you’re looking for. Use @ to ask about an opportunity."
    ),
    chips: [
      c("기회 더 찾아줘", "Find more opportunities"),
      c("커리어 상담", "Career coaching"),
    ],
    working: c("살펴보는 중", "Working"),
    worked: c("3분 41초 동안 작업", "Worked for 3m 41s"),
    posting: {
      heading: c(
        "1. Cognition — AI 코딩 에이전트 Devin",
        "1. Cognition — Devin, the AI coding agent"
      ),
      role: "Forward Deployed Engineer",
      meta: c(
        "서울 · 풀타임 · 직접 지원",
        "Seoul · Full-time · Apply directly"
      ),
      body: c(
        "5월에 **10억 달러 넘게** 투자받았고, 기업가치는 **260억 달러**예요. 고객사에 Devin을 붙이는 일이라 결제 백엔드 경험이 바로 쓰여요. {{투자 기사}}",
        "Raised **over $1B** in May at a **$26B** valuation. You’d roll Devin out inside customers’ systems, so your payments backend work applies directly. {{Funding news}}"
      ),
      applyVia: c(
        "**지원 경로:** {{공식 채용 페이지}}",
        "**Apply via:** {{Careers page}}"
      ),
      archive: c("보관하기", "Archive"),
      save: c("저장하기", "Save"),
      saved: c("저장됨", "Saved"),
      apply: c("지원하기", "Apply"),
    },
    rest: [
      {
        kind: "h",
        text: "2. Anthropic — Claude",
      },
      {
        kind: "p",
        text: c(
          "6월에 **서울 오피스**를 열었고, 서울에서 **Applied AI Architect**를 뽑고 있어요. 파트너사와 Claude 기반 시스템을 설계하는 일이라 백엔드 설계 경험과 맞닿아요. {{서울 오피스 소식}}",
          "Opened its **Seoul office** in June and is hiring an **Applied AI Architect** in Seoul, designing Claude-based systems with partners. Your backend design experience fits. {{Seoul office news}}"
        ),
      },
      {
        kind: "h",
        text: c(
          "3. Brindle — 가맹점 정산 에이전트",
          "3. Brindle — settlement agents for merchants"
        ),
      },
      {
        kind: "p",
        text: c(
          "정산·환불 문의를 처리하는 에이전트를 만드는 **시드 단계 6명 팀**이에요. 채용 페이지엔 없지만, 한서준 대표가 10월에 첫 백엔드 엔지니어를 찾는다고 올렸어요.",
          "A **6-person seed-stage team** building agents that handle settlement and refund requests. No opening on their careers page, but CEO Seojun Han wrote in October that he’s looking for a first backend engineer."
        ),
      },
      {
        kind: "p",
        text: c(
          "Brindle 메일은 써 뒀어요. **보내기 전에 확인해 주세요.**",
          "I drafted the Brindle email. **Please review it before it goes out.**"
        ),
      },
    ] satisfies CarouselBlock[],
    followups: {
      date: c("11월 10일 화요일 · 오후 2:41", "Tuesday, November 10 · 2:41 PM"),
      heading: c("지금 팔로업", "Follow-ups now"),
      items: [
        {
          title: c(
            "Brindle 대표에게 보낼 메일 확인",
            "Review your email to Brindle’s CEO"
          ),
          body: c(
            "채용 페이지에 없는 기회라 한서준 대표에게 보낼 메일을 써 뒀어요. 이력서가 첨부돼 있고, 아직 보내지 않았어요.",
            "There’s no opening on their careers page, so I drafted a note to CEO Seojun Han with your resume attached. Nothing has been sent."
          ),
          action: c("메일 확인하기", "Review email"),
        },
        {
          title: c("Cognition 지원 여부 정하기", "Decide on Cognition"),
          body: c(
            "서울 Forward Deployed Engineer예요. 지원할지 알려 주세요. 아직 아무것도 보내지 않았어요.",
            "The Seoul Forward Deployed Engineer role. Should I apply? Nothing has been sent."
          ),
          action: c("지원 여부 알려주기", "Let me know"),
        },
      ],
      close: c("닫기", "Close"),
      next: c("이어서 해볼 것", "Next up"),
      summary: c("지원 현황", "Application overview"),
      counts: [
        {
          key: "interested",
          label: c("관심", "Interested"),
          value: 6,
        },
        {
          key: "applied",
          label: c("지원함", "Applied"),
          value: 2,
        },
        {
          key: "connecting",
          label: c("연결 중", "Connecting"),
          value: 1,
        },
      ],
    },
    opportunities: {
      heading: c("기회", "Opportunities"),
      tabs: {
        fresh: c("새 기회", "New"),
        saved: c("관심", "Interested"),
        connecting: c("연결 중", "Connecting"),
        archived: c("보관", "Archived"),
      },
      justSaved: c("방금 저장", "Just saved"),
      rows: [
        {
          company: "Cognition",
          role: "Forward Deployed Engineer",
          meta: c("서울 · 풀타임", "Seoul · Full-time"),
          type: c("직접 지원", "Apply directly"),
          logo: undefined as string | undefined,
        },
        {
          company: "Wonderful",
          role: "Forward Deployed Engineer (FDE)",
          meta: c("서울 · 풀타임", "Seoul · Full-time"),
          type: c("Harper 연결", "Harper intro"),
          logo: "/images/logos/wonderful.jpg",
        },
        {
          company: "Anthropic",
          role: "Applied AI Architect",
          meta: c("서울 · 풀타임", "Seoul · Full-time"),
          type: c("직접 지원", "Apply directly"),
          logo: "/svgs/anthropic.svg",
        },
        {
          company: "SBVA",
          role: c("AI 투자 Associate", "Associate, AI Investments"),
          meta: c("서울 · 풀타임", "Seoul · Full-time"),
          type: c("Harper 연결", "Harper intro"),
          logo: "/images/logos/sbva.png",
        },
        {
          company: "Brindle",
          role: "Founding Backend Engineer",
          meta: c("서울 · 대면 · 풀타임", "Seoul · On-site · Full-time"),
          type: c("대표에게 연락", "Founder outreach"),
          logo: undefined as string | undefined,
        },
      ],
    },
  };
}

export function ProductDemoSection() {
  const copy = useDemoCopy();
  const c = useC();
  const firstLine = c("일하는 동안에도,", "Harper keeps working,");
  const secondLine = c("Harper는 쉬지 않아요.", "even while you do.");
  return (
    // 푸터의 `/#workflow` 링크가 이 섹션을 가리킨다.
    <section
      id="workflow"
      className="relative scroll-mt-20 px-3 pb-24 md:px-6 md:pb-36"
    >
      <SectionReveal className="mx-auto mb-10 max-w-[760px] px-2 text-center md:mb-14">
        <WaveTitle lines={[firstLine, secondLine]} />
        {/* <p className={cn(tw.lede, "mx-auto mt-5 max-w-[560px] md:mt-6")}>
          {c(
            "대화 하나에 다 맡기면, 확인할 것과 지원 현황은 알아서 정리돼요.",
            "Hand everything off in one chat. What needs your OK and your applications stay organized."
          )}
        </p> */}
      </SectionReveal>
      <div className="relative mx-auto w-full max-w-[1400px] overflow-hidden rounded-[22px] md:rounded-[32px]">
        <Image
          src="/images/bluebluesky.png"
          alt=""
          fill
          sizes="(min-width: 1400px) 1400px, 100vw"
          className="object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgb(235_240_246/0.25),rgb(235_240_246/0.05)_40%,rgb(20_40_70/0.12))]"
        />
        <div className="relative px-4 pb-0 pt-10 md:px-[6%] md:pt-[7%]">
          <DemoWindow copy={copy} />
        </div>
      </div>
    </section>
  );
}

function DemoWindow({ copy }: { copy: DemoCopy }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const update = () => setFrameWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const viewport: Viewport =
    frameWidth > 0 && frameWidth < 640 ? "mobile" : "desktop";
  const size = SIZE[viewport];
  const scale = frameWidth ? frameWidth / size.width : 1;

  const radius = viewport === "mobile" ? 34 : 14;

  return (
    <div
      className={cn(
        "relative mx-auto shadow-[0_40px_80px_-30px_rgb(10_30_60/0.45)]",
        viewport === "mobile" && "max-w-[390px]"
      )}
      style={{ borderRadius: `${radius}px ${radius}px 0 0` }}
    >
      <div
        className="relative overflow-hidden bg-[#f3f5f8]"
        style={{
          borderRadius: `${radius}px ${radius}px 0 0`,
          clipPath: `inset(0 round ${radius}px ${radius}px 0 0)`,
        }}
      >
        {viewport === "desktop" ? (
          <div className="flex h-8 items-center gap-2 bg-[#eef1f5] px-3.5 shadow-[inset_0_-0.5px_0_rgb(0_0_0/0.08)]">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </div>
        ) : null}
        <div
          ref={frameRef}
          className="relative w-full"
          style={{
            height: frameWidth ? size.height * scale : undefined,
            aspectRatio: frameWidth
              ? undefined
              : `${size.width} / ${size.height}`,
          }}
        >
          {frameWidth ? (
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: size.width,
                height: size.height,
                transform: `scale(${scale})`,
              }}
            >
              <DemoScene copy={copy} viewport={viewport} />
            </div>
          ) : null}
        </div>
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.55)]"
        style={{ borderRadius: `${radius}px ${radius}px 0 0` }}
      />
    </div>
  );
}

function DemoScene({ copy, viewport }: { copy: DemoCopy; viewport: Viewport }) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useReducedMotion();
  const timelineStep = useSceneTimeline(sceneRef, STEPS, { amount: 0.4 });
  const step = reducedMotion ? STATIC_STEP : timelineStep;
  const compact = viewport === "mobile";

  const typed = useTypewriter(copy.prompt, step === 1, { speed: 36 });
  const saved = step >= 6;
  const tab: "chat" | "opps" = step >= 9 ? "opps" : "chat";
  const pressing = step === 6 || step === 9;

  const saveRef = useRef<HTMLSpanElement | null>(null);
  const tabRef = useRef<HTMLSpanElement | null>(null);
  const cursorTarget: RefObject<HTMLElement | null> | null =
    step === 5 || step === 6
      ? saveRef
      : step === 8 || step === 9
        ? tabRef
        : null;
  const cursor = useCursorPosition(sceneRef, cursorTarget, step);

  return (
    <div
      ref={sceneRef}
      className="career-sky-canvas relative isolate h-full w-full overflow-hidden"
      style={{ fontFamily: "var(--career-font-family)" }}
      inert
    >
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: step === FADE_STEP ? 0 : 1 }}
        transition={{ duration: step === FADE_STEP ? 0.45 : 0.6, ease: EASE }}
      >
        <TopBar
          copy={copy}
          tab={tab}
          compact={compact}
          tabRef={tabRef}
          attention={saved && tab === "chat"}
        />

        {compact ? (
          <div className="absolute inset-0 pt-16">
            <AnimatePresence mode="popLayout" initial={false}>
              {tab === "chat" ? (
                <motion.div
                  key="chat"
                  className="h-full"
                  exit={{ opacity: 0, x: -24, filter: "blur(4px)" }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  <ChatColumn
                    copy={copy}
                    compact
                    step={step}
                    typed={typed}
                    saved={saved}
                    saveRef={saveRef}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="opps"
                  className="h-full px-4 pt-4"
                  initial={{ opacity: 0, x: 24, filter: "blur(4px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.45, ease: EASE }}
                >
                  <OpportunitiesPanel copy={copy.opportunities} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="absolute inset-0 grid grid-cols-[minmax(0,1fr)_440px] grid-rows-[minmax(0,1fr)] gap-12 pl-7 pr-10">
            <ChatColumn
              copy={copy}
              step={step}
              typed={typed}
              saved={saved}
              saveRef={saveRef}
            />
            <aside className="relative pt-[84px]">
              <AnimatePresence mode="popLayout" initial={false}>
                {tab === "chat" ? (
                  <motion.div
                    key="followups"
                    exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
                    transition={{ duration: 0.3, ease: EASE }}
                  >
                    <FollowupsPanel copy={copy.followups} saved={saved} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="opps"
                    initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 0.5, ease: EASE }}
                  >
                    <OpportunitiesPanel copy={copy.opportunities} />
                  </motion.div>
                )}
              </AnimatePresence>
            </aside>
          </div>
        )}

        <Cursor position={cursor} pressing={pressing} compact={compact} />
      </motion.div>
    </div>
  );
}

/* ---------------- Top bar ---------------- */

function TopBar({
  copy,
  tab,
  compact,
  tabRef,
  attention,
}: {
  copy: DemoCopy;
  tab: "chat" | "opps";
  compact: boolean;
  tabRef: RefObject<HTMLSpanElement | null>;
  attention: boolean;
}) {
  const chatRef = useRef<HTMLSpanElement | null>(null);
  const [indicator, setIndicator] = useState({ left: 3, width: 0 });

  useLayoutEffect(() => {
    const node = tab === "chat" ? chatRef.current : tabRef.current;
    if (!node) return;
    setIndicator({ left: node.offsetLeft, width: node.offsetWidth });
  }, [tab, tabRef]);

  return (
    <header className="absolute inset-x-0 top-0 z-20 grid h-16 grid-cols-[1fr_auto_1fr] items-center px-7">
      <span className="flex size-9 items-center justify-center rounded-full text-(--tl-ink)">
        {compact ? (
          <Settings className="size-[18px]" strokeWidth={1.6} />
        ) : (
          <Home className="size-[18px]" strokeWidth={1.6} />
        )}
      </span>
      <div className={cn(tw.glass, "relative flex rounded-full p-[3px]")}>
        <motion.span
          aria-hidden="true"
          className="absolute top-[3px] h-10 rounded-full bg-[#1d1d1f] shadow-[0_6px_14px_-8px_rgb(0_0_0/0.6)]"
          initial={false}
          animate={{ left: indicator.left, width: indicator.width }}
          transition={{ type: "spring", stiffness: 420, damping: 38 }}
        />
        <span
          ref={chatRef}
          className={cn(
            "relative z-10 flex h-10 items-center px-4 text-[14px] transition-colors duration-300",
            tab === "chat" ? "text-white" : "text-(--tl-ink)"
          )}
        >
          {copy.nav.chat}
        </span>
        <span
          ref={tabRef}
          className={cn(
            "relative z-10 flex h-10 items-center gap-1.5 px-4 text-[14px] transition-colors duration-300",
            tab === "opps" ? "text-white" : "text-(--tl-ink)"
          )}
        >
          {copy.nav.opportunities}
          <span
            className={cn(
              "flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-medium tabular-nums transition-colors duration-300",
              tab === "opps"
                ? "bg-white/20 text-white"
                : "bg-[#1d1d1f] text-white"
            )}
          >
            12
          </span>
          <AnimatePresence>
            {attention ? (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 rounded-full ring-2 ring-[#1d1d1f]/30"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: [0, 1, 0], scale: [0.9, 1.08, 1.18] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1, ease: EASE }}
              />
            ) : null}
          </AnimatePresence>
        </span>
      </div>
      <div className="flex items-center justify-end gap-3.5">
        {!compact ? (
          <span className="flex items-center gap-1.5 text-[13px] text-(--tl-ink)">
            <Settings className="size-4" strokeWidth={1.6} />
            {copy.nav.settings}
          </span>
        ) : null}
        <span className="relative size-8 overflow-hidden rounded-full bg-white/70 shadow-[0_1px_0_rgb(255_255_255/0.9)_inset,0_0_0_1px_rgb(255_255_255/0.55),0_6px_16px_-6px_rgb(30_25_20/0.25)]">
          <Image
            src="/images/notionface.png"
            alt=""
            fill
            sizes="64px"
            className="scale-[1.35] object-cover"
          />
        </span>
      </div>
    </header>
  );
}

/* ---------------- Chat ---------------- */

function ChatColumn({
  copy,
  compact = false,
  step,
  typed,
  saved,
  saveRef,
}: {
  copy: DemoCopy;
  compact?: boolean;
  step: number;
  typed: string;
  saved: boolean;
  saveRef: RefObject<HTMLSpanElement | null>;
}) {
  const sent = step >= 2;
  const working = step === 3;
  const answered = step >= 4;
  const restShown = step >= 7;
  const composerText = step === 1 ? typed : "";

  return (
    <section
      className={cn(
        "relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden",
        compact ? "px-4" : "px-5"
      )}
    >
      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden",
          compact ? "pt-2" : "pt-[88px]"
        )}
        style={{
          WebkitMaskImage: "linear-gradient(180deg, transparent 0, #000 96px)",
          maskImage: "linear-gradient(180deg, transparent 0, #000 96px)",
        }}
      >
        <div className="mx-auto flex h-full w-full max-w-[560px] flex-col justify-end pb-5">
          <AnimatePresence initial={false}>
            {sent ? (
              <motion.div
                key="sent"
                layout="position"
                className="mb-8 flex flex-col items-end"
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <UserBubble>{copy.prompt}</UserBubble>
                <time className="mt-1.5 text-[12px] text-(--tl-ink-3)">
                  {copy.time}
                </time>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {working || answered ? (
              <motion.div
                key="assistant"
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  "flex flex-col gap-3 text-[14.5px] leading-[1.75] text-(--tl-ink)",
                  tw.answer
                )}
              >
                <div className={tw.statusLine}>
                  {working ? (
                    <>
                      <WorkingDots />
                      <span className={tw.shimmerText}>{copy.working}</span>
                    </>
                  ) : (
                    <>
                      {copy.worked}
                      <ChevronRight className="size-3.5" />
                    </>
                  )}
                </div>
                {answered ? (
                  <motion.div
                    className="flex flex-col gap-3"
                    initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 0.55, ease: EASE }}
                  >
                    <h4>{copy.posting.heading}</h4>
                    <PostingCard
                      copy={copy.posting}
                      saved={saved}
                      saveRef={saveRef}
                      compact={compact}
                    />
                  </motion.div>
                ) : null}
                {restShown
                  ? copy.rest.map((block, index) => (
                      <motion.div
                        key={index}
                        layout="position"
                        initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        transition={{
                          duration: 0.45,
                          delay: index * 0.22,
                          ease: EASE,
                        }}
                      >
                        {block.kind === "h" ? (
                          <h4>{block.text}</h4>
                        ) : block.kind === "p" ? (
                          <p>
                            <RichText text={block.text} />
                          </p>
                        ) : null}
                      </motion.div>
                    ))
                  : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      <div className="mx-auto mb-2.5 flex w-full max-w-[560px] gap-1.5">
        {copy.chips.map((chip) => (
          <span key={chip} className={cn(tw.pill, "h-8 px-3 text-[12.5px]")}>
            {chip}
          </span>
        ))}
      </div>
      <Composer
        text={composerText}
        placeholder={copy.placeholder}
        compact={compact}
      />
    </section>
  );
}

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="w-fit max-w-[86%] rounded-[18px] rounded-br-[6px] bg-white/55 px-3.5 py-2 text-[14.5px] leading-[1.7] text-(--tl-ink) shadow-(--career-glass-shadow)">
      {children}
    </div>
  );
}

function Composer({
  text,
  placeholder,
  compact,
}: {
  text: string;
  placeholder: string;
  compact: boolean;
}) {
  const hasText = text.length > 0;
  return (
    <div className={cn("shrink-0", compact ? "pb-4" : "pb-7")}>
      <div
        className={cn(tw.glass, "mx-auto w-full max-w-[560px] rounded-[16px]")}
      >
        <div className="min-h-12 px-3.5 py-3 text-[14.5px] leading-[1.6]">
          {hasText ? (
            <span className="text-(--tl-ink)">
              {text}
              <span className={tw.caret} />
            </span>
          ) : (
            <span className="text-[#8b8b93]">{placeholder}</span>
          )}
        </div>
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="flex size-8 items-center justify-center rounded-full text-(--tl-ink-2)">
            <Plus className="size-5" strokeWidth={1.6} />
          </span>
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-full bg-[#1d1d1f] text-white transition-opacity duration-200",
              hasText ? "opacity-100" : "opacity-40"
            )}
          >
            <ArrowUp className="size-4" strokeWidth={2} />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Posting card ---------------- */

function PostingCard({
  copy,
  saved,
  saveRef,
  compact,
}: {
  copy: DemoCopy["posting"];
  saved: boolean;
  saveRef: RefObject<HTMLSpanElement | null>;
  compact: boolean;
}) {
  return (
    <article className={cn(tw.glassStrong, "overflow-hidden")}>
      <div className={cn(compact ? "p-4" : "px-5 pb-4 pt-[18px]")}>
        <div className="flex items-baseline justify-between gap-3">
          <h5
            className={cn(
              "font-medium tracking-[-0.02em] text-(--tl-ink)",
              compact ? "text-[16.5px]" : "text-[18px]"
            )}
          >
            {copy.role}
          </h5>
        </div>
        <div className="mt-0.5 text-[12.5px] text-(--tl-ink-2)">
          {copy.meta}
        </div>
        <p className="mt-3 text-[13.5px] leading-[1.7] text-(--tl-ink)">
          <RichText text={copy.body} />
        </p>
        <p className="mt-2 text-[13px] text-(--tl-ink-2) [&_strong]:font-medium [&_strong]:text-(--tl-ink)">
          <RichText text={copy.applyVia} />
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-black/[0.06] bg-white/35 px-3 py-2.5">
        <span className={cn(tw.pill, tw.pillGhost, "h-9 gap-1.5 px-3")}>
          <Archive className="size-3.5" strokeWidth={1.8} />
          {copy.archive}
        </span>
        <div className="flex items-center gap-2">
          <span
            ref={saveRef}
            className={cn(
              tw.pill,
              "h-9 gap-1.5 px-3.5 transition-[background,color,box-shadow] duration-300",
              saved &&
                "bg-[#1d1d1f]/[0.06] bg-none shadow-[inset_0_0_0_1px_rgb(29_29_31/0.1)]"
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {saved ? (
                <motion.span
                  key="saved"
                  className="inline-flex items-center gap-1.5"
                  initial={{ opacity: 0, scale: 0.6, filter: "blur(2px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  transition={{ type: "spring", stiffness: 520, damping: 26 }}
                >
                  <BookmarkCheck className="size-3.5" strokeWidth={2} />
                  {copy.saved}
                </motion.span>
              ) : (
                <motion.span
                  key="save"
                  className="inline-flex items-center gap-1.5"
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                >
                  <Bookmark className="size-3.5" strokeWidth={1.8} />
                  {copy.save}
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <span
            className={cn(tw.pill, tw.pillDark, "h-9 gap-1.5 px-4 font-medium")}
          >
            {copy.apply}
            <ArrowRight className="size-3.5" strokeWidth={2} />
          </span>
        </div>
      </div>
    </article>
  );
}

/* ---------------- Right panels ---------------- */

function FollowupsPanel({
  copy,
  saved,
}: {
  copy: DemoCopy["followups"];
  saved: boolean;
}) {
  return (
    <div>
      <div className="text-[12.5px] text-(--tl-ink-3)">{copy.date}</div>
      <div className="mt-1 text-[22px] font-light leading-[1.3] tracking-[-0.3px] text-(--tl-ink)">
        {copy.heading} {copy.items.length}
      </div>
      <div className="mt-5 flex flex-col gap-3">
        {copy.items.map((item) => (
          <div key={item.title} className={cn(tw.glass, "p-[18px]")}>
            <div className="text-[22px] font-light leading-[1.3] tracking-[-0.3px] text-(--tl-ink)">
              {item.title}
            </div>
            <div className="mt-2 text-[14px] leading-[1.5] text-(--tl-ink-2)">
              {item.body}
            </div>
            <div className="mt-3 flex items-center justify-between text-[14px]">
              <span className="inline-flex items-center gap-1 font-medium text-(--tl-ink)">
                {item.action}
                <ArrowRight className="size-4 text-(--tl-ink-3)" />
              </span>
              <span className="text-[13px] text-(--tl-ink-3)">
                {copy.close}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 text-center text-[15px] text-(--tl-ink-2)">
        {copy.next}
      </div>
      <div className={cn(tw.glass, "mt-4 p-[18px]")}>
        <div className="text-[12.5px] text-(--tl-ink-3)">{copy.summary}</div>
        <dl className="mt-2.5 grid grid-cols-3">
          {copy.counts.map((count) => {
            const value =
              count.key === "interested" && saved
                ? count.value + 1
                : count.value;
            return (
              <div key={count.key} className="flex flex-col">
                <dt className="order-2 mt-1 text-[13px] text-(--tl-ink-2)">
                  {count.label}
                </dt>
                <dd className="order-1 h-[37px] overflow-hidden text-[34px] font-light leading-[1.1] tracking-[-1px] text-(--tl-ink)">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={value}
                      className="inline-block"
                      initial={{ y: 24, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -24, opacity: 0 }}
                      transition={{ duration: 0.45, ease: EASE }}
                    >
                      {value}
                    </motion.span>
                  </AnimatePresence>
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </div>
  );
}

function OpportunitiesPanel({ copy }: { copy: DemoCopy["opportunities"] }) {
  const tabs = [
    { key: "fresh", label: copy.tabs.fresh, count: 12 },
    { key: "saved", label: copy.tabs.saved, count: 7 },
    { key: "connecting", label: copy.tabs.connecting, count: 1 },
    { key: "archived", label: copy.tabs.archived },
  ];
  return (
    <div>
      <div className="text-[15px] font-semibold text-(--tl-ink)">
        {copy.heading}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {tabs.map((tab) => (
          <span
            key={tab.key}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px]",
              tab.key === "saved"
                ? "bg-white text-(--tl-ink) shadow-[0_1px_3px_rgb(0_0_0/0.08)]"
                : "bg-white/25 text-(--tl-ink-2)"
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className="text-[12px] tabular-nums text-(--tl-ink-3)">
                {tab.count}
              </span>
            ) : null}
          </span>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-1">
        {copy.rows.map((row, index) => (
          <motion.div
            key={row.company + row.role}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.45,
              delay: 0.12 + index * 0.06,
              ease: EASE,
            }}
            className="relative rounded-[18px] px-3.5 py-3"
          >
            {index === 0 ? (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 rounded-[18px]"
                style={{
                  background: "var(--career-glass-image)",
                  boxShadow: "var(--career-glass-shadow)",
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              />
            ) : null}
            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-[7px] text-[14.5px] font-medium text-(--tl-ink)">
                  <CompanyMark
                    name={row.company}
                    logo={row.logo}
                    size={20}
                    className="rounded-[5px]"
                  />
                  <span className="truncate">{row.company}</span>
                  {index === 0 ? (
                    <motion.span
                      className="ml-1 inline-flex h-5 items-center rounded-full bg-[#1d1d1f] px-2 text-[11px] font-medium text-white"
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 24,
                        delay: 0.55,
                      }}
                    >
                      {copy.justSaved}
                    </motion.span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[12px] text-(--tl-ink-3)">
                  {row.type}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between">
                <span className="text-[14.5px] text-(--tl-ink)">
                  {row.role}
                </span>
                <ChevronRight className="size-4 text-(--tl-ink-3)" />
              </div>
              <div className="text-[13px] text-(--tl-ink-2)">{row.meta}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Cursor ---------------- */

type CursorPosition = { x: number; y: number; visible: boolean };

function useCursorPosition(
  sceneRef: RefObject<HTMLDivElement | null>,
  targetRef: RefObject<HTMLElement | null> | null,
  step: number
): CursorPosition {
  const [position, setPosition] = useState<CursorPosition>({
    x: 0,
    y: 0,
    visible: false,
  });

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const frame = window.requestAnimationFrame(() => {
      const target = targetRef?.current;
      if (!target) {
        setPosition((current) => ({ ...current, visible: false }));
        return;
      }
      const sceneRect = scene.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const scale = sceneRect.width / scene.offsetWidth || 1;
      setPosition({
        x: (rect.left - sceneRect.left + rect.width * 0.55) / scale,
        y: (rect.top - sceneRect.top + rect.height * 0.6) / scale,
        visible: true,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sceneRef, step, targetRef]);

  return position;
}

function Cursor({
  position,
  pressing,
  compact,
}: {
  position: CursorPosition;
  pressing: boolean;
  compact: boolean;
}) {
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-50"
      initial={false}
      animate={{
        x: position.visible ? position.x : position.x + 40,
        y: position.visible ? position.y : position.y + 60,
        opacity: position.visible ? 1 : 0,
      }}
      transition={{
        x: { type: "spring", stiffness: 90, damping: 18 },
        y: { type: "spring", stiffness: 90, damping: 18 },
        opacity: { duration: 0.3 },
      }}
    >
      <motion.div
        animate={{ scale: pressing ? [1, 0.82, 1] : 1 }}
        transition={{ duration: 0.35, delay: pressing ? 0.35 : 0, ease: EASE }}
        style={{ transformOrigin: "4px 4px" }}
      >
        <AnimatePresence>
          {pressing ? (
            <motion.span
              key="ripple"
              className="absolute -left-4 -top-4 size-9 rounded-full bg-[#1d1d1f]/15"
              initial={{ opacity: 0, scale: 0.2 }}
              animate={{ opacity: [0, 1, 0], scale: [0.2, 1, 1.4] }}
              transition={{ duration: 0.6, delay: 0.35, ease: EASE }}
            />
          ) : null}
        </AnimatePresence>
        <svg
          width={compact ? 26 : 22}
          height={compact ? 26 : 22}
          viewBox="0 0 24 24"
          className="drop-shadow-[0_2px_3px_rgb(0_0_0/0.3)]"
        >
          <path
            d="M4.5 3.2 19 11.1l-6.4 1.6-3 6.1L4.5 3.2Z"
            fill="#1d1d1f"
            stroke="#fff"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </motion.div>
    </motion.div>
  );
}
