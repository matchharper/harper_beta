import {
  AnimatePresence,
  motion,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { GoogleStartAction } from "./GoogleStart";
import { EASE, useC } from "./primitives";
import { tw } from "./tw";

/**
 * 마지막 섹션 시안 네 개. `?closing=a|b|c|d`나 화면 왼쪽 아래 버튼으로 바꿔 본다.
 * A 구름 사진이 화면 전체로 펼쳐짐 · B 실제 회사가 적힌 플립 보드 · C Team Harper의 편지
 * D 사진이 천천히 시계 방향으로 도는 궤도(jackandjill.ai의 clockwork 섹션 구조)
 */

export type ClosingVariant = "a" | "c" | "d";

type ClosingCopy = ReturnType<typeof useClosingCopy>;

type ClosingProps = {
  variant: ClosingVariant;
  /** 시안 비교용 전환 버튼. 넘기지 않으면 버튼을 그리지 않는다. */
  onVariantChange?: (variant: ClosingVariant) => void;
  /** 이메일 먼저 받기 실험처럼 시작 버튼 자리를 바꿀 때만 넘긴다. */
  action?: ReactNode;
  startHref: string;
  onStartClick?: MouseEventHandler<HTMLAnchorElement>;
};

/** 마지막 섹션 문구. 한국어·영어를 `c("한글", "English")`로 나란히 적는다. */
function useClosingCopy() {
  const c = useC();
  return {
    title: [
      c("한마디면 돼요.", "Just say the word."),
      c("나머지는 Harper가 챙길게요.", "Harper takes care of the rest."),
    ],
    cta: c("Harper 시작하기", "Get started with Harper"),
    note: c(
      "후보자는 무료예요 · 보내기 전엔 꼭 물어봐요",
      "Free for candidates · Harper always asks before sending"
    ),
    sky: {
      free: c("후보자는 무료예요", "Free for candidates"),
    },
    clockwork: {
      title: [
        c("좋은 사람과 좋은 팀이", "Helping great people"),
        c("제때 만나도록", "and great teams meet on time"),
      ],
      lead: c(
        "다음 일은 삶의 방향을 바꿔요.",
        "Your next role can change the direction of your life."
      ),
      body: c(
        "Harper는 회원님이 일하는 동안 기회를 찾고, 회사와 먼저 이야기하고, 지원까지 챙겨요. 회원님은 정말 중요한 결정에만 시간을 쓰면 돼요.",
        "While you work, Harper finds opportunities, talks to companies first and handles the applications. You spend your time only on the decisions that matter."
      ),
    },
    variantLabel: c("마지막 섹션 시안", "Closing concept"),
  };
}

export function ClosingSection({
  variant,
  onVariantChange,
  startHref,
  onStartClick,
  action,
}: ClosingProps) {
  const copy = useClosingCopy();
  const actionProps = { copy, startHref, onStartClick, action };
  return (
    <>
      <div id="closing-anchor" className="scroll-mt-16" />
      {variant === "a" ? <ClosingCloud {...actionProps} /> : null}
      {variant === "c" ? <ClosingSky {...actionProps} /> : null}
      {variant === "d" ? <ClosingClockwork {...actionProps} /> : null}
      {onVariantChange ? (
        <VariantSwitcher
          label={copy.variantLabel}
          value={variant}
          onChange={onVariantChange}
        />
      ) : null}
    </>
  );
}

type ActionProps = {
  copy: ClosingCopy;
  startHref: string;
  onStartClick?: MouseEventHandler<HTMLAnchorElement>;
  action?: ReactNode;
};

function BlurWords({
  text,
  active,
  delay = 0,
  className,
}: {
  text: string;
  active: boolean;
  delay?: number;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          className="inline-block whitespace-pre"
          initial={false}
          animate={
            reducedMotion || active
              ? { opacity: 1, y: 0, filter: "blur(0px)" }
              : { opacity: 0, y: 14, filter: "blur(10px)" }
          }
          transition={{
            duration: 0.9,
            delay: delay + index * 0.07,
            ease: EASE,
          }}
        >
          {word}
          {index < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </span>
  );
}

/* ================= A. Cloud reveal ================= */

function ClosingCloud({ copy, startHref, onStartClick, action }: ActionProps) {
  const ref = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end end"],
  });
  const inset = useTransform(scrollYProgress, [0, 0.75], [6, 0]);
  const radius = useTransform(scrollYProgress, [0, 0.75], [36, 0]);
  const clipPath = useTransform(
    [inset, radius] as MotionValue<number>[],
    ([value, r]) => `inset(0% ${value}% round ${r}px)`
  );
  const imageScale = useTransform(scrollYProgress, [0, 1], [1.22, 1]);
  const imageY = useTransform(scrollYProgress, [0, 1], ["-6%", "0%"]);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const titleInView = useInView(titleRef, { amount: 0.6, once: true });

  return (
    <section ref={ref} className="relative mt-10">
      <motion.div
        className="relative flex min-h-[640px] items-center justify-center overflow-hidden md:min-h-[min(100vh,880px)]"
        style={reducedMotion ? undefined : { clipPath }}
      >
        <motion.div
          className="absolute inset-0"
          style={reducedMotion ? undefined : { scale: imageScale, y: imageY }}
        >
          <Image
            src="/images/bluebluesky.png"
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
        </motion.div>
        <div className="absolute inset-0 bg-[radial-gradient(55%_50%_at_50%_45%,rgb(255_255_255/0.7),rgb(255_255_255/0)_72%),linear-gradient(180deg,rgb(10_30_60/0.05),rgb(10_30_60/0.25))]" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(180deg,transparent,rgb(255_255_255/0.18))]"
        />
        <div
          ref={titleRef}
          className="relative z-10 flex flex-col items-center px-6 text-center"
        >
          <h2 className={cn(tw.display, "text-[#0f1626]")}>
            <BlurWords text={copy.title[0]} active={titleInView} />
            <br />
            <BlurWords
              text={copy.title[1]}
              active={titleInView}
              delay={0.25}
              className="text-[#0f1626]/55"
            />
          </h2>
          <motion.div
            className="mt-10 flex flex-col items-center"
            initial={false}
            animate={
              titleInView || reducedMotion
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: 12 }
            }
            transition={{ duration: 0.8, delay: 0.7, ease: EASE }}
          >
            {action ?? (
              <>
                <Link
                  href={startHref}
                  onClick={onStartClick}
                  className={tw.cta}
                >
                  {copy.cta}
                  <ArrowRight
                    className={cn("size-4", tw.ctaArrow)}
                    strokeWidth={2}
                  />
                </Link>
                <p className="mt-4 text-[13px] text-[#0f1626]/60">
                  {copy.note}
                </p>
              </>
            )}
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

/* ================= C. Sky ================= */

/**
 * 첨부 HTML의 마지막 섹션(로고 · 제목 · Google 시작 · 무료 안내)을 하늘 배경 위에 둔다.
 * 배경: 위는 흰색, 아래로 갈수록 하늘색. 큰 흰 호(지평선)와 그 가장자리의 옅은 빛,
 * 아래쪽 흐린 구름 사진과 연보라 기운, 고운 입자를 겹쳐 단순한 그라데이션처럼 보이지 않게 한다.
 * 아래의 큰 Harper 글자는 깊이 그림자 · 위에서 아래로 옅어지는 흰 채움 · 아래쪽 유리 음영 ·
 * 흰 테두리를 겹친 반투명 유리 글자다.
 */
const SKY_GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

const GLASS_WORD =
  "col-start-1 row-start-1 select-none whitespace-nowrap text-[clamp(140px,23vw,380px)] font-semibold leading-[0.82] tracking-[-0.05em]";

function ClosingSky({ copy, startHref, onStartClick, action }: ActionProps) {
  const ref = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();
  const inView = useInView(ref, { amount: 0.3, once: true });
  const shown = inView || Boolean(reducedMotion);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end end"],
  });
  const wordY = useTransform(scrollYProgress, [0, 1], ["16%", "0%"]);
  const arcY = useTransform(scrollYProgress, [0, 1], ["-6%", "0%"]);

  return (
    <section
      ref={ref}
      className="relative isolate mt-10 min-h-[640px] overflow-hidden bg-[linear-gradient(180deg,#f3f5f7_0%,#ffffff_12%,#fafbfe_30%,#e6eefb_48%,#c3d6f6_64%,#a3c0f0_80%,#8fb2eb_100%)] md:min-h-[720px]"
    >
      {/* 흰 지평선 호와 가장자리의 옅은 빛 */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-40%] top-[-60%] h-[120%] w-[165%] -rotate-[8deg]"
        style={reducedMotion ? undefined : { y: arcY }}
      >
        <div className="absolute inset-0 rounded-[50%] bg-[radial-gradient(closest-side,#ffffff_0%,#ffffff_80%,rgb(255_255_255/0.9)_88%,rgb(255_255_255/0)_100%)]" />
        <div className="absolute -inset-[2%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(255_255_255/0)_88%,rgb(236_243_253/0.95)_94%,rgb(214_228_250/0)_100%)]" />
      </motion.div>

      {/* 앞 섹션의 바탕색에서 자연스럽게 이어지도록 위쪽을 흐린다. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-56 bg-linear-to-b from-(--tl-base) via-(--tl-base)/60 to-transparent"
      />

      {/* 아래쪽 흐린 구름과 연보라 기운 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] opacity-45 mix-blend-screen [mask-image:linear-gradient(180deg,transparent,#000_45%)]"
      >
        <Image
          src="/images/bluesky.jpg"
          alt=""
          fill
          sizes="100vw"
          className="scale-110 object-cover blur-[22px]"
        />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_8%_100%,rgb(172_164_238/0.32),transparent_70%),radial-gradient(45%_40%_at_96%_92%,rgb(255_255_255/0.28),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
        style={{ backgroundImage: SKY_GRAIN }}
      />

      <motion.div
        className="relative z-10 flex flex-col items-center px-6 pt-24 text-center md:pt-32"
        initial={false}
        animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        transition={{ duration: 0.9, ease: EASE }}
      >
        <Image
          src="/svgs/logov2.svg"
          alt="Harper"
          width={66}
          height={30}
          className="h-[30px] w-auto"
        />
        <h2 className="mt-7 text-[clamp(32px,4vw,46px)] font-semibold leading-[1.2] tracking-[-0.035em] text-[#1d1d1f]">
          {copy.title[0]}
          <br />
          {copy.title[1]}
        </h2>
        {action ? (
          <div className="mt-9">{action}</div>
        ) : (
          <GoogleStartAction
            className="mt-9"
            startHref={startHref}
            onStartClick={onStartClick}
            note={copy.sky.free}
          />
        )}
      </motion.div>

      {/* 반투명 유리 글자 */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-[2vw]"
        style={reducedMotion ? undefined : { y: wordY }}
      >
        <span className="grid">
          {/* 깊이: 글자 아래로 번지는 푸른 그림자 */}
          <span
            className={cn(
              GLASS_WORD,
              "translate-y-[8px] text-[rgb(64_104_176/0.2)] blur-[18px]"
            )}
          >
            Harper
          </span>
          {/* 가장자리: 글자 둘레의 부드러운 흰 빛과 위쪽 1px 하이라이트 */}
          <span
            className={cn(
              GLASS_WORD,
              "text-[rgb(255_255_255/0.1)] [text-shadow:0_1px_0_rgb(255_255_255/0.75),0_0_2px_rgb(255_255_255/0.6),0_0_22px_rgb(255_255_255/0.4)]"
            )}
          >
            Harper
          </span>
          {/* 채움: 위는 밝고 아래로 옅어지는 반투명 흰색 */}
          <span
            className={cn(
              GLASS_WORD,
              "bg-[linear-gradient(180deg,rgb(255_255_255/0.8)_0%,rgb(255_255_255/0.55)_40%,rgb(255_255_255/0.34)_100%)] bg-clip-text text-transparent"
            )}
          >
            Harper
          </span>
          {/* 아래쪽 유리 음영 */}
          <span
            className={cn(
              GLASS_WORD,
              "bg-[linear-gradient(180deg,transparent_58%,rgb(104_140_206/0.18)_100%)] bg-clip-text text-transparent"
            )}
          >
            Harper
          </span>
        </span>
      </motion.div>
    </section>
  );
}

/* ================= D. Clockwork ================= */

/**
 * 궤도를 도는 사진. `width`는 1440px 화면 기준 너비, `ratio`는 높이/너비(잘라서 보여 줌),
 * `angle`은 궤도 위 시작 각도(도). 밤의 작업, 출근길, 커피챗, 창밖을 보는 순간처럼
 * 한 사람의 이직 과정을 떠올리게 하는 장면으로 골랐다.
 * 출처: Unsplash(무료 라이선스, 상업적 사용 가능). 파일 이름 옆에 사진 ID를 적어 둔다.
 */
const CLOCKWORK_PHOTOS = [
  {
    src: "/images/landing/clockwork/night-desk.jpg",
    width: 132,
    ratio: 0.68,
    angle: -47,
  }, // 1521999693742
  {
    src: "/images/landing/clockwork/coffee-chat.jpg",
    width: 112,
    ratio: 0.8,
    angle: 1,
  }, // 1604881988758
  {
    src: "/images/landing/clockwork/subway-platform.jpg",
    width: 96,
    ratio: 1.45,
    angle: -92,
  }, // 1549462939
  {
    src: "/images/landing/clockwork/night-window-laptop.jpg",
    width: 150,
    ratio: 0.66,
    angle: 45,
  }, // 1494322296366
  {
    src: "/images/landing/clockwork/window-thinking.jpg",
    width: 104,
    ratio: 1.3,
    angle: 90,
  }, // 1603136324205
  {
    src: "/images/landing/clockwork/city-sill.jpg",
    width: 92,
    ratio: 1.15,
    angle: 178,
  }, // 1552360708
  {
    src: "/images/landing/clockwork/day-window-typing.jpg",
    width: 118,
    ratio: 0.9,
    angle: -137,
  }, // 1503945438517
  {
    src: "/images/landing/clockwork/window-silhouette.jpg",
    width: 98,
    ratio: 1.35,
    angle: 135,
  }, // 1609574073245
] as const;

const CLOCKWORK_SECONDS = 96;

type OrbitGeometry = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  scale: number;
};

function ClockworkPhoto({
  photo,
  orbit,
  geometry,
}: {
  photo: (typeof CLOCKWORK_PHOTOS)[number];
  orbit: MotionValue<number>;
  geometry: OrbitGeometry;
}) {
  const transform = useTransform(orbit, (value) => {
    const theta = ((photo.angle + value) * Math.PI) / 180;
    const x = geometry.cx + Math.cos(theta) * geometry.rx;
    const y = geometry.cy + Math.sin(theta) * geometry.ry;
    return `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  });
  const width = photo.width * 0.85 * geometry.scale;
  return (
    <motion.div
      className="absolute left-0 top-0 overflow-hidden bg-[#e9ecf0] will-change-transform"
      style={{ transform, width, height: width * photo.ratio }}
    >
      <Image
        src={photo.src}
        alt=""
        fill
        sizes="160px"
        className="object-cover"
      />
    </motion.div>
  );
}

function ClosingClockwork({
  copy,
  startHref,
  onStartClick,
  action,
}: ActionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 1440, height: 930 });
  const orbit = useMotionValue(0);
  const reducedMotion = useReducedMotion();
  const inView = useInView(sectionRef, { amount: 0.1 });
  const titleInView = useInView(sectionRef, { amount: 0.3, once: true });
  const wide = size.width >= 1024;

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const update = () =>
      setSize({ width: node.clientWidth, height: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // 96초에 한 바퀴, 시계 방향. 화면 밖이거나 동작 줄이기 설정이면 멈춘다.
  useAnimationFrame((_, delta) => {
    if (reducedMotion || !inView) return;
    orbit.set((orbit.get() + (delta / 1000) * (360 / CLOCKWORK_SECONDS)) % 360);
  });

  // 넓은 화면: 왼쪽 제목을 중심으로 큰 타원. 좁은 화면: 위쪽 448px 안에서 가운데 제목을 감싼다.
  const wellHeight = wide ? size.height : 448;
  const geometry: OrbitGeometry = wide
    ? {
        cx: size.width * 0.1826,
        cy: wellHeight * 0.4817,
        rx: size.width * 0.2472,
        ry: wellHeight * 0.3828,
        scale: size.width / 1440,
      }
    : {
        cx: size.width * 0.5,
        cy: wellHeight * 0.5,
        rx: size.width * 0.42,
        ry: wellHeight * 0.54,
        scale: Math.max(0.62, (size.width / 1440) * 1.6),
      };
  const cw = copy.clockwork;

  return (
    <section
      ref={sectionRef}
      className="relative mt-10 border-t border-black/[0.07] bg-white"
    >
      <div
        ref={stageRef}
        className="relative mx-auto w-full max-w-[1440px] overflow-x-clip pb-16 md:pb-24 lg:aspect-[1440/930] lg:pb-0"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-0"
          style={{ height: wellHeight }}
        >
          {CLOCKWORK_PHOTOS.map((photo) => (
            <ClockworkPhoto
              key={photo.src}
              photo={photo}
              orbit={orbit}
              geometry={geometry}
            />
          ))}
        </div>

        <div className="relative z-10 flex flex-col gap-8 px-5 md:px-8 lg:grid lg:min-h-full lg:grid-cols-2 lg:items-start lg:gap-16 lg:px-16 lg:pt-[25rem]">
          <h2
            className={cn(
              tw.h2,
              "flex min-h-[448px] items-center justify-center text-center lg:block lg:min-h-0 lg:max-w-[34rem] lg:text-left"
            )}
          >
            <span>
              <BlurWords text={cw.title[0]} active={titleInView} />
              <br />
              <BlurWords text={cw.title[1]} active={titleInView} delay={0.2} />
            </span>
          </h2>
          <div className="mx-auto flex w-full max-w-[32rem] flex-col items-start gap-4 lg:mx-0 lg:max-w-none">
            <p className="text-[19px] leading-[1.55] tracking-[-0.01em] text-[#1d1d1f]/62 md:text-[21px]">
              {cw.lead}
            </p>
            <p className="text-[15.5px] leading-[1.7] text-[#1d1d1f]/62 md:text-[16px]">
              {cw.body}
            </p>
            {action ? (
              <div className="mt-4 self-end">{action}</div>
            ) : (
              <Link
                href={startHref}
                onClick={onStartClick}
                className={cn(
                  tw.pill,
                  tw.pillDark,
                  tw.focusRing,
                  "mt-4 h-10 self-end px-4 text-[14px] font-medium"
                )}
              >
                {copy.cta}
                <ArrowRight className="size-3.5" strokeWidth={2} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================= Variant switcher ================= */

function VariantSwitcher({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ClosingVariant;
  onChange: (variant: ClosingVariant) => void;
}) {
  const options: ClosingVariant[] = ["a", "c", "d"];
  return (
    <div className="fixed bottom-4 left-4 z-[55] flex items-center gap-2 rounded-full bg-white/80 py-1.5 pl-3.5 pr-1.5 text-[12.5px] text-[#1d1d1f] shadow-[0_0_0_0.5px_rgb(0_0_0/0.1),0_10px_30px_-12px_rgb(20_30_45/0.45)] backdrop-blur-xl">
      <span className="text-[#6e6e73]">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-0.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => {
              onChange(option);
              document
                .getElementById("closing-anchor")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={cn(
              "flex size-7 items-center justify-center rounded-full text-[12px] font-semibold uppercase transition-colors",
              value === option
                ? "bg-[#1d1d1f] text-white"
                : "text-[#1d1d1f] hover:bg-black/5"
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
