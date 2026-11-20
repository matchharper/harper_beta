import { animate, useInView, useReducedMotion } from "motion/react";
import { Fragment, useEffect, useRef, useState } from "react";
import type React from "react";
import { cn } from "@/lib/cn";
import styles from "./TextAnimations.module.css";

/**
 * 화면에 보일 때 글자가 앞에서부터 하나씩 살짝 올라가며 강조색으로 바뀌었다가
 * 제자리·원래 색으로 돌아온다. 글자마다 시작이 조금씩 겹친다.
 * 단어 단위로 줄바꿈하므로 `break-keep` 문장에도 그대로 쓸 수 있다.
 */
export function WaveText({
  text,
  className,
  color = "var(--color-action)",
  lift = "-0.22em",
  duration = 0.42,
  stagger = 0.024,
  delay = 0,
  once = true,
  amount = 0.6,
}: {
  text: string;
  className?: string;
  /** 올라간 순간의 글자색. CSS 색 값이나 변수. */
  color?: string;
  /** 올라가는 높이. 글자 크기에 맞게 em 단위를 권장한다. */
  lift?: string;
  /** 글자 하나가 올라갔다 내려오는 시간(초). */
  duration?: number;
  /** 다음 글자가 시작하기까지의 간격(초). duration보다 짧을수록 많이 겹친다. */
  stagger?: number;
  delay?: number;
  /** false면 화면을 벗어났다 다시 들어올 때마다 재생한다. */
  once?: boolean;
  /** 재생을 시작할 노출 비율. */
  amount?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once, amount });
  let charIndex = 0;
  const words = text.split(" ");

  return (
    <span
      ref={ref}
      data-playing={inView}
      className={cn(styles.wave, className)}
      style={
        {
          "--text-wave-color": color,
          "--text-wave-lift": lift,
          "--text-wave-duration": `${duration}s`,
          "--text-wave-stagger": `${stagger}s`,
          "--text-wave-delay": `${delay}s`,
        } as React.CSSProperties
      }
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, wordIndex) => (
          <Fragment key={`${word}-${wordIndex}`}>
            {wordIndex > 0 ? " " : null}
            <span className="inline-block whitespace-nowrap">
              {Array.from(word).map((char, index) => (
                <span
                  key={`${char}-${index}`}
                  className={styles.waveChar}
                  style={
                    {
                      "--text-wave-index": charIndex++,
                    } as React.CSSProperties
                  }
                >
                  {char}
                </span>
              ))}
            </span>
          </Fragment>
        ))}
      </span>
    </span>
  );
}

function getFractionDigits(value: number) {
  const [, fraction = ""] = String(value).split(".");
  return Math.min(3, fraction.length);
}

/**
 * 화면에 보일 때 0부터 목표 숫자까지 빠르게 올라간다.
 * 값이 나중에 바뀌면 현재 숫자에서 새 값으로 이어서 움직인다.
 * 최종 숫자 너비를 미리 확보해 올라가는 동안 주변 배치가 흔들리지 않는다.
 */
export function CountUpNumber({
  value,
  locale,
  format,
  className,
  duration = 1.6,
  delay = 0,
  amount = 0.6,
}: {
  value: number;
  /** 기본 숫자 형식의 locale. `format`을 주면 무시한다. */
  locale?: string;
  format?: (value: number) => string;
  className?: string;
  /** 올라가는 시간(초). */
  duration?: number;
  delay?: number;
  amount?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const numberRef = useRef<HTMLSpanElement>(null);
  const currentRef = useRef(0);
  const inView = useInView(ref, { once: true, amount });
  const reduceMotion = useReducedMotion();
  const fractionDigits = getFractionDigits(value);
  const formatValue =
    format ??
    ((next: number) =>
      next.toLocaleString(locale, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }));
  const formatRef = useRef(formatValue);
  useEffect(() => {
    formatRef.current = formatValue;
  });
  const [initialText] = useState(() => formatValue(0));

  useEffect(() => {
    const node = numberRef.current;
    if (!node || !inView) return;

    const render = (next: number) => {
      currentRef.current = next;
      node.textContent = formatRef.current(next);
    };

    if (reduceMotion) {
      render(value);
      return;
    }

    const playback = animate(currentRef.current, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        const factor = 10 ** fractionDigits;
        render(Math.round(latest * factor) / factor);
      },
    });

    return () => playback.stop();
  }, [delay, duration, fractionDigits, inView, reduceMotion, value]);

  return (
    <span ref={ref} className={cn("inline-grid tabular-nums", className)}>
      <span className="sr-only">{formatValue(value)}</span>
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {formatValue(value)}
      </span>
      <span
        ref={numberRef}
        aria-hidden="true"
        className="col-start-1 row-start-1 text-right"
      >
        {initialText}
      </span>
    </span>
  );
}
