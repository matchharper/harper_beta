import Image from "next/image";
import { useInView, useReducedMotion } from "motion/react";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { WaveText } from "@/components/common/TextAnimations";
import { useMessages } from "@/i18n/useMessage";
import { cn } from "@/lib/cn";
import { tw } from "./tw";

export const EASE = [0.22, 1, 0.36, 1] as const;

export type Copy = (ko: string, en: string) => string;

/**
 * `/org`의 `c("한글", "English")`와 같은 방식. 문구를 쓰는 자리에서 두 언어를 함께 적는다.
 * 언어는 페이지의 `MessagesProvider` locale을 따른다.
 */
export function useC(): Copy {
  const { locale } = useMessages();
  return useCallback(
    (ko: string, en: string) => (locale === "en" ? en : ko),
    [locale]
  );
}

/** `**굵게**`와 `{{출처}}`만 해석하는 짧은 본문 렌더러. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\{\{[^}]+\}\})/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**")) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("{{")) {
          return (
            <span key={index} className={tw.sourceChip}>
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="size-[11px]"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
              >
                <circle cx="8" cy="8" r="6.2" />
                <path d="M1.8 8h12.4M8 1.8c1.8 1.9 2.6 4 2.6 6.2S9.8 12.3 8 14.2C6.2 12.3 5.4 10.2 5.4 8S6.2 3.7 8 1.8Z" />
              </svg>
              {part.slice(2, -2)}
            </span>
          );
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

export function Lines({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={`${line}-${index}`}>
          {index > 0 ? <br /> : null}
          {line}
        </Fragment>
      ))}
    </>
  );
}

/** 두 줄 제목. 두 번째 줄은 한 단계 옅게 둔다. */
export function TwoLineTitle({
  lines,
  as: Tag = "h2",
  className,
}: {
  lines: readonly string[];
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  const [first, ...rest] = lines;
  return (
    <Tag className={cn(tw.h2, className)}>
      {first}
      {rest.length > 0 ? (
        <>
          <br />
          <em>{rest.join(" ")}</em>
        </>
      ) : null}
    </Tag>
  );
}

export function HarperMark({
  className,
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full",
        tone === "light"
          ? "bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.1),0_2px_6px_-2px_rgb(0_0_0/0.25)]"
          : "bg-[#1d1d1f]",
        className
      )}
    >
      <Image
        src="/svgs/face.svg"
        alt=""
        width={24}
        height={24}
        className={cn("h-[56%] w-auto", tone === "dark" && "invert")}
      />
    </span>
  );
}

/** 회사 로고. 로고 파일이 없으면 글자 아이콘을 만들지 않고 아무것도 그리지 않는다. */
export function CompanyMark({
  logo,
  size = 20,
  eager = false,
  className,
}: {
  /** 호출부의 가독성을 위해 받는다. 로고가 없을 때 글자 아이콘으로 쓰지 않는다. */
  name?: string;
  logo?: string;
  size?: number;
  /** 3D로 기울어진 캐러셀 카드 안에서는 지연 로딩이 시작되지 않아 바로 불러온다. */
  eager?: boolean;
  className?: string;
}) {
  if (!logo) return null;
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-[6px] bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.08)]",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src={logo}
        alt=""
        fill
        sizes={`${size * 2}px`}
        loading={eager ? "eager" : "lazy"}
        className="object-contain"
      />
    </span>
  );
}

export function WorkingDots() {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
      {[0, 0.15, 0.3].map((delay) => (
        <i
          key={delay}
          className={tw.workingDot}
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  );
}

/**
 * 장면을 순서대로 넘기는 타임라인.
 * 요소가 화면에 보일 때만 진행하고, 끝나면 처음부터 다시 재생한다.
 * 동작 줄이기 설정에서는 마지막 장면(완성된 상태)에 머문다.
 */
export function useSceneTimeline(
  ref: RefObject<Element | null>,
  durations: readonly number[],
  { loop = true, amount = 0.35 }: { loop?: boolean; amount?: number } = {}
) {
  const reducedMotion = useReducedMotion();
  const inView = useInView(ref, { amount });
  const [step, setStep] = useState(0);
  const last = durations.length - 1;

  useEffect(() => {
    if (!inView || reducedMotion) return;
    if (!loop && step >= last) return;
    const timeoutId = window.setTimeout(() => {
      setStep((current) => (current >= last ? 0 : current + 1));
    }, durations[step] ?? 1000);
    return () => window.clearTimeout(timeoutId);
  }, [durations, inView, last, loop, reducedMotion, step]);

  return reducedMotion ? last : step;
}

/** 문자열을 한 글자씩 보여 준다. `active`가 꺼지면 처음으로 돌아간다. */
export function useTypewriter(
  text: string,
  active: boolean,
  { speed = 32, startDelay = 0 }: { speed?: number; startDelay?: number } = {}
) {
  const reducedMotion = useReducedMotion();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active || reducedMotion) return;
    let index = 0;
    let intervalId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        index += 1;
        setCount(index);
        if (index >= text.length && intervalId) {
          window.clearInterval(intervalId);
        }
      }, speed);
    }, startDelay);
    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId) window.clearInterval(intervalId);
      setCount(0);
    };
  }, [active, reducedMotion, speed, startDelay, text]);

  if (reducedMotion) return active ? text : "";
  return text.slice(0, count);
}

export function useIsClient() {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setIsClient(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  return isClient;
}

/** 큰 고정 크기 화면을 컨테이너 너비에 맞춰 축소한다. */
export function useFitScale(
  ref: RefObject<HTMLElement | null>,
  baseWidth: number
) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setScale(node.clientWidth / baseWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [baseWidth, ref]);
  return scale;
}

export function SectionReveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.25 });
  const reducedMotion = useReducedMotion();
  return (
    <div
      ref={ref}
      className={className}
      style={
        reducedMotion
          ? undefined
          : {
              opacity: inView ? 1 : 0,
              transform: inView ? "none" : "translateY(12px)",
              transition:
                "opacity 700ms cubic-bezier(.22,1,.36,1), transform 700ms cubic-bezier(.22,1,.36,1)",
            }
      }
    >
      {children}
    </div>
  );
}

/** `WaveText`의 기본 글자 간격(초). 둘째 줄이 첫 줄 물결을 이어받는 데 쓴다. */
const WAVE_STAGGER = 0.024;

/**
 * 두 줄 제목에 `WaveText` 물결을 준다. 둘째 줄은 첫 줄 글자 수만큼 늦게 시작해 하나의 물결로 이어진다.
 * 제목이 화면 밖으로 완전히 나갔다가 다시 들어오면 처음부터 다시 재생한다.
 * 가장자리에서 조금 스크롤할 때마다 깜빡이지 않도록, 일부만 가려진 상태에서는 다시 재생하지 않는다.
 */
export function WaveTitle({
  lines,
  className,
}: {
  lines: readonly [string, string] | readonly string[];
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement | null>(null);
  const visible = useInView(ref, { amount: 0 });
  const [round, setRound] = useState(0);
  const [seen, setSeen] = useState(false);
  const [lastVisible, setLastVisible] = useState(visible);

  // 보이는 상태가 바뀐 렌더에서 바로 반영한다. 한 번 보인 뒤 완전히 사라지면 다음 재생을 준비한다.
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) setSeen(true);
    else if (seen) {
      setSeen(false);
      setRound((value) => value + 1);
    }
  }

  const [first, second = ""] = lines;
  return (
    <h2 ref={ref} className={cn(tw.h2, className)}>
      <WaveText key={`a-${round}`} text={first} />
      {second ? (
        <>
          <br />
          <em>
            <WaveText
              key={`b-${round}`}
              text={second}
              delay={first.replace(/\s/g, "").length * WAVE_STAGGER}
            />
          </em>
        </>
      ) : null}
    </h2>
  );
}
