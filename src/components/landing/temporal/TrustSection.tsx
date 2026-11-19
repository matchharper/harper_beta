import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Lock, LockOpen } from "lucide-react";
import Image from "next/image";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FreeReceiptVisual } from "@/components/landing/career/CareerTrustSection";
import { cn } from "@/lib/cn";
import {
  CompanyMark,
  EASE,
  HarperMark,
  SectionReveal,
  useSceneTimeline,
  useC,
  WaveTitle,
} from "./primitives";
import { tw } from "./tw";

/**
 * 안심 섹션. `CareerTrustSection`과 같은 구조로, 데스크톱에서 네 항목을 가로로 둔다.
 * 항목은 카드로 감싸지 않고 하늘색 무대 위 화면과 그 아래 한 문단(굵은 제목 + 설명)으로 만든다.
 * 무대 안 화면은 248px 고정 크기로 그리고 무대 너비에 맞춰 줄이거나 키운다.
 */

type TrustCopy = ReturnType<typeof useTrustCopy>;

const STAGE_WIDTH = 248;

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** 안심 섹션 문구. 한국어·영어를 `c("한글", "English")`로 나란히 적는다. */
function useTrustCopy() {
  const c = useC();
  return {
    title: [
      c("안심하고 맡기세요.", "Hand it over."),
      c(
        "중요한 일은 꼭 물어보고 해요.",
        "Harper asks before anything important."
      ),
    ],
    items: {
      confirm: {
        title: c("보내기 전엔 꼭 물어봐요", "It asks before sending"),
        body: c(
          "지원서 제출, 메일 발송, 프로필 공유처럼 되돌릴 수 없는 일은 회원님이 확인한 뒤에만 해요.",
          "Submitting applications, sending email, sharing your profile: anything you can’t take back happens only after you approve it."
        ),
        card: {
          title: c("Cognition에 지원할까요?", "Apply to Cognition?"),
          meta: c(
            "지원서와 이력서를 확인해 주세요",
            "Review the application and resume"
          ),
          hold: c("보류하기", "Hold"),
          approve: c("지원하기", "Apply"),
          done: c("지원했어요", "Applied"),
        },
      },
      private: {
        title: c("내 정보는 밖에서 볼 수 없어요", "Your data stays yours"),
        body: c(
          "대화와 이력은 외부에서 접근할 수 없게 암호화해 저장해요. 회원님이 허락하지 않은 곳에는 절대 보여 주지 않아요.",
          "Conversations and history are stored encrypted and can’t be accessed from outside. Nothing is shown anywhere you haven’t allowed."
        ),
        plain: [
          c("결제 백엔드 4년", "4 yrs payments backend"),
          c("희망 연봉 1억 2천", "Target pay ₩120M"),
          c("지금 회사엔 비밀", "Current employer: private"),
        ],
      },
      free: {
        title: c("후보자는 무료예요", "Free for candidates"),
        body: c(
          "대화, 추천, 지원서 작성, 회사 연결까지 모두 무료예요. 비용은 채용하는 회사가 내요.",
          "Chat, recommendations, applications and intros are all free. Hiring companies pay."
        ),
        lines: [
          c("대화와 추천", "Chat & recommendations"),
          c("지원서·메일 작성", "Applications & emails"),
          c("회사 연결", "Company intros"),
        ],
        amount: c("0원", "$0"),
        total: c("회원님 부담", "You pay"),
      },
      offer: {
        title: c(
          "원하면, 오퍼부터 받아 보세요",
          "Get the offer first, if you want"
        ),
        body: c(
          "정말 좋은 기회라면 Harper가 먼저 회원님을 회사에 소개해, 오퍼를 받아 본 뒤에 결정할 수 있게 해요. 직접 설정한 경우에만 이렇게 합니다.",
          "For truly great opportunities, Harper can introduce you first so you see an offer before deciding. Only if you turn this on."
        ),
        toggle: c("좋은 기회엔 먼저 소개하기", "Introduce me for great fits"),
        offerTitle: c("오퍼가 도착했어요", "An offer arrived"),
        offerMeta: "Wonderful · Founding FDE",
        decide: c("확인하고 결정하기", "Review and decide"),
      },
    },
  };
}

export function TrustSection() {
  const copy = useTrustCopy();
  const items = copy.items;
  return (
    <section id="trust" className="relative py-24 md:py-36">
      <div className={cn(tw.shell, "max-w-[1240px]")}>
        <SectionReveal className="mx-auto max-w-[760px] text-center">
          <WaveTitle lines={copy.title} />
        </SectionReveal>
        <div className="mt-12 grid grid-cols-1 gap-x-5 gap-y-12 sm:grid-cols-2 md:mt-20 lg:grid-cols-4">
          <TrustItem
            title={items.confirm.title}
            body={items.confirm.body}
            index={0}
          >
            <ConfirmVisual copy={items.confirm.card} />
          </TrustItem>
          <TrustItem
            title={items.private.title}
            body={items.private.body}
            index={1}
          >
            <PrivateVisual lines={items.private.plain} />
          </TrustItem>
          <TrustItem title={items.free.title} body={items.free.body} index={2}>
            <FreeReceiptVisual
              copy={{
                title: items.free.title,
                body: items.free.body,
                brand: "Harper",
                lines: items.free.lines,
                amount: items.free.amount,
                totalLabel: items.free.total,
              }}
            />
          </TrustItem>
          <TrustItem
            title={items.offer.title}
            body={items.offer.body}
            index={3}
          >
            <OfferVisual copy={items.offer} />
          </TrustItem>
        </div>
      </div>
    </section>
  );
}

function useStageScale(ref: React.RefObject<HTMLDivElement | null>) {
  const [scale, setScale] = useState(1);
  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const next = (node.clientWidth * 0.84) / STAGE_WIDTH;
      setScale(Math.min(1.2, Math.max(0.7, next)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return scale;
}

function TrustItem({
  title,
  body,
  index,
  children,
}: {
  title: string;
  body: string;
  index: number;
  children: ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const scale = useStageScale(stageRef);

  return (
    <SectionReveal className="flex h-full flex-col">
      <div
        ref={stageRef}
        aria-hidden="true"
        className={cn(
          tw.sky,
          "relative flex aspect-[1/1.04] select-none items-center justify-center overflow-hidden rounded-[20px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.75),inset_0_0_0_1.5px_rgb(20_30_45/0.03)]"
        )}
        style={{ transitionDelay: `${index * 70}ms` }}
      >
        <div
          className="flex shrink-0 justify-center"
          style={{ width: STAGE_WIDTH, transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
      <p className="mt-5 px-1 text-[15px] leading-[1.6] md:text-[16px]">
        <strong className="font-semibold text-(--tl-ink)">{title}</strong>{" "}
        <span className="text-(--tl-ink-2)">{body}</span>
      </p>
    </SectionReveal>
  );
}

function MouseCursor() {
  return (
    <svg
      width="15"
      height="20"
      viewBox="0 0 15 20"
      fill="none"
      className="drop-shadow-[0_2px_3px_rgb(0_0_0/0.22)]"
    >
      <path
        d="M1.2 1.2v15.1l3.7-3.6 2.5 5.7 2.6-1.1-2.5-5.6h5.2L1.2 1.2Z"
        fill="#1d1d1f"
        stroke="#fff"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------- 1. Ask before sending ---------- */

function ConfirmVisual({
  copy,
}: {
  copy: TrustCopy["items"]["confirm"]["card"];
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // 0 대기 · 1 누름 · 2 완료 · 3 정리
  const step = useSceneTimeline(ref, [1800, 600, 2600, 500]);
  const done = step === 2;

  return (
    <div ref={ref} className="relative w-[248px]">
      <motion.div
        className={cn(tw.glassStrong, "rounded-[16px] p-3.5")}
        animate={{ opacity: step === 3 ? 0 : 1, y: step === 3 ? 6 : 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <div className="flex items-start gap-2.5">
          <HarperMark className="mt-0.5 size-6" />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-medium tracking-[-0.01em] text-(--tl-ink)">
              {copy.title}
            </div>
            <div className="mt-0.5 text-[11.5px] leading-[1.45] text-(--tl-ink-2)">
              {copy.meta}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-[10px] bg-white/55 px-2.5 py-2 text-[11.5px] text-(--tl-ink-2) shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.06)]">
          <CompanyMark name="Cognition" size={16} className="rounded-[4px]" />
          <span className="truncate">Forward Deployed Engineer</span>
        </div>
        <div className="mt-3 flex items-center justify-end gap-1">
          <span className={cn(tw.pill, tw.pillGhost, "h-7 px-2.5 text-[12px]")}>
            {copy.hold}
          </span>
          <motion.span
            className={cn(
              tw.pill,
              "h-7 min-w-[72px] px-3 text-[12px] font-medium transition-colors duration-300",
              done ? "bg-[#1f7a4c] bg-none text-white shadow-none" : tw.pillDark
            )}
            animate={{ scale: step === 1 ? [1, 0.9, 1] : 1 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={done ? "done" : "idle"}
                className="inline-flex items-center gap-1"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
              >
                {done ? <Check className="size-3" strokeWidth={2.6} /> : null}
                {done ? copy.done : copy.approve}
              </motion.span>
            </AnimatePresence>
          </motion.span>
        </div>
      </motion.div>
      <motion.div
        aria-hidden="true"
        className="absolute"
        initial={false}
        animate={{
          right: step === 0 ? -4 : 20,
          bottom: step === 0 ? -30 : 2,
          opacity: step === 3 ? 0 : 1,
          scale: step === 1 ? 0.84 : 1,
        }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
      >
        <MouseCursor />
      </motion.div>
    </div>
  );
}

/* ---------- 2. Encrypted ---------- */

const CIPHER = "abcdef0123456789ABCDEFxyz+/=";

function scramble(text: string, ratio: number, seed: number) {
  return text
    .split("")
    .map((char, index) => {
      if (char === " ") return " ";
      const threshold = ((index * 7 + seed) % 100) / 100;
      if (threshold > ratio) return char;
      return CIPHER[(index * 13 + seed * 3) % CIPHER.length];
    })
    .join("");
}

function PrivateVisual({ lines }: { lines: readonly string[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // 0 원문 · 1 암호화 · 2 잠김 · 3 정리
  const step = useSceneTimeline(ref, [1500, 1100, 2600, 700]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (step !== 1) return;
    const intervalId = window.setInterval(
      () => setTick((value) => value + 1),
      55
    );
    return () => window.clearInterval(intervalId);
  }, [step]);

  const ratio =
    step === 0 || step === 3
      ? 0
      : step === 2
        ? 1
        : Math.min(1, (tick % 22) / 18);
  const locked = step === 2;

  return (
    <div
      ref={ref}
      className={cn(tw.glassStrong, "w-[248px] rounded-[16px] p-3.5")}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11.5px] text-(--tl-ink-2)">
          profile
        </span>
        <motion.span
          className={cn(
            "flex size-6 items-center justify-center rounded-full transition-colors duration-300",
            locked
              ? "bg-[#1d1d1f] text-white"
              : "bg-[#1d1d1f]/[0.06] text-(--tl-ink-2)"
          )}
          animate={{ scale: locked ? [1, 1.15, 1] : 1 }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          {locked ? (
            <Lock className="size-3" strokeWidth={2} />
          ) : (
            <LockOpen className="size-3" strokeWidth={2} />
          )}
        </motion.span>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {lines.map((line, index) => (
          <li
            key={line}
            className={cn(
              "truncate rounded-[9px] px-2.5 py-1.5 font-mono text-[11.5px] transition-colors duration-500",
              ratio > 0.5
                ? "bg-[#1d1d1f]/[0.04] text-(--tl-ink-3)"
                : "bg-white/55 text-(--tl-ink)"
            )}
          >
            {scramble(line, ratio, tick + index * 11)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- 4. Offer first ---------- */

function OfferVisual({ copy }: { copy: TrustCopy["items"]["offer"] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // 0 꺼짐 · 1 켜짐 · 2 오퍼 · 3 정리
  const step = useSceneTimeline(ref, [1300, 1100, 3400, 500]);
  const on = step === 1 || step === 2;

  return (
    <div ref={ref} className="flex w-[248px] flex-col gap-2.5">
      <div
        className={cn(
          tw.glassStrong,
          "flex items-center justify-between gap-2.5 rounded-[14px] px-3 py-2.5"
        )}
      >
        <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-(--tl-ink)">
          <HarperMark className="size-5" />
          <span className="truncate">{copy.toggle}</span>
        </span>
        <span
          className={cn(
            "relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-300",
            on ? "bg-[#1d1d1f]" : "bg-[#1d1d1f]/15"
          )}
        >
          <motion.span
            className="absolute top-[3px] size-4 rounded-full bg-white shadow-[0_2px_4px_rgb(0_0_0/0.25)]"
            initial={false}
            animate={{ left: on ? 19 : 3 }}
            transition={{ type: "spring", stiffness: 600, damping: 32 }}
          />
        </span>
      </div>
      <div className="h-[104px]">
        <AnimatePresence>
          {step === 2 ? (
            <motion.div
              className={cn(tw.glassStrong, "rounded-[14px] p-3.5")}
              initial={{ opacity: 0, y: 16, scale: 0.97, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <div className="flex items-center gap-2.5">
                <span className="relative size-8 overflow-hidden rounded-[9px] bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.08)]">
                  <Image
                    src="/images/logos/wonderful.jpg"
                    alt=""
                    fill
                    sizes="64px"
                    className="object-contain"
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-light tracking-[-0.2px] text-(--tl-ink)">
                    {copy.offerTitle}
                  </span>
                  <span className="block truncate text-[11.5px] text-(--tl-ink-2)">
                    {copy.offerMeta}
                  </span>
                </span>
              </div>
              <div className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-medium text-(--tl-ink)">
                {copy.decide}
                <ArrowRight className="size-3 text-(--tl-ink-3)" />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
