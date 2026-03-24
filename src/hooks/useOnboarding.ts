"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const useOnboarding = ({
  save,
  totalSteps,
  beforeNext,
  onComplete,
  enableWheelNavigation = true,
}: {
  save: () => void;
  totalSteps: number;
  beforeNext?: (step: number) => boolean;
  onComplete?: () => void;
  enableWheelNavigation?: boolean;
}) => {
  const [step, setStep] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);

  const lock = useRef(false);
  const isNextRef = useRef(true);

  const isLastStep = useMemo(() => step === totalSteps - 1, [step, totalSteps]);

  const handleNext = useCallback(() => {
    isNextRef.current = true;

    if (beforeNext && !beforeNext(step)) {
      return;
    }

    if (save) {
      save();
    }

    if (isLastStep) {
      if (onComplete) {
        onComplete();
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
  }, [beforeNext, isLastStep, onComplete, save, step, totalSteps]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (lock.current) return;

      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA") return;

      e.preventDefault();

      handleNext();

      lock.current = true;
      setTimeout(() => {
        lock.current = false;
      }, 500);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext]);

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
