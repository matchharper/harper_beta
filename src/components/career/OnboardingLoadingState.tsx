"use client";

import { motion } from "motion/react";
import {
  Check,
  FileText,
  MessageSquare,
  Star,
  type LucideIcon,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/cn";

type LoadingStep = {
  icon: LucideIcon;
  title: string;
};

const getSteps = (t: ReturnType<typeof useCareerT>): LoadingStep[] => [
  {
    icon: Check,
    title: t(
      "career.onboarding.onboarding_loading_state.19pgngy",
      "프로필을 읽고 있어요"
    ),
  },
  {
    icon: FileText,
    title: t(
      "career.onboarding.onboarding_loading_state.profile_context",
      "경력과 관심사를 파악하고 있어요"
    ),
  },
  {
    icon: Star,
    title: t(
      "career.onboarding.onboarding_loading_state.1p92fsi",
      "강점 신호를 찾고 있어요"
    ),
  },
  {
    icon: MessageSquare,
    title: t(
      "career.onboarding.onboarding_loading_state.0hhyibm",
      "첫 대화를 준비하고 있어요"
    ),
  },
];

const stepDurations = [4200, 5200, 5600, 26000];

const SkeletonLine = ({
  className,
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) => (
  <div
    className={cn(
      "relative overflow-hidden rounded-full bg-neutral-200",
      className
    )}
  >
    <motion.div
      className="absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-neutral-300/0 via-neutral-300/90 to-neutral-300/0"
      initial={{ x: "-120%" }}
      animate={{ x: "220%" }}
      transition={{
        delay,
        duration: 2.6,
        ease: "easeInOut",
        repeat: Infinity,
      }}
    />
  </div>
);

const StepProgressBar = ({
  duration,
  isActive,
  isDone,
}: {
  duration: number;
  isActive: boolean;
  isDone: boolean;
}) => (
  <div className="relative h-2 w-[88px] overflow-hidden rounded-full bg-neutral-1000-a10 sm:w-[104px]">
    {isActive || isDone ? (
      <motion.div
        key={`${duration}-${isActive}-${isDone}`}
        className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-neutral-1000"
        initial={{ scaleX: isDone ? 1 : 0 }}
        animate={{ scaleX: 1 }}
        transition={{
          duration: isActive ? duration / 1000 : 0.2,
          ease: "linear",
        }}
      />
    ) : (
      <span className="absolute left-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-neutral-1000" />
    )}
  </div>
);

const PreviewDocument = ({ activeStep }: { activeStep: number }) => (
  <div className="rounded-[20px] bg-bg-floating px-6 py-6 shadow-[0_18px_60px_rgba(31,28,26,0.07)]">
    <div className="flex items-start gap-3">
      <SkeletonLine className="h-9 w-9 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 pt-1">
        <SkeletonLine className="h-3 w-[38%]" />
        <SkeletonLine className="mt-2.5 h-2.5 w-[68%]" delay={0.12} />
      </div>
    </div>

    <div className="mt-4 space-y-4">
      <div className="rounded-[15px] border border-neutral-1000-a05 bg-bg-floating px-3.5 py-4">
        <p className="text-[12px] font-medium leading-none text-neutral-soft">
          Career signals
        </p>
        <SkeletonLine className="mt-3 h-2.5 w-full" delay={0.05} />
        <SkeletonLine className="mt-2 h-2.5 w-[82%]" delay={0.15} />
        <SkeletonLine className="mt-2 h-2.5 w-[64%]" delay={0.25} />
      </div>

      <div
        className={cn(
          "rounded-[15px] border border-neutral-1000-a05 bg-bg-floating px-3.5 py-4 transition-opacity",
          activeStep < 1 && "opacity-75"
        )}
      >
        <p className="text-[12px] font-medium leading-none text-neutral-soft">
          Preferred companies
        </p>
        <div className="mt-3 flex gap-2">
          <SkeletonLine className="h-3.5 w-[22%]" delay={0.1} />
          <SkeletonLine className="h-3.5 w-[24%]" delay={0.2} />
          <SkeletonLine className="h-3.5 w-[22%]" delay={0.3} />
          <SkeletonLine className="h-3.5 w-[20%]" delay={0.4} />
        </div>
      </div>

      <div
        className={cn(
          "rounded-[15px] border border-neutral-1000-a05 bg-bg-floating px-3.5 py-4 transition-opacity",
          activeStep < 2 && "opacity-65"
        )}
      >
        <p className="text-[12px] font-medium leading-none text-neutral-soft">
          Conversation context
        </p>
        <SkeletonLine className="mt-3 h-2.5 w-full" delay={0.14} />
        <SkeletonLine className="mt-2 h-2.5 w-[64%]" delay={0.28} />
      </div>
    </div>
  </div>
);

const OnboardingLoadingState = ({
  className,
}: {
  className?: string;
  isOnboarding?: boolean;
}) => {
  const t = useCareerT();
  const steps = useMemo(() => getSteps(t), [t]);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (activeStep >= steps.length - 1) return;

    const timeout = window.setTimeout(() => {
      setActiveStep((prev) => Math.min(prev + 1, steps.length - 1));
    }, stepDurations[activeStep]);

    return () => window.clearTimeout(timeout);
  }, [activeStep, steps.length]);

  return (
    <aside
      aria-label={"온보딩 분석 진행 상태"}
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-weak/70 p-5 text-left md:px-12 md:py-10",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-bg-floating/60 via-transparent to-primary-faded/25" />
      <div className="relative">
        <PreviewDocument activeStep={activeStep} />

        <div className="mt-12 space-y-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === activeStep;
            const isDone = index < activeStep;

            return (
              <motion.div
                key={step.title}
                animate={{ opacity: isActive || isDone ? 1 : 0.5 }}
                className="grid grid-cols-[30px_minmax(0,1fr)_88px] items-center gap-2.5 sm:grid-cols-[30px_minmax(0,1fr)_104px]"
                transition={{ duration: 0.25 }}
              >
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                    isDone || isActive
                      ? "bg-neutral-1000 text-neutral-00"
                      : "bg-neutral-1000-a05 text-neutral-soft"
                  )}
                >
                  {isDone ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={1.8} />
                  ) : (
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
                  )}
                </div>

                <span
                  className={cn(
                    "min-w-0 text-[14px] font-normal leading-5 tracking-normal",
                    isActive || isDone
                      ? "text-neutral-primary"
                      : "text-neutral-soft"
                  )}
                >
                  {step.title}
                </span>

                <StepProgressBar
                  duration={stepDurations[index]}
                  isActive={isActive}
                  isDone={isDone}
                />
              </motion.div>
            );
          })}
        </div>
      </div>
    </aside>
  );
};

export default React.memo(OnboardingLoadingState);
