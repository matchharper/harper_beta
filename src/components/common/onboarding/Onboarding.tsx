import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import Face from "@/components/common/Face";
import { Text } from "@/components/ui/text";
import { AnimatedButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export const SLIDE_VARIANTS = {
  enter: (isNext: boolean) => ({
    opacity: 0,
    y: isNext ? 36 : -36,
  }),
  center: {
    opacity: 1,
    y: 0,
  },
  exit: (isNext: boolean) => ({
    opacity: 0,
    y: isNext ? -36 : 36,
  }),
};

export const SLIDE_TRANSITION = { duration: 0.22, ease: "easeOut" } as const;

export const ONBOARDING_BACKGROUND_CLASS = "bg-bg-basement";

export type OnboardingStepDefinition = {
  label: string;
  title: string[];
  description: string[];
  headerClassName: string;
  titleClassName: string;
  descriptionClassName: string;
  bodyClassName: string;
  secondaryBodyClassName?: string;
  footnoteClassName?: string;
};

const useStreamingText = (text: string) => {
  const [streamedText, setStreamedText] = useState("");

  useEffect(() => {
    setStreamedText("");
    if (!text) return;

    let index = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const increment = index < 40 ? 1 : 2;
      index = Math.min(text.length, index + increment);
      setStreamedText(text.slice(0, index));

      if (index < text.length) {
        timeoutId = setTimeout(tick, index < 40 ? 26 : 14);
      }
    };

    timeoutId = setTimeout(tick, 420);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [text]);

  return streamedText;
};

const ProgressBar = ({
  step,
  totalSteps = 4,
}: {
  step: number;
  totalSteps?: number;
}) => {
  const currentStep = Math.min(Math.max(step, 0), totalSteps);

  return (
    <div
      aria-hidden="true"
      className="grid h-[3px] w-full gap-1"
      style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: totalSteps }).map((_, index) => (
        <span
          key={index}
          className={cn(
            "h-full rounded-full transition-colors duration-300",
            index < currentStep
              ? "bg-neutral-1000"
              : index === currentStep
                ? "bg-neutral-1000"
                : "bg-neutral-1000-a10"
          )}
        />
      ))}
    </div>
  );
};

const OnboardingTopBar = ({
  showProgress = true,
  step,
  totalSteps,
}: {
  totalSteps: number;
  showProgress?: boolean;
  step: number;
}) => (
  <div
    className={cn(
      "flex shrink-0 flex-col justify-center",
      showProgress ? "h-16 gap-4" : "h-8"
    )}
  >
    <div className="font-hedvig font-bold text-[21px] leading-none text-neutral-primary">
      Harper
    </div>
    {showProgress ? <ProgressBar step={step} totalSteps={totalSteps} /> : null}
  </div>
);

export const OnboardingFrame = ({
  aside,
  children,
  footer,
  totalSteps = 4,
  expandContent = false,
  asideAfterTitle = false,
  flexibleTitle = false,
  wide = false,
  progressStep,
  showProgress = true,
  title,
}: {
  aside?: ReactNode;
  totalSteps?: number;
  expandContent?: boolean;
  asideAfterTitle?: boolean;
  flexibleTitle?: boolean;
  wide?: boolean;
  children: ReactNode;
  footer: ReactNode;
  progressStep: number;
  showProgress?: boolean;
  title: ReactNode;
}) => {
  const topBar = (
    <OnboardingTopBar
      showProgress={showProgress}
      step={progressStep}
      totalSteps={totalSteps}
    />
  );
  const titleSlot = title ? (
    <div
      className={cn("shrink-0", flexibleTitle ? "min-h-[120px]" : "h-[120px]")}
    >
      {title}
    </div>
  ) : null;

  if (aside) {
    return (
      <div className="mx-auto flex min-h-svh w-full justify-center px-4 pb-8 pt-16 md:py-16">
        <div className="relative grid w-full max-w-[900px] gap-6 lg:block lg:h-[calc(100svh-8rem)] lg:min-h-[520px]">
          <div className="order-1 lg:w-[400px]">{topBar}</div>
          {asideAfterTitle ? (
            <div className="order-2 lg:hidden">{titleSlot}</div>
          ) : null}
          <div className="order-2 mx-auto flex min-h-[360px] w-full max-w-[390px] md:max-w-[640px] lg:absolute lg:left-[480px] lg:top-0 lg:h-full lg:min-h-0 lg:w-[440px] lg:max-w-none xl:left-[560px] xl:w-[520px]">
            {aside}
          </div>
          <div
            className={cn(
              "order-3 flex min-h-[460px] w-full flex-col lg:absolute lg:bottom-0 lg:left-0 lg:min-h-0 lg:w-[400px]",
              showProgress ? "lg:top-16" : "lg:top-8"
            )}
          >
            {asideAfterTitle ? (
              <div className="hidden shrink-0 lg:block">{titleSlot}</div>
            ) : (
              titleSlot
            )}
            <section className="min-h-0 flex-1 overflow-visible py-6 pr-1 lg:overflow-y-auto lg:overscroll-contain lg:scrollbar-thin lg:scrollbar-track-transparent lg:scrollbar-thumb-neutral-1000-a10 lg:hover:scrollbar-thumb-neutral-1000-a50">
              {children}
            </section>
            <footer className="shrink-0 pt-4">{footer}</footer>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "mx-auto flex w-full justify-center px-4 pb-4 pt-16 md:py-16",
        expandContent ? "h-svh overflow-y-auto" : "min-h-svh"
      )}
    >
      <div
        className={cn(
          "grid h-max w-full gap-8",
          wide ? "max-w-[1160px]" : "max-w-[400px]"
        )}
      >
        <div
          className={cn(
            "flex w-full flex-col",
            expandContent
              ? "min-h-[520px]"
              : "h-[calc(100svh-5rem)] min-h-[520px] md:h-[calc(100svh-8rem)]"
          )}
        >
          {topBar}
          {titleSlot}

          <section
            className={cn(
              "py-8 pr-1",
              expandContent
                ? "shrink-0 overflow-visible"
                : "min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10 hover:scrollbar-thumb-neutral-1000-a50"
            )}
          >
            {children}
          </section>

          <footer className="shrink-0 pt-4">{footer}</footer>
        </div>
      </div>
    </div>
  );
};

export const OnboardingStepHeader = ({
  stepDefinition,
}: {
  stepDefinition: OnboardingStepDefinition;
}) => (
  <header className={stepDefinition.headerClassName}>
    <Text
      as="h1"
      variant="head1"
      tone="primary"
      className={stepDefinition.titleClassName}
    >
      {stepDefinition.title.map((line, index) => (
        <span
          key={`${index}-${line}`}
          className="block text-balance break-keep"
          dangerouslySetInnerHTML={{ __html: line }}
        />
      ))}
    </Text>
    <Text as="p" variant="body" tone="subtle" className="mt-2 w-full">
      {stepDefinition.description.map((line, index) => (
        <span key={`${index}-${line}`} className="block break-keep">
          {line}
        </span>
      ))}
    </Text>
  </header>
);

export const OnboardingFieldLabel = ({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) => (
  <label
    htmlFor={htmlFor}
    className="text-sm font-normal leading-5 tracking-normal text-neutral-primary"
  >
    {children}
  </label>
);

// Preserve the original Career footer's sizing, animation and keyboard hint.
export function OnboardingFooter({
  onNext,
  onPrev,
  nextLabel,
  previousLabel = "이전",
  pending = false,
  disabled = false,
  hint,
  children,
}: {
  onNext: () => void;
  onPrev?: () => void;
  nextLabel: string;
  previousLabel?: string;
  pending?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="min-h-[80px] bg-gradient-to-b from-transparent to-bg-basement">
      <div className="flex w-full flex-row gap-3">
        {onPrev ? (
          <AnimatedButton
            type="button"
            variant="secondary"
            size="lg"
            onClick={onPrev}
            disabled={pending}
            className="min-w-[110px] font-normal"
          >
            {previousLabel}
          </AnimatedButton>
        ) : null}
        <AnimatedButton
          type="button"
          variant="primary"
          size="lg"
          onClick={onNext}
          disabled={disabled || pending}
          className="w-full px-4 font-normal bg-neutral-950"
        >
          {nextLabel}
        </AnimatedButton>
      </div>
      {hint ? (
        <div
          className={`mt-2 flex min-h-5 items-center ${onPrev ? "justify-end" : "justify-center"} text-[12px] leading-5 text-neutral-soft`}
        >
          {hint}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export const OnboardingReadyBody = ({
  title,
  description,
  badge,
}: {
  title: ReactNode;
  description: string;
  badge?: string;
}) => {
  return (
    <div className="flex min-h-full flex-col items-center justify-start pt-8 text-center">
      <div className="relative">
        <Face status="idle" size={160} aria-label="Harper" priority />
        <span className="absolute -right-2 top-4 flex h-10 min-w-14 items-center justify-center rounded-[18px] bg-bg-floating px-4 shadow-[0_10px_28px_rgba(31,28,26,0.10)]">
          <span className="flex gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
          </span>
        </span>
        <span className="absolute -left-4 bottom-7 flex h-10 min-w-14 items-center justify-center rounded-[18px] bg-bg-floating px-4 shadow-[0_10px_28px_rgba(31,28,26,0.10)]">
          <span className="flex gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
          </span>
        </span>
      </div>

      {badge && (
        <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-neutral-1000-a05 bg-bg-floating px-3 py-1.5 text-[13px] font-normal leading-none text-neutral-muted shadow-sm">
          <span className="h-2 w-2 rounded-full bg-positive" />
          {badge}
        </div>
      )}

      <Text
        as="h1"
        variant="head2"
        tone="primary"
        className="mt-10 text-[18px] md:text-[22px] font-medium leading-8 tracking-normal"
      >
        {title}
      </Text>
      <Text
        as="p"
        variant="body"
        className="mt-3 max-w-[390px] text-[14px] md:text-[15px] font-light leading-5"
      >
        {description.split("\n").map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </Text>
    </div>
  );
};

export const OnboardingConversationPreview = ({
  assistantText,
  userMessage,
}: {
  assistantText: string;
  userMessage: string;
}) => {
  const streamedText = useStreamingText(assistantText);
  const isStreamComplete =
    assistantText.length > 0 && streamedText.length >= assistantText.length;
  const paragraphs = streamedText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const userBubbleText = userMessage;

  return (
    <aside className="relative flex h-full w-full flex-col overflow-hidden">
      <div className="relative flex min-h-full items-start md:items-center justify-center">
        <div className="w-full max-w-[380px]">
          <div className="flex justify-end">
            <div className="max-w-[84%] rounded-[15px] bg-neutral-1000 px-3.5 py-2.5 text-[14px] md:text-[14px] font-normal leading-5 text-neutral-00 shadow-sm">
              {userBubbleText}
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-floating font-hedvig text-[18px] font-bold text-neutral-primary shadow-sm">
              h.
            </div>
            <div className="min-w-0 flex-1 space-y-2.5">
              {paragraphs.map((paragraph, index) => (
                <div
                  key={`${index}-${paragraph.slice(0, 14)}`}
                  className="w-fit max-w-full rounded-[15px] bg-bg-floating px-3.5 py-2.5 text-[14px] md:text-[14px] font-normal leading-6 text-neutral-primary shadow-sm"
                >
                  {paragraph}
                  {index === paragraphs.length - 1 && !isStreamComplete ? (
                    <span className="ml-1 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-neutral-1000-a50" />
                  ) : null}
                </div>
              ))}
              <div className="flex w-fit items-center gap-1.5 rounded-[15px] bg-bg-floating px-3.5 py-2.5 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export function OnboardingTransition({
  children,
  stepKey,
  className,
}: {
  children: ReactNode;
  stepKey: string;
  className?: string;
}) {
  return (
    <AnimatePresence mode="wait" custom={true}>
      <motion.div
        key={stepKey}
        initial="enter"
        animate="center"
        exit="exit"
        variants={SLIDE_VARIANTS}
        custom={true}
        transition={SLIDE_TRANSITION}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
