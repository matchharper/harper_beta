"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type MaybePromise<T> = T | Promise<T>;

export const useOnboarding = ({
  save,
  totalSteps,
  beforeNext,
  onComplete,
  enableWheelNavigation = true,
  allowTextareaEnterSubmit = false,
}: {
  save: (step: number) => MaybePromise<void>;
  totalSteps: number;
  beforeNext?: (step: number) => MaybePromise<boolean>;
  onComplete?: () => MaybePromise<void>;
  enableWheelNavigation?: boolean;
  allowTextareaEnterSubmit?: boolean;
}) => {
  const [step, setStep] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);

  const lock = useRef(false);
  const isNextRef = useRef(true);
  const pendingNextRef = useRef(false);

  const isLastStep = useMemo(() => step === totalSteps - 1, [step, totalSteps]);

  const handleNext = useCallback(async () => {
    if (pendingNextRef.current) return;
    pendingNextRef.current = true;
    isNextRef.current = true;

    try {
      if (beforeNext && !(await beforeNext(step))) {
        return;
      }

      if (save) {
        await save(step);
      }

      if (isLastStep) {
        if (onComplete) {
          await onComplete();
          return;
        }

        setSubmitLoading(true);
        setTimeout(() => {
          setSubmitLoading(false);
          setStep(totalSteps);
        }, 1000);
        return;
      }

      setStep((prev) => Math.min(prev + 1, totalSteps - 1));
    } catch (error) {
      console.error("[useOnboarding] failed to advance step:", error);
    } finally {
      pendingNextRef.current = false;
    }
  }, [beforeNext, isLastStep, onComplete, save, step, totalSteps]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key !== "Enter") return;
      if (lock.current) return;

      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA") {
        if (!allowTextareaEnterSubmit || e.shiftKey) return;
      }

      e.preventDefault();

      handleNext();

      lock.current = true;
      setTimeout(() => {
        lock.current = false;
      }, 500);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allowTextareaEnterSubmit, handleNext]);

  useEffect(() => {
    if (!enableWheelNavigation) return;

    const handleWheel = (e: WheelEvent) => {
      if (lock.current) return;
      if (window.scrollY !== 0) {
        lock.current = true;
        setTimeout(() => {
          lock.current = false;
        }, 800);
        return;
      }

      if (e.deltaY < -75) {
        lock.current = true;
        isNextRef.current = false;
        setStep((prev) => Math.max(prev - 1, 0));

        setTimeout(() => {
          lock.current = false;
        }, 500);
      } else if (e.deltaY > 75) {
        lock.current = true;
        handleNext();

        setTimeout(() => {
          lock.current = false;
        }, 500);
      }
    };

    window.addEventListener("wheel", handleWheel);
    return () => window.removeEventListener("wheel", handleWheel);
  }, [enableWheelNavigation, handleNext, totalSteps]);

  const handlePrev = useCallback(() => {
    isNextRef.current = false;
    setStep((prev) => Math.max(prev - 1, 0));
  }, [setStep]);

  return { step, submitLoading, handleNext, setStep, handlePrev, isNextRef };
};
