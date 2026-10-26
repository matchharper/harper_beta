import { useId, useRef, useState } from "react";
import { Circle } from "lucide-react";
import Image from "next/image";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/cn";

export type IntegrationConversationExample = {
  id: string;
  text: string;
  response: string;
};

export default function IntegrationConversationCarousel({
  examples,
}: {
  examples: readonly IntegrationConversationExample[];
}) {
  const t = useCareerT();
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
    <section>
      <div className="relative isolate overflow-hidden rounded-xl bg-primary-faded">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-gradpastel opacity-25"
        />
        <div
          id={id}
          ref={viewport}
          tabIndex={0}
          role="group"
          aria-label={t(
            "career.integrations.carousel.navigation",
            "좌우로 넘겨 대화 예시 보기"
          )}
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
            <div
              key={example.id}
              aria-hidden={index !== active}
              className="w-full shrink-0 snap-center px-4 pb-7 pt-4"
            >
              <p className="ml-auto w-fit max-w-[92%] rounded-2xl rounded-br-sm bg-bg-floating/95 px-3.5 py-2.5 text-[13px] font-normal leading-5 text-neutral-primary shadow-xs">
                {example.text}
              </p>
              <div className="mt-4 max-w-[94%]">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-neutral-muted">
                  <Image src="/svgs/face.svg" alt="" width={16} height={16} />
                  Harper
                </div>
                <p className="whitespace-pre-line rounded-2xl rounded-tl-sm bg-bg-floating/95 px-3.5 py-3 text-[13px] font-normal leading-5 text-neutral-primary shadow-xs">
                  {example.response}
                </p>
              </div>
            </div>
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
                aria-label={t(
                  "career.integrations.carousel.go_to",
                  "대화 예시 {number} 보기",
                  { values: { number: index + 1 } }
                )}
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
