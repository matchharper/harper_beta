"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Circle } from "lucide-react";
import Image from "next/image";
import { MuteButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type ConversationExample = {
  id: string;
  messages: readonly {
    role: "user" | "assistant";
    text: string;
  }[];
};

export type ConversationExamplesProps = {
  examples: readonly ConversationExample[];
  navigationLabel: string;
  getPageLabel: (page: number) => string;
  assistantName?: string;
  assistantAvatar?: ReactNode;
  className?: string;
  backgroundClassName?: string;
  /** Delay between messages. The first message appears after a short entrance pause. */
  messageIntervalMs?: number;
  /** Hold after the last message; null plays once. */
  loopPauseMs?: number | null;
};

export function ConversationExamples({
  examples,
  navigationLabel,
  getPageLabel,
  assistantName = "Harper",
  assistantAvatar = (
    <Image src="/svgs/face.svg" alt="" width={16} height={16} />
  ),
  className,
  backgroundClassName,
  messageIntervalMs = 1400,
  loopPauseMs = 5000,
}: ConversationExamplesProps) {
  const id = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const goTo = (index: number) => {
    const element = viewport.current;
    if (!element) return;
    element.scrollTo({
      left:
        Math.max(0, Math.min(examples.length - 1, index)) * element.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };

  if (examples.length === 0) return null;

  return (
    <section className={className}>
      <div
        className={cn(
          "overflow-hidden rounded-xl bg-neutral-50",
          backgroundClassName
        )}
      >
        <div
          id={id}
          ref={viewport}
          tabIndex={0}
          role="group"
          aria-label={navigationLabel}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scrollbar-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-1000-a10"
          onScroll={(event) => {
            const element = event.currentTarget;
            if (element.clientWidth > 0) {
              setActive(
                Math.max(
                  0,
                  Math.min(
                    examples.length - 1,
                    Math.round(element.scrollLeft / element.clientWidth)
                  )
                )
              );
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              goTo(active + (event.key === "ArrowRight" ? 1 : -1));
            }
          }}
        >
          {examples.map((example, index) => (
            <ConversationSlide
              key={`${example.id}-${index === active}`}
              example={example}
              active={index === active}
              assistantAvatar={assistantAvatar}
              assistantName={assistantName}
              messageIntervalMs={messageIntervalMs}
              loopPauseMs={loopPauseMs}
            />
          ))}
        </div>
        {examples.length > 1 ? (
          <div className="flex justify-center gap-1 pb-3">
            {examples.map((example, index) => (
              <MuteButton
                key={example.id}
                type="button"
                variant="transparent"
                size="sm"
                aria-label={getPageLabel(index + 1)}
                aria-controls={id}
                aria-current={active === index ? "true" : undefined}
                onClick={() => goTo(index)}
              >
                <Circle
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 w-1.5 fill-current",
                    active === index
                      ? "text-neutral-primary"
                      : "text-neutral-400"
                  )}
                />
              </MuteButton>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ConversationSlide({
  example,
  active,
  assistantAvatar,
  assistantName,
  messageIntervalMs,
  loopPauseMs,
}: {
  example: ConversationExample;
  active: boolean;
  assistantAvatar: ReactNode;
  assistantName: string;
  messageIntervalMs: number;
  loopPauseMs: number | null;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  useEffect(() => {
    if (!active || example.messages.length === 0) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setTimeout>;
    const start = () => {
      clearTimeout(timer);
      if (reducedMotion.matches) return;
      let count = 0;
      const reveal = () => {
        count += 1;
        setVisibleCount(count);
        if (count < example.messages.length) {
          timer = setTimeout(reveal, messageIntervalMs);
        } else if (loopPauseMs !== null) {
          timer = setTimeout(() => {
            count = 0;
            setVisibleCount(0);
            timer = setTimeout(reveal, 400);
          }, loopPauseMs);
        }
      };
      timer = setTimeout(() => {
        setVisibleCount(0);
        timer = setTimeout(reveal, 300);
      }, 0);
    };
    start();
    reducedMotion.addEventListener("change", start);
    return () => {
      clearTimeout(timer);
      reducedMotion.removeEventListener("change", start);
    };
  }, [active, example.messages.length, messageIntervalMs, loopPauseMs]);

  return (
    <div
      aria-hidden={!active}
      className="w-full shrink-0 snap-center space-y-4 px-4 pb-7 pt-4"
    >
      {example.messages.map((message, index) => (
        <div
          key={index}
          className={cn(
            "transition-[opacity,transform] duration-300 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
            !active || index < visibleCount
              ? "translate-y-0 opacity-100"
              : "translate-y-2 opacity-0"
          )}
        >
          {message.role === "user" ? (
            <p className="ml-auto w-fit max-w-[92%] whitespace-pre-line rounded-2xl rounded-br-sm bg-bg-floating/95 px-3.5 py-2.5 text-[13px] font-normal leading-5 text-neutral-primary shadow-xs">
              {message.text}
            </p>
          ) : (
            <div className="max-w-[94%]">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-neutral-muted">
                {assistantAvatar}
                {assistantName}
              </div>
              <p className="whitespace-pre-line rounded-2xl rounded-tl-sm bg-bg-floating/95 px-3.5 py-3 text-[13px] font-normal leading-5 text-neutral-primary shadow-xs">
                {message.text}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
