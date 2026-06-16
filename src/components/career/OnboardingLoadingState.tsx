"use client";

import { motion } from "motion/react";
import { Check, FileText, Linkedin, MessageCircle, Search } from "lucide-react";
import React from "react";
import { useEffect, useState } from "react";
import { useCareerT } from "@/i18n/useCareerT";
import { careerT } from "@/lib/career/translatedCareerMessage";

const steps = [
  {
    icon: Linkedin,
    title: careerT(
      "ko",
      "career.onboarding.onboarding_loading_state.19pgngy",
      "프로필을 읽고 있어요"
    ),
    description: careerT(
      "ko",
      "career.onboarding.onboarding_loading_state.0ouyje6",
      "LinkedIn과 이력서에서 프로필을 확인하고 있습니다."
    ),
  },
  {
    icon: FileText,
    title: careerT(
      "ko",
      "career.onboarding.onboarding_loading_state.02hign3",
      "이력을 정리하고 있어요"
    ),
    description: careerT(
      "ko",
      "career.onboarding.onboarding_loading_state.1wnee4b",
      "회사, 역할, 프로젝트, 기술 스택을 구조화하고 있습니다."
    ),
  },
  {
    icon: Search,
    title: careerT(
      "ko",
      "career.onboarding.onboarding_loading_state.0baqqno",
      "선호 조건을 해석하고 있어요"
    ),
    description: careerT(
      "ko",
      "career.onboarding.onboarding_loading_state.0wdnmxx",
      "원하는 회사 조건과 찾아올 기회 기준을 만들고 있습니다. 다녔던 회사는 차단 목록에 넣어둘게요."
    ),
  },
  {
    icon: Check,
    title: careerT(
      "ko",
      "career.onboarding.onboarding_loading_state.1p92fsi",
      "강점 신호를 찾고 있어요"
    ),
    description: careerT(
      "ko",
      "career.onboarding.onboarding_loading_state.14a2lmb",
      "소개할 때 중요하게 볼 포인트를 추출하고 있습니다."
    ),
  },
  {
    icon: MessageCircle,
    title: careerT(
      "ko",
      "career.onboarding.onboarding_loading_state.0hhyibm",
      "첫 대화를 준비하고 있어요"
    ),
    description: careerT(
      "ko",
      "career.onboarding.onboarding_loading_state.1b99mcm",
      "이제 Harper가 상황과 선호를 자연스럽게 이어서 물어볼게요."
    ),
  },
];

const stepDurations = [4200, 4800, 5200, 5600, 26000];

function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const SkeletonLine = ({
  className = "",
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) => (
  <div
    className={`relative overflow-hidden rounded-full bg-black/6 ${className}`}
  >
    <motion.div
      className="absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-white/0 via-white/80 to-white/0"
      initial={{ x: "-120%" }}
      animate={{ x: "220%" }}
      transition={{
        duration: 2.4,
        repeat: Infinity,
        ease: "easeInOut",
        delay,
      }}
    />
  </div>
);

const StepProgressBar = ({
  isActive,
  duration,
}: {
  isActive: boolean;
  duration: number;
}) => {
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-black/[0.07]">
      {isActive && (
        <motion.div
          key={duration}
          className="h-full rounded-full bg-primary"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{
            duration: duration / 1000,
            ease: "linear",
          }}
        />
      )}
    </div>
  );
};

const ProfilePreview = ({ activeStep }: { activeStep: number }) => {
  return (
    <div className="relative w-full max-w-[520px]">
      <div className="absolute inset-0 translate-y-3 rounded-[32px] bg-black/4" />

      <div className="relative overflow-hidden rounded-[32px] border border-neutral-1000-a05 bg-bg-floating/90 p-5 text-left shadow-2xl shadow-black/5 backdrop-blur-xl md:p-6">
        <div className="flex items-center justify-between border-b border-neutral-1000-a05 pb-4">
          <div>
            <p className="text-xs font-medium tracking-[-0.01em] text-neutral-soft">
              Harper profile
            </p>
            <p className="mt-1 text-sm font-semibold tracking-[-0.02em] text-neutral-muted">
              Preparing your first conversation
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-full bg-black/4 px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-xs font-medium text-neutral-soft">
              Working
            </span>
          </div>
        </div>

        <div className="mt-6 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-black/6">
            <SkeletonLine className="h-6 w-6 rounded-xl" />
          </div>

          <div className="min-w-0 flex-1">
            <SkeletonLine className="h-4 w-32" />
            <SkeletonLine className="mt-3 h-3 w-56" delay={0.15} />
          </div>
        </div>

        <div className="mt-7 space-y-4">
          <div className="rounded-2xl border border-neutral-1000-a05 bg-bg-floating p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-soft">
                Career signals
              </p>
              {activeStep >= 1 && <Check className="h-4 w-4 text-primary" />}
            </div>

            <SkeletonLine className="h-3 w-full" delay={0.1} />
            <SkeletonLine className="mt-2.5 h-3 w-[82%]" delay={0.2} />
            <SkeletonLine className="mt-2.5 h-3 w-[64%]" delay={0.3} />
          </div>

          <div className="rounded-2xl border border-neutral-1000-a05 bg-bg-floating p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-soft">
                Preferred companies
              </p>
              {activeStep >= 2 && <Check className="h-4 w-4 text-primary" />}
            </div>

            <div className="flex flex-wrap gap-2">
              <SkeletonLine className="h-7 w-24" delay={0.15} />
              <SkeletonLine className="h-7 w-20" delay={0.25} />
              <SkeletonLine className="h-7 w-28" delay={0.35} />
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-1000-a05 bg-bg-floating p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-soft">
                Conversation context
              </p>
              {activeStep >= 4 && <Check className="h-4 w-4 text-primary" />}
            </div>

            <SkeletonLine className="h-3 w-[92%]" delay={0.05} />
            <SkeletonLine className="mt-2.5 h-3 w-[70%]" delay={0.2} />
          </div>
        </div>

        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-black/6">
          <motion.div
            className="h-full rounded-full bg-black/70"
            animate={{
              width: `${((activeStep + 1) / steps.length) * 100}%`,
            }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      </div>
    </div>
  );
};

const LoadingState = ({ isOnboarding = true }: { isOnboarding?: boolean }) => {
  const t = useCareerT();

  const [activeStep, setActiveStep] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (activeStep >= steps.length - 1) return;

    const timeout = window.setTimeout(() => {
      setActiveStep((prev) => Math.min(prev + 1, steps.length - 1));
    }, stepDurations[activeStep]);

    return () => window.clearTimeout(timeout);
  }, [activeStep]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const ActiveIcon = steps[activeStep].icon;

  return (
    <div
      className={`relative mx-auto flex w-full max-w-[980px] flex-col items-center justify-center overflow-hidden px-4 py-10 ${isOnboarding ? "min-h-[calc(100svh-8px)]" : ""}`}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/[0.035] blur-3xl" />
        <div className="absolute left-[12%] top-[18%] h-48 w-48 rounded-full bg-accent-200/50 blur-3xl" />
      </div>

      <div className="relative z-10 grid w-full items-center gap-10 md:grid-cols-[1fr_520px] md:gap-12">
        <div className="text-center md:text-left">
          <div className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-neutral-1000-a05 bg-bg-floating px-3 py-1.5 text-xs font-medium text-neutral-soft shadow-sm backdrop-blur md:mx-0">
            <ActiveIcon className="h-3.5 w-3.5" />
            <span>Harper is coming</span>
            <span className="min-w-[4ch] font-mono tabular-nums text-neutral-disabled">
              {formatElapsedTime(elapsedSeconds)}
            </span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <h1 className="text-xl font-semibold leading-tight tracking-[-0.045em] text-neutral-primary md:text-2xl">
              <span>{steps[activeStep].title}</span>
            </h1>

            <p className="mt-3 max-w-[520px] text-base font-medium leading-7 tracking-tight text-neutral-muted md:text-lg md:leading-8">
              <span>{steps[activeStep].description}</span>
            </p>
          </motion.div>

          <div className="mt-8 space-y-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === activeStep;
              const isDone = index < activeStep;

              return (
                <motion.div
                  key={step.title}
                  animate={{
                    opacity: isActive || isDone ? 1 : 0.36,
                  }}
                  className="grid grid-cols-[28px_minmax(0,1fr)_96px] items-center gap-3"
                >
                  <div
                    className={[
                      "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                      isDone
                        ? "bg-accent-200 text-primary"
                        : isActive
                          ? "bg-black text-neutral-00"
                          : "bg-black/6 text-neutral-soft",
                    ].join(" ")}
                  >
                    {isDone ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                  </div>

                  <span className="text-left text-sm font-medium tracking-[-0.02em] text-neutral-muted">
                    {step.title}
                  </span>

                  <StepProgressBar
                    isActive={isActive}
                    duration={stepDurations[index]}
                  />
                </motion.div>
              );
            })}
          </div>

          <p className="mt-8 max-w-[520px] text-sm leading-6 text-neutral-soft">
            {t("career.onboarding.onboarding_loading_state.0ohe7mq", "보통")}{" "}
            <span className="text-neutral-primary">
              {t(
                "career.onboarding.onboarding_loading_state.0j3lmus",
                "1분 정도 걸리고, 길어도 2분 안에 끝나요."
              )}
            </span>{" "}
            {t(
              "career.onboarding.onboarding_loading_state.13yg4ho",
              "확인이 끝나면 Harper와 짧게 대화하면서 현재 상황과 원하는 기회를 알려주세요."
            )}
          </p>
        </div>

        <ProfilePreview activeStep={activeStep} />
      </div>
    </div>
  );
};

export default React.memo(LoadingState);
