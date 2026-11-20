import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { GoogleStartAction } from "./GoogleStart";
import { HeroCarousel } from "./HeroCarousel";
import { EASE, Lines, useC } from "./primitives";
import { tw } from "./tw";

const TICK_MS = 3200;

/**
 * Harper가 지금 하는 일을 한 줄씩 보여 준다.
 * 알약 너비는 문장 길이에 맞춰 부드럽게 바뀌고, 초록 점은 아주 느리게 숨 쉬듯 깜빡인다.
 */
function Ticker({ label, ticks }: { label: string; ticks: readonly string[] }) {
  const [index, setIndex] = useState(0);
  const [textWidth, setTextWidth] = useState<number | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const reducedMotion = useReducedMotion();
  const text = ticks[index];

  useEffect(() => {
    if (reducedMotion) return;
    const intervalId = window.setInterval(() => {
      setIndex((current) => (current + 1) % ticks.length);
    }, TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [reducedMotion, ticks.length]);

  useLayoutEffect(() => {
    if (measureRef.current) setTextWidth(measureRef.current.offsetWidth);
  }, [text]);

  return (
    <div className={cn(tw.ticker, "bg-action/14 text-action font-medium")}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-action">
        <Image
          src="/svgs/face.svg"
          alt="Harper"
          width={16}
          height={16}
          className="size-4"
        />
      </span>
      {/* <span className={tw.liveDot} aria-hidden="true" /> */}
      <div className="text-black">
        <span className="">Harper가 일하는 중</span>
      </div>
      <span className="sr-only">{label}</span>
      <span
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute whitespace-nowrap"
      >
        {text}
      </span>
      <motion.span
        className="relative inline-grid h-5 overflow-hidden text-left"
        initial={false}
        animate={{ width: textWidth ?? "auto" }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={text}
            className="col-start-1 row-start-1 whitespace-nowrap leading-5"
            initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -12, filter: "blur(4px)" }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            {text}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </div>
  );
}

/** 메인 섹션 문구. 한국어·영어를 `c("한글", "English")`로 나란히 적는다. */
function useHeroCopy() {
  const c = useC();
  return {
    working: c("Harper가 일하는 중", "Harper at work"),
    ticks: [
      c(
        "Cognition 서울 기회를 살펴봤어요",
        "Looked into Cognition’s Seoul opportunity"
      ),
      c(
        "Brindle 대표 메일 주소를 찾았어요",
        "Found the email for Brindle’s CEO"
      ),
      c(
        "Anthropic 서울 오피스 소식을 확인했어요",
        "Checked Anthropic’s Seoul office news"
      ),
      c("새 기회 2개를 찾았어요", "Found 2 new opportunities"),
    ],
    title: [
      c("커리어 고민부터 지원까지,", "From career questions to applications,"),
      c("Harper가 다 해요.", "Harper does it all."),
    ],
    body: [
      c(
        "원하는 방향을 한 번 말하면, 맞는 기회를 찾아 살펴보고 대신 지원해요.",
        "Say what you want once. Harper finds the roles, researches them and applies for you."
      ),
      c(
        "채용 페이지에 없는 회사는 대표에게 연락하고, 면접 준비까지 같이 해요.",
        "No opening posted? It reaches the founder, then helps you prep for interviews."
      ),
    ],
    // note: c(
    //   "전체 무료 · 중요한 결정은 직접",
    //   "Free · Make important decisions yourself"
    // ),
  };
}

export function HeroSection({
  startHref,
  onStartClick,
  body,
  action,
}: {
  startHref: string;
  onStartClick?: MouseEventHandler<HTMLAnchorElement>;
  /** 메인 문구 실험처럼 본문을 바꿔 보여 줄 때만 넘긴다. */
  body?: readonly string[];
  /** 이메일 먼저 받기 실험처럼 시작 버튼 자리를 바꿀 때만 넘긴다. */
  action?: ReactNode;
}) {
  const copy = useHeroCopy();
  const bodyLines = body ?? copy.body;
  const reducedMotion = useReducedMotion();
  const enter = (delay: number) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 16, filter: "blur(8px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.9, delay, ease: EASE },
        };

  return (
    <section
      id="top"
      className={cn(
        tw.sky,
        "relative overflow-hidden pt-[112px] md:pt-[148px]"
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-240px] h-[720px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.95),rgb(255_255_255/0))]"
      />
      <div
        className={cn(
          tw.shell,
          "relative flex flex-col items-center text-center"
        )}
      >
        <motion.div {...enter(0)}>
          <Ticker label={copy.working} ticks={copy.ticks} />
        </motion.div>
        <motion.h1
          className={cn(
            "text-[clamp(30px,5.0vw,52px)] font-semibold leading-[1.12] tracking-[-0.035em] text-[#1d1d1f] [&_em]:not-italic [&_em]:text-[#8a8a90]",
            "mt-7 md:mt-8"
          )}
          {...enter(0.08)}
        >
          {copy.title[0]}
          <br />
          {copy.title[1]}
        </motion.h1>
        <motion.p
          className={cn(tw.lede, "mt-5 max-w-[720px] md:mt-6 md:text-[18px]")}
          {...enter(0.16)}
        >
          <span className="hidden md:inline">
            <Lines lines={bodyLines} />
          </span>
          <span className="md:hidden">{bodyLines.join(" ")}</span>
        </motion.p>
        <motion.div
          className="mt-8 flex flex-col items-center md:mt-10"
          {...enter(0.24)}
        >
          {action ?? (
            <GoogleStartAction
              startHref={startHref}
              onStartClick={onStartClick}
              // 문구에 note가 있을 때만 보여 준다. useHeroCopy의 note 주석을 풀면 다시 나타난다.
              note={
                "note" in copy && typeof copy.note === "string"
                  ? copy.note
                  : undefined
              }
            />
          )}
        </motion.div>
      </div>

      <motion.div
        className="relative z-10"
        {...(reducedMotion
          ? {}
          : {
              initial: { opacity: 0, y: 40 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 1.2, delay: 0.35, ease: EASE },
            })}
      >
        <HeroCarousel />
      </motion.div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent to-(--tl-base)"
      />
    </section>
  );
}
