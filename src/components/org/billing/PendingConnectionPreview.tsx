import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import { useReducedMotion } from "motion/react";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { cn } from "@/lib/utils";

const SCENE_DURATION = 8000;

function Message({
  children,
  from = "harper",
  delay = 0,
}: {
  children: ReactNode;
  from?: "harper" | "person";
  delay?: number;
}) {
  return (
    <div
      className={cn(
        "max-w-[86%] self-start [@media(max-width:480px)]:max-w-[94%]",
        "group-data-[animate=true]/scene:animate-in group-data-[animate=true]/scene:fade-in-0 group-data-[animate=true]/scene:slide-in-from-bottom-3 [--tw-animation-duration:600ms] ease-[cubic-bezier(0.22,1,0.36,1)] [--tw-animation-fill-mode:both] [--tw-animation-delay:var(--delay,0ms)] group-data-[animate=true]/scene:motion-reduce:animate-none",
        from === "person" && "max-w-[88%] self-end"
      )}
      style={{ "--delay": `${delay}ms` } as CSSProperties}
    >
      {from === "harper" && (
        <span className="mb-1.5 flex items-center gap-1.5 text-[11px] text-neutral-muted">
          <Image src="/svgs/face.svg" width={17} height={17} alt="" />
          Harper
        </span>
      )}
      <div
        className={cn(
          "rounded-[2px_16px_16px] bg-bg-default px-[15px] py-3 text-[13px] leading-[1.65] text-neutral-primary break-keep [overflow-wrap:anywhere] shadow-[0_2px_5px_var(--color-neutral-1000-a05)]",
          from === "person" &&
            "rounded-[16px_16px_2px] bg-[color-mix(in_srgb,var(--color-primary)_9%,var(--color-bg-default))]"
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** A fictional product walkthrough; it never reads or contacts real candidates. */
export function PendingConnectionPreview() {
  const { c } = useOrgLocale();
  const reducedMotion = useReducedMotion();
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const autoplay = playing && !reducedMotion && pageVisible;

  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!autoplay || scene === 2) return;
    const timer = window.setTimeout(
      () => setScene((current) => Math.min(current + 1, 2)),
      SCENE_DURATION
    );
    return () => window.clearTimeout(timer);
  }, [autoplay, scene]);

  const select = (next: number) => {
    setScene(Math.max(0, Math.min(2, next)));
    setPlaying(false);
  };

  return (
    <div className="relative isolate overflow-hidden rounded-[20px] bg-primary-faded">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_5%_5%,var(--color-action-faded),transparent_65%),radial-gradient(ellipse_at_95%_90%,var(--color-accent-200),transparent_65%),linear-gradient(135deg,var(--color-bg-default),transparent)] opacity-80"
      />
      <div
        role="group"
        aria-roledescription={c("슬라이드", "carousel")}
        aria-label={c(
          "후보자부터 회사까지, 연결 대화 예시",
          "An introduction, from candidate to company"
        )}
        tabIndex={0}
        className="overflow-hidden outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-neutral-1000-a10)]"
        onFocus={() => setPlaying(false)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          select(scene + (event.key === "ArrowRight" ? 1 : -1));
        }}
      >
        <div
          className="flex transition-transform duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(-${scene * 100}%)` }}
        >
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="group/scene w-full min-w-0 shrink-0 px-8 pt-6 pb-5 [@media(max-width:480px)]:px-4 [@media(max-width:480px)]:pt-5 [@media(max-width:480px)]:pb-4"
              data-animate={autoplay && scene === index}
              aria-hidden={scene !== index}
              inert={scene !== index}
            >
              {index === 0 ? (
                <div className="flex min-h-[298px] flex-col gap-3.5">
                  <Message>
                    {c(
                      "지민님, 루프 팀이 딱 맞아 보여요. 작은 팀에서 AI 제품을 처음부터 만들 수 있거든요. 관심 있으세요?",
                      "Jimin, I think Loop could be a great fit. You’d get to build an AI product from scratch with a small team. Interested?"
                    )}
                  </Message>
                  <Message from="person" delay={1800}>
                    {c(
                      "오 좋다. 한번 만나볼래!",
                      "Oh, nice. I’d love to meet them!"
                    )}
                  </Message>
                  <Message delay={3300}>
                    {c(
                      "좋아요! 루프 팀에도 지민님 소개해드릴게요 🙌",
                      "Great! I’ll introduce you to the Loop team 🙌"
                    )}
                  </Message>
                </div>
              ) : index === 1 ? (
                <div className="flex min-h-[298px] flex-col gap-3.5">
                  <Message>
                    <span className="mb-2.5 block border-b border-neutral-1000-a05 pb-2.5 font-medium [&>span]:mt-0.5 [&>span]:block [&>span]:text-[11px] [&>span]:font-normal [&>span]:text-neutral-muted">
                      {c("지민 · Product Designer", "Jimin · Product designer")}
                      <span>
                        {c(
                          "0→1 제품 경험 · 작은 팀에서의 오너십",
                          "0→1 product experience · Small-team ownership"
                        )}
                      </span>
                    </span>
                    {c(
                      "지민님이 우리 팀이랑 이야기해보고 싶대요. 찾으시던 초기 제품 경험도 있고요. 만나보실래요?",
                      "Jimin would love to chat with your team. They have the early-stage product experience you’re looking for. Want to meet?"
                    )}
                  </Message>
                  <Message from="person" delay={1200}>
                    {c(
                      "응 좋아. 이번 주 목요일 오후 어때?",
                      "Yes! How about Thursday afternoon?"
                    )}
                  </Message>
                  <Message delay={2500}>
                    {c(
                      "좋아요, 지민님 시간도 맞춰볼게요 🙌",
                      "On it. I’ll find a time that works for Jimin too 🙌"
                    )}
                  </Message>
                </div>
              ) : (
                <div className="flex min-h-[298px] flex-col gap-3.5">
                  <Message>
                    {c(
                      "목요일 3시, 두 분 다 괜찮으시네요. Google Meet 초대 보냈어요!",
                      "Thursday at 3 works for both of you. Google Meet invites are in your calendars!"
                    )}
                  </Message>
                  <div className="mt-3 flex w-full max-w-[420px] items-center gap-3 self-center rounded-3xl border border-[color-mix(in_srgb,var(--color-bg-default)_85%,transparent)] bg-[color-mix(in_srgb,var(--color-bg-default)_76%,transparent)] px-4 py-[15px] shadow-[0_8px_24px_var(--color-neutral-1000-a10),inset_0_1px_0_var(--color-bg-default)] backdrop-blur-[24px] backdrop-saturate-[1.3] [font-family:-apple-system,BlinkMacSystemFont,sans-serif] [@media(max-width:480px)]:px-3.5 [@media(max-width:480px)]:py-[13px] [--delay:900ms] group-data-[animate=true]/scene:animate-in group-data-[animate=true]/scene:fade-in-0 group-data-[animate=true]/scene:slide-in-from-bottom-3 [--tw-animation-duration:600ms] ease-[cubic-bezier(0.22,1,0.36,1)] [--tw-animation-fill-mode:both] [--tw-animation-delay:var(--delay,0ms)] group-data-[animate=true]/scene:motion-reduce:animate-none">
                    <span className="flex size-[42px] shrink-0 items-center justify-center rounded-[11px] bg-bg-default shadow-[0_1px_2px_var(--color-neutral-1000-a05)]">
                      <Image
                        src="/images/logos/google-meet.svg"
                        alt=""
                        width={30}
                        height={30}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-[3px] flex items-center justify-between gap-2 text-[11px] leading-4 text-neutral-muted">
                        <span>Google Meet</span>
                        <span className="text-[10px]">{c("지금", "now")}</span>
                      </div>
                      <p className="text-sm leading-5 font-medium tracking-[-0.02em] text-neutral-primary">
                        {c("OpenAI <> 지민", "OpenAI <> Jimin")}
                      </p>
                      <p className="mt-px text-xs leading-[18px] text-neutral-primary">
                        {c("목요일 오후 3:00–3:30", "Thursday, 3:00–3:30 PM")}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
