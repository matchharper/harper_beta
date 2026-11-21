import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { cn } from "@/lib/cn";
import type { CarouselCard } from "./types";
import {
  CompanyMark,
  EASE,
  HarperMark,
  RichText,
  WorkingDots,
  useC,
} from "./primitives";
import { tw } from "./tw";

/**
 * hark.com 메인 아래 캐러셀과 같은 구조.
 * 카드는 보는 사람을 둘러싼 원통의 안쪽 벽에 일정한 각도로 놓이고,
 * 가운데 카드만 앞으로 나온다. 일정 시간 머문 뒤 한 칸씩 회전하고,
 * 아래 말풍선은 흐려지며 사라졌다가 가운데부터 펼쳐지며 바뀐다.
 */

/* ---------- 카드 모양: 크기·배경·그림자는 여기서 고친다 ---------- */

/** 카드 크기(px). 데스크톱은 화면이 좁아지면 비율을 지키며 minWidth까지 줄어든다. */
const CARD_SIZE = {
  desktop: { width: 400, height: 270, minWidth: 320 },
  mobile: { width: 276, height: 290 },
};

/**
 * 카드 안 내용을 그리는 너비(px). 이 너비로 그린 뒤 카드 너비에 맞게 줄인다(HTML 시안의 zoom 0.8과 같다).
 * 값을 키우면 카드 안 글자가 작아지고, 줄이면 커진다.
 */
const CONTENT_WIDTH = { desktop: 500, mobile: 360 };

/** 카드 모서리 반지름(px). */
const CARD_RADIUS = 20;

/** 카드 배경. */
const CARD_BACKGROUND =
  "bg-[radial-gradient(520px_260px_at_20%_0%,#fff,rgb(255_255_255/50)_70%),linear-gradient(180deg,#ffffff_0%,#fbfaf8_55%,#f6f5f2_100%)]";

/** 카드 그림자. 모서리를 clip-path로 자르기 때문에 그림자는 바깥 요소에 둔다. */
const CARD_SHADOW =
  "shadow-[0_30px_60px_-30px_rgb(30_35_50/0.45),0_0_0_0.5px_rgb(30_25_20/0.07)]";

/** 카드 아래쪽 흐려지는 띠. */
const CARD_FADE =
  "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-14 after:bg-[linear-gradient(rgb(248_247_245/0),rgb(248_247_245/0.97))] after:content-['']";

/** 카드 안 여백과 기본 글자. CONTENT_WIDTH 기준 값이라 화면에서는 줄어든 크기로 보인다. */
const CARD_CONTENT =
  "px-[26px] pb-10 pt-6 text-[15px] leading-[25.5px] text-[#1d1d1f]";

/* ---------- 움직임 ---------- */

const HOLD_MS = 4200;
/** 이만큼 움직여야 끌기로 본다. 그보다 작으면 카드 클릭으로 둔다. */
const DRAG_THRESHOLD_PX = 5;
/** 놓을 때 속도(px/ms)에 곱해 얼마나 더 굴러갈지 정한다. */
const FLING_MS = 180;
const ROTATE_S = 0.6;
const ROTATE_EASE = [0.16, 1, 0.3, 1] as const;

type Layout = {
  cardWidth: number;
  cardHeight: number;
  contentWidth: number;
  /** 내용을 카드 너비에 맞추는 배율. */
  zoom: number;
  /** 원통 반지름·카드 사이 각도·원근 거리·가운데 카드가 앞으로 나오는 거리. */
  radius: number;
  step: number;
  perspective: number;
  pop: number;
  /** 캐러셀 전체 높이와 카드 윗변 위치. */
  height: number;
  top: number;
};

function computeLayout(width: number): Layout {
  if (width < 640) {
    const size = CARD_SIZE.mobile;
    const cardWidth = Math.min(size.width, width - 104);
    const cardHeight = (cardWidth * size.height) / size.width;
    return {
      cardWidth,
      cardHeight,
      contentWidth: CONTENT_WIDTH.mobile,
      zoom: cardWidth / CONTENT_WIDTH.mobile,
      radius: 520,
      step: 27,
      perspective: 1100,
      pop: 44,
      height: cardHeight + 140,
      top: 24,
    };
  }
  const size = CARD_SIZE.desktop;
  const cardWidth = Math.max(
    size.minWidth,
    Math.min(size.width, width * 0.3125)
  );
  const cardHeight = (cardWidth * size.height) / size.width;
  return {
    cardWidth,
    cardHeight,
    contentWidth: CONTENT_WIDTH.desktop,
    zoom: cardWidth / CONTENT_WIDTH.desktop,
    radius: width * 0.8,
    step: 25,
    perspective: width * 1.8,
    pop: Math.min(250, width * 0.16),
    height: cardHeight + 150,
    top: 44,
  };
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** 탭이 보이는지. 다른 탭에 있다가 돌아오면 자동 넘김을 다시 시작한다. */
function usePageVisible() {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== "hidden",
    () => true
  );
}

function wrapOffset(index: number, rotation: number, count: number) {
  const raw = index - rotation;
  const half = count / 2;
  return ((((raw + half) % count) + count) % count) - half;
}

/** 메인 아래 캐러셀 카드와 말풍선 문구. 한국어·영어를 `c("한글", "English")`로 나란히 적는다. */
function useCarouselCopy() {
  const c = useC();
  return {
    label: c("Harper에게 맡긴 일들", "Things people hand to Harper"),
    cards: [
      {
        id: "agents",
        kind: "answer",
        prompt: c(
          "결제 백엔드 4년 했어요. 에이전트 만드는 팀 찾아 줘.",
          "4 years in payments backend. Find me teams building agents."
        ),
        status: c("3분 41초 동안 작업", "Worked for 3m 41s"),
        blocks: [
          {
            kind: "h",
            text: c(
              "1. Cognition — AI 코딩 에이전트 Devin",
              "1. Cognition — Devin, the AI coding agent"
            ),
          },
          {
            kind: "p",
            text: c(
              "5월에 **10억 달러 넘게** 투자받았고, 서울에서 **Forward Deployed Engineer**를 찾고 있어요. 고객사에 Devin을 붙이는 일이라 결제 백엔드 경험이 바로 쓰여요. {{투자 기사}}",
              "Raised **over $1B** in May and is hiring a **Forward Deployed Engineer** in Seoul, rolling Devin out inside customers’ systems, so your payments work applies directly. {{Funding news}}"
            ),
          },
          {
            kind: "ul",
            items: [
              c(
                "**지원 경로:** {{공식 채용 페이지}}",
                "**Apply via:** {{Careers page}}"
              ),
            ],
          },
          {
            kind: "h",
            text: "2. Anthropic — Claude",
          },
        ],
      },
      {
        id: "pm",
        kind: "answer",
        prompt: c(
          "PM으로 가는 게 맞을지 모르겠어. 같이 고민해 줘.",
          "Not sure if I should move to PM. Help me think it through."
        ),
        status: c("18초 동안 생각", "Thought for 18s"),
        blocks: [
          {
            kind: "p",
            text: c(
              "지금 경력으로 PM에 가면 **강점 두 가지**와 **먼저 확인할 것 하나**가 있어요.",
              "If you move to PM, you’d bring **two strengths**, and there’s **one thing to check first**."
            ),
          },
          {
            kind: "ul",
            items: [
              c(
                "**강점:** 정산 시스템을 만들며 재무·CS 팀과 요구사항을 맞춰 온 경험",
                "**Strength:** you’ve aligned requirements with finance and CS while building settlement systems"
              ),
              c(
                "**강점:** 장애를 직접 겪어 봐서 우선순위 판단이 현실적이에요",
                "**Strength:** you’ve lived through outages, so your prioritization is grounded"
              ),
              c(
                "**확인할 것:** 무엇을 만들지 직접 정해 본 적이 있는지",
                "**To check:** whether you’ve owned decisions about what to build"
              ),
            ],
          },
          {
            kind: "p",
            text: c(
              "세 번째부터 같이 이야기해 볼까요?",
              "Want to start with that last one?"
            ),
          },
        ],
      },
      {
        id: "interview",
        kind: "answer",
        prompt: "",
        notice: {
          label: c("먼저 알려드려요", "Before you ask"),
          text: c(
            "Anthropic 면접이 잡혔어요. 질문 3개로 미리 연습해 볼까요?",
            "Your Anthropic interview is set. Want to practice with three questions?"
          ),
        },
        status: c("12초 동안 생각", "Thought for 12s"),
        blocks: [
          {
            kind: "p",
            text: c(
              "Anthropic **Applied AI Architect** 면접에 맞춰 질문 3개를 준비했어요. 첫 번째부터 해 볼게요.",
              "I prepared three questions for the Anthropic **Applied AI Architect** interview. Let’s start with the first."
            ),
          },
          {
            kind: "p",
            text: c(
              "**Q1.** 고객사가 Claude로 상담 에이전트를 만든다면, 잘 동작하는지 어떻게 평가하시겠어요?",
              "**Q1.** A customer is building a support agent on Claude. How would you evaluate whether it works well?"
            ),
          },
          {
            kind: "p",
            text: c(
              "채팅으로 편하게 답해 주세요. 답을 듣고 보완할 점을 알려 드릴게요.",
              "Answer in chat whenever you’re ready. I’ll tell you what to strengthen."
            ),
          },
        ],
      },
      {
        id: "founder",
        kind: "email",
        prompt: c(
          "공고 없는 곳은 대표한테 직접 연락해 줘.",
          "If there’s no opening, reach out to the founder."
        ),
        title: c("Brindle: 보낼 메일 확인", "Brindle: review an email"),
        fields: [
          {
            label: c("받는 사람", "To"),
            value: "seojun@brindle.ai",
          },
          {
            label: c("제목", "Subject"),
            value: c(
              "결제 백엔드 4년, Brindle 첫 백엔드 엔지니어로 이야기 나눌 수 있을까요",
              "Payments backend, 4 years: could we talk about Brindle’s first backend role?"
            ),
          },
        ],
        hold: c("보류하기", "Hold for now"),
        send: c("지금 보내기", "Send now"),
      },
      {
        id: "reply",
        kind: "email",
        prompt: "",
        notice: {
          label: c("먼저 알려드려요", "Before you ask"),
          text: c(
            "Brindle 대표가 답장했어요. 커피챗 일정 잡아 드릴까요?",
            "Brindle’s CEO replied. Want me to set up a coffee chat?"
          ),
        },
        status: c("48초 동안 작업", "Worked for 48s"),
        lead: c(
          "서준 님이 **커피챗**을 하자고 답장했어요. 답장을 써 뒀어요.",
          "Seojun replied asking for a **coffee chat**. I drafted a reply."
        ),
        title: c("Brindle: 보낼 답장 확인", "Brindle: review a reply"),
        fields: [
          {
            label: c("메일", "Email"),
            value: c(
              "서준 님, 답장 감사합니다. 다음 주 화요일 오후 3시나 목요일 오후 4시에 커피챗 어떠세요?",
              "Hi Seojun, thanks for the reply. Would Tuesday at 3 PM or Thursday at 4 PM next week work for a coffee chat?"
            ),
            multiline: true,
          },
        ],
        hold: c("보류하기", "Hold for now"),
        send: c("지금 보내기", "Send now"),
      },
      {
        id: "vc",
        kind: "answer",
        prompt: c(
          "AI 투자 쪽으로 옮기고 싶어. 서울에서.",
          "I want to move into AI investing, in Seoul."
        ),
        status: c("2분 12초 동안 작업", "Worked for 2m 12s"),
        blocks: [
          {
            kind: "h",
            text: c("SBVA — AI 중심 아시아 VC", "SBVA — AI-first Asia VC"),
          },
          {
            kind: "p",
            text: c(
              "운용자산 **20억 달러**, 투자 300건이 넘는 아시아 VC예요. 프론티어 AI에 집중하고 있고, 서울에서 **AI 투자 Associate**를 찾고 있어요.",
              "An Asia VC with **$2B** under management and 300+ investments, now focused on frontier AI. It’s hiring an **Associate, AI Investments** in Seoul."
            ),
          },
          {
            kind: "ul",
            items: [
              c(
                "**지원 경로:** Harper 연결 · 투자팀에 바로 소개할 수 있어요",
                "**Apply via:** Harper intro · straight to the investment team"
              ),
            ],
          },
        ],
      },
      {
        id: "visa",
        kind: "answer",
        prompt: c(
          "샌프란으로 가고 싶어. 비자 스폰서 해 주는 AI 스타트업 찾아서 대신 지원해 줘.",
          "I want to move to SF. Find AI startups that sponsor visas and apply for me."
        ),
        status: c("4분 2초 동안 작업", "Worked for 4m 2s"),
        blocks: [
          {
            kind: "p",
            text: c(
              "샌프란시스코 AI 회사 **세 곳**의 비자 지원을 확인했어요.",
              "I checked **three** San Francisco AI companies for visa sponsorship."
            ),
          },
          {
            kind: "ul",
            items: [
              c(
                "**Anthropic** — 채용 페이지에 비자 지원을 적어 뒀어요",
                "**Anthropic** — sponsorship is stated on its careers page"
              ),
              c(
                "**Cognition** — 미국 이민 업무를 맡는 팀이 따로 있어요",
                "**Cognition** — has a team that handles US immigration"
              ),
              c(
                "**Blockit** — 비자 지원 여부를 채용팀에 묻는 중이에요",
                "**Blockit** — asking the hiring team about sponsorship"
              ),
            ],
          },
        ],
        applied: {
          title: "Anthropic · Applied AI Engineer",
          state: c("지원함", "Applied"),
        },
      },
      {
        id: "followups",
        kind: "followups",
        notice: {
          label: c("먼저 알려드려요", "Before you ask"),
          text: c(
            "확인할 게 2개 있어요. 하나씩 같이 볼까요?",
            "Two things need you. Want to go through them?"
          ),
        },
        date: c(
          "11월 10일 화요일 · 오후 2:41",
          "Tuesday, November 10 · 2:41 PM"
        ),
        heading: c("지금 팔로업 2", "Follow-ups · 2"),
        items: [
          {
            title: c(
              "Brindle 대표에게 보낼 메일 확인",
              "Review your email to Brindle’s CEO"
            ),
            body: c(
              "채용 페이지에 없는 기회라 한서준 대표에게 보낼 메일을 써 뒀어요. 아직 보내지 않았어요.",
              "There’s no opening on their careers page, so I drafted a note to CEO Seojun Han. Nothing has been sent."
            ),
            action: c("메일 확인하기", "Review email"),
          },
          {
            title: c("Cognition 지원 여부 정하기", "Decide on Cognition"),
            body: c(
              "서울 Forward Deployed Engineer예요. 지원할지 알려 주세요.",
              "The Seoul Forward Deployed Engineer role. Should I apply?"
            ),
            action: c("지원 여부 알려주기", "Answer"),
          },
        ],
        close: c("닫기", "Close"),
      },
    ] satisfies CarouselCard[],
  };
}

export function HeroCarousel() {
  const { cards, label } = useCarouselCopy();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const rotation = useMotionValue(0);
  const [target, setTarget] = useState(0);
  const [settled, setSettled] = useState(0);
  const [dragging, setDragging] = useState(false);
  const reducedMotion = useReducedMotion();
  const inView = useInView(containerRef, { amount: 0.2 });
  const pageVisible = usePageVisible();
  const count = cards.length;
  const activeIndex = ((target % count) + count) % count;
  const settledIndex = ((settled % count) + count) % count;
  const layout = computeLayout(width || 1280);
  // 원통에서 이웃한 카드 사이의 가로 거리. 이만큼 끌면 카드 한 장이 넘어간다.
  const cardSpacing = layout.radius * Math.sin((layout.step * Math.PI) / 180);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startRotation: number;
    active: boolean;
    samples: { x: number; t: number }[];
  } | null>(null);
  // 끌기가 끝난 직후 카드에 들어오는 click을 선택으로 처리하지 않는다.
  const suppressClick = useRef(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => setWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const goTo = useCallback(
    (next: number) => {
      setTarget(next);
      if (reducedMotion) {
        rotation.set(next);
        setSettled(next);
        return;
      }
      animate(rotation, next, {
        duration: ROTATE_S,
        ease: ROTATE_EASE,
        onComplete: () => setSettled(next),
      });
    },
    [reducedMotion, rotation]
  );

  useEffect(() => {
    if (reducedMotion || dragging || !inView || !pageVisible) return;
    const timeoutId = window.setTimeout(() => goTo(target + 1), HOLD_MS);
    return () => window.clearTimeout(timeoutId);
  }, [dragging, goTo, inView, pageVisible, reducedMotion, target]);

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!state.active) return;
    setDragging(false);
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    // 놓기 직전 속도만큼 더 굴린 자리에서 가장 가까운 카드에 멈춘다. 한 번에 3장까지만 넘긴다.
    const recent = state.samples.filter(
      (sample) => event.timeStamp - sample.t < 100
    );
    const first = recent[0];
    const last = recent[recent.length - 1];
    const velocity =
      first && last && last.t > first.t
        ? (last.x - first.x) / (last.t - first.t)
        : 0;
    const current = rotation.get();
    const projected = current - (velocity * FLING_MS) / cardSpacing;
    const nearest = Math.round(current);
    const next = Math.max(
      nearest - 3,
      Math.min(nearest + 3, Math.round(projected))
    );
    goTo(next);
  };

  const goToCard = (index: number) => {
    if (suppressClick.current) return;
    const offset = wrapOffset(index, target, count);
    if (Math.abs(offset) < 0.01) return;
    goTo(target + Math.round(offset));
  };

  const activeCard = cards[activeIndex];

  return (
    <div
      ref={containerRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      className={cn(
        "relative mt-14 h-(--car-h) touch-pan-y select-none",
        dragging ? "cursor-grabbing" : "cursor-grab",
        "[mask-image:linear-gradient(90deg,transparent,#000_9%,#000_91%,transparent)] [-webkit-mask-image:linear-gradient(90deg,transparent,#000_9%,#000_91%,transparent)]"
      )}
      style={
        {
          "--car-h": `${layout.height}px`,
          "--car-w": `${layout.cardWidth}px`,
          "--car-card-h": `${layout.cardHeight}px`,
          "--car-persp": `${layout.perspective}px`,
          "--car-top": `${layout.top}px`,
          opacity: width ? 1 : 0,
          transition: "opacity 600ms cubic-bezier(.22,1,.36,1)",
        } as React.CSSProperties
      }
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.button !== 0 || reducedMotion) return;
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startRotation: rotation.get(),
          active: false,
          samples: [{ x: event.clientX, t: event.timeStamp }],
        };
      }}
      onPointerMove={(event) => {
        const state = drag.current;
        if (!state || state.pointerId !== event.pointerId) return;
        const dx = event.clientX - state.startX;
        if (!state.active) {
          if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
          // 돌던 회전을 그 자리에서 멈추고, 지금 각도부터 손을 따라가게 한다.
          rotation.stop();
          state.active = true;
          state.startX = event.clientX;
          state.startRotation = rotation.get();
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }
        const value =
          state.startRotation - (event.clientX - state.startX) / cardSpacing;
        rotation.set(value);
        setTarget(Math.round(value));
        state.samples = [
          ...state.samples.slice(-5),
          { x: event.clientX, t: event.timeStamp },
        ];
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="absolute inset-0 [perspective:var(--car-persp)] [perspective-origin:50%_42%]">
        {cards.map((card, index) => (
          <RingCard
            key={card.id}
            card={card}
            index={index}
            count={count}
            rotation={rotation}
            layout={layout}
            active={index === activeIndex}
            live={index === settledIndex && index === activeIndex}
            onSelect={() => goToCard(index)}
          />
        ))}
      </div>

      <div
        className="pointer-events-none absolute left-1/2 top-[calc(var(--car-top)+var(--car-card-h)-18px)] z-5 flex w-[min(420px,86vw)] -translate-x-1/2 justify-center"
        aria-live="off"
      >
        <AnimatePresence initial={false}>
          <PromptBubble key={activeCard.id} card={activeCard} />
        </AnimatePresence>
      </div>
    </div>
  );
}

function RingCard({
  card,
  index,
  count,
  rotation,
  layout,
  active,
  live,
  onSelect,
}: {
  card: CarouselCard;
  index: number;
  count: number;
  rotation: MotionValue<number>;
  layout: Layout;
  active: boolean;
  live: boolean;
  onSelect: () => void;
}) {
  const transform = useTransform(rotation, (value) => {
    const offset = wrapOffset(index, value, count);
    const angle = offset * layout.step;
    const radians = (angle * Math.PI) / 180;
    const x = layout.radius * Math.sin(radians);
    const z =
      layout.radius * (1 - Math.cos(radians)) +
      layout.pop * Math.max(0, 1 - Math.abs(offset));
    return `translate3d(${x.toFixed(2)}px, 0px, ${z.toFixed(2)}px) rotateY(${(-angle).toFixed(3)}deg)`;
  });
  const opacity = useTransform(rotation, (value) => {
    const distance = Math.abs(wrapOffset(index, value, count));
    if (distance <= 2.6) return 1;
    return Math.max(0, 1 - (distance - 2.6) / 0.7);
  });
  const zIndex = useTransform(rotation, (value) =>
    Math.round(100 - Math.abs(wrapOffset(index, value, count)) * 10)
  );

  return (
    <motion.div
      className={cn(
        "absolute left-1/2 top-(--car-top) ml-[calc(var(--car-w)/-2)] w-(--car-w) origin-center will-change-[transform,opacity]",
        CARD_SHADOW
      )}
      style={{ transform, opacity, zIndex, borderRadius: CARD_RADIUS }}
      aria-hidden={!active}
      onClick={onSelect}
    >
      <div
        className={cn(
          "relative h-(--car-card-h) overflow-hidden",
          CARD_BACKGROUND,
          CARD_FADE,
          // 3D로 기울어진 카드 안에서는 backdrop-filter가 깨져 보일 수 있어 끈다. 카드 바탕이 불투명해 차이가 없다.
          "[&_*]:[backdrop-filter:none]"
        )}
        // 움직이는 요소(작업 중 점)가 GPU 레이어로 올라가면 3D 카드 안에서 overflow·border-radius 자르기가 풀려
        // 모서리가 각지는 브라우저가 있다. clip-path는 그런 레이어까지 함께 자른다.
        style={{
          borderRadius: CARD_RADIUS,
          clipPath: `inset(0 round ${CARD_RADIUS}px)`,
        }}
      >
        {/* zoom은 레이아웃까지 줄여서, 줄인 뒤의 크기로 카드 안에 그대로 들어간다. */}
        <div
          className={CARD_CONTENT}
          style={{ width: layout.contentWidth, zoom: layout.zoom }}
        >
          <CardContent card={card} live={live} />
        </div>
      </div>
    </motion.div>
  );
}

/** 가운데에 자리 잡은 카드는 잠깐 ‘살펴보는 중’을 보였다가 결과로 바뀐다. */
function useLiveStatus(live: boolean) {
  const reducedMotion = useReducedMotion();
  const [working, setWorking] = useState(false);
  useEffect(() => {
    if (!live || reducedMotion) return;
    const start = window.setTimeout(() => setWorking(true), 0);
    const end = window.setTimeout(() => setWorking(false), 800);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(end);
      setWorking(false);
    };
  }, [live, reducedMotion]);
  return working;
}

function StatusLine({ text, live }: { text: string; live: boolean }) {
  const working = useLiveStatus(live);
  return (
    <div className={cn(tw.statusLine, "py-1 text-[14px] leading-6")}>
      {working ? (
        <>
          <WorkingDots />
          <span className={tw.shimmerText}>{text}</span>
        </>
      ) : (
        <>
          {text}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-[15px]"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </>
      )}
    </div>
  );
}

function CardContent({ card, live }: { card: CarouselCard; live: boolean }) {
  if (card.kind === "followups") {
    return (
      <div className="flex flex-col">
        <div className="text-[12.5px] leading-[18.75px] text-[#aeaeb2]">
          {card.date}
        </div>
        <div className="mt-1 text-[16px] font-medium leading-6 tracking-[-0.2px]">
          {card.heading}
        </div>
        <div className="mt-5 flex flex-col gap-3">
          {card.items.map((item, index) => (
            <motion.div
              key={item.title}
              className={cn(tw.glassStrong, "rounded-[18px] p-[18px]")}
              animate={
                live && index === 0 ? { scale: [1, 1.012, 1] } : { scale: 1 }
              }
              transition={{ duration: 1.2, delay: 0.9, ease: EASE }}
            >
              <div className="text-[22px] font-light leading-[28.6px] tracking-[-0.3px]">
                {item.title}
              </div>
              <div className="mt-1.5 text-[14px] leading-[21px] text-[#6e6e73]">
                {item.body}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[14px] font-medium leading-[22px]">
                  {item.action}
                  <ArrowRight className="size-3.5 text-[#aeaeb2]" />
                </span>
                <span className="px-1.5 py-1 text-[12.5px] leading-[18.75px] text-[#aeaeb2]">
                  {card.close}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  if (card.kind === "email") {
    return (
      <div className="flex flex-col gap-3">
        {card.status ? <StatusLine text={card.status} live={live} /> : null}
        {card.lead ? (
          <p>
            <RichText text={card.lead} />
          </p>
        ) : null}
        <div className={cn(tw.glassStrong, "rounded-[18px] p-4")}>
          <div className="text-[16px] font-medium leading-6">{card.title}</div>
          {card.fields.map((field) => (
            <div key={field.label} className="mt-4">
              <div
                className={cn(
                  tw.fieldLabel,
                  "text-[14px] font-medium leading-5 text-[#1d1d1f]"
                )}
              >
                {field.label}
              </div>
              <div
                className={cn(
                  tw.field,
                  "mt-2 text-[14px]",
                  !field.multiline && "truncate whitespace-nowrap"
                )}
              >
                {field.value}
              </div>
            </div>
          ))}
          <div className="mt-4 flex items-center gap-4">
            <span className={cn(tw.pill, tw.pillGhost, "h-[30px] px-[9px]")}>
              {card.hold}
            </span>
            <motion.span
              className={cn(tw.pill, tw.pillDark, "h-[30px] px-[9px]")}
              animate={live ? { scale: [1, 0.96, 1] } : { scale: 1 }}
              transition={{ duration: 0.5, delay: 1.6, ease: EASE }}
            >
              {card.send}
            </motion.span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <StatusLine text={card.status} live={live} />
      <div
        className={cn(
          tw.answer,
          "[&>*+*]:mt-4 [&_h4]:text-[16px] [&_h4]:font-medium [&_h4]:leading-6 [&_h4]:tracking-normal [&_h4+*]:mt-2 [&_li+li]:mt-0 [&_li]:pl-1 [&_ul]:pl-5"
        )}
      >
        {card.blocks.map((block, index) => {
          if (block.kind === "h") return <h4 key={index}>{block.text}</h4>;
          if (block.kind === "ul") {
            return (
              <ul key={index}>
                {block.items.map((item) => (
                  <li key={item}>
                    <RichText text={item} />
                  </li>
                ))}
              </ul>
            );
          }
          return (
            <p key={index}>
              <RichText text={block.text} />
            </p>
          );
        })}
      </div>
      {card.applied ? (
        <div
          className={cn(
            tw.glassStrong,
            "mt-2 flex w-fit items-center gap-3 px-4 py-3"
          )}
        >
          <CompanyMark
            logo="/svgs/anthropic.svg"
            size={30}
            eager
            className="rounded-[8px]"
          />
          <span className="flex flex-col leading-tight">
            <span className="text-[13px] font-medium">
              {card.applied.title}
            </span>
            <span className="mt-1 inline-flex items-center gap-1 text-[12px] text-[#1f7a4c]">
              <Check className="size-3" strokeWidth={2.4} />
              {card.applied.state}
            </span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

function PromptBubble({ card }: { card: CarouselCard }) {
  const notice = card.notice;
  const prompt = card.kind === "followups" ? "" : card.prompt;
  const isNotice = Boolean(notice) && !prompt;

  return (
    <motion.div
      className={cn(
        "relative max-w-full rounded-[22px] bg-white/92 px-[18px] py-[13px] text-[15px] leading-normal tracking-[-0.01em] text-[#1d1d1f]",
        "shadow-[rgb(29_29_31/0.1)_0_1px_2px_0,rgb(29_29_31/0.07)_0_3px_9px_0,rgb(29_29_31/0.12)_0_9px_45px_0]",
        "backdrop-blur-[24px] backdrop-saturate-[1.6]",
        isNotice &&
          "flex items-start gap-2.5 bg-[#1d1d1f]/92 text-white shadow-[0_1px_2px_rgb(0_0_0/0.2),0_18px_34px_-18px_rgb(20_20_30/0.6)]",
        "absolute inset-x-0 top-0 mx-auto w-fit max-w-full"
      )}
      initial={{
        opacity: 0,
        y: 6,
        filter: "blur(8px)",
        clipPath: "inset(0% 22% 0% 22% round 22px)",
      }}
      animate={{
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        clipPath: "inset(0% 0% 0% 0% round 22px)",
        transition: {
          duration: 0.5,
          delay: 0.22,
          ease: EASE,
          opacity: { duration: 0.32, delay: 0.22, ease: "easeOut" },
        },
      }}
      exit={{
        opacity: 0,
        y: 9,
        scale: 0.94,
        filter: "blur(2px)",
        transition: { duration: 0.36, ease: [0.4, 0, 0.6, 1] },
      }}
    >
      <motion.span
        className={cn("block", isNotice && "flex items-start gap-2.5")}
        initial={{ opacity: 0, filter: "blur(4px)" }}
        animate={{
          opacity: 1,
          filter: "blur(0px)",
          transition: { duration: 0.4, delay: 0.26, ease: EASE },
        }}
        exit={{
          opacity: 0,
          filter: "blur(2px)",
          transition: { duration: 0.14 },
        }}
      >
        {isNotice && notice ? (
          <>
            <HarperMark className="mt-0.5 size-[22px]" />
            <span>
              <span className="mb-0.5 block text-xs font-medium leading-[1.3] text-white/60">
                {notice.label}
              </span>
              {notice.text}
            </span>
          </>
        ) : (
          prompt
        )}
      </motion.span>
    </motion.div>
  );
}
