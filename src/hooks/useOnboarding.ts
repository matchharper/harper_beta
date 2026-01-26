"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STEP_KEY = "harper-onboard-step";

export const useOnboarding = ({
  save,
  totalSteps,
}: {
  save: () => void;
  totalSteps: number;
}) => {
  const [step, setStep] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);

  const lock = useRef(false);
  const isNextRef = useRef(true);

  const isLastStep = useMemo(() => step === totalSteps - 1, [step]);

  const handleNext = useCallback(() => {
    isNextRef.current = true;

    if (save) {
      save();
    }

    if (isLastStep) {
      setSubmitLoading(true);
      setTimeout(() => {
        setSubmitLoading(false);
        setStep(totalSteps);
      }, 1000);
      return;
    }

    setStep((prev) => Math.min(prev + 1, totalSteps - 1));
  }, [step, save, isLastStep]);

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
        isNextRef.current = true;
        setStep((prev) => Math.min(prev + 1, totalSteps - 1));

        setTimeout(() => {
          lock.current = false;
        }, 500);
      }
    };

    window.addEventListener("wheel", handleWheel);
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    const savedStep = localStorage.getItem(STEP_KEY);
    if (savedStep) {
      setStep(parseInt(savedStep));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STEP_KEY, step.toString());
  }, [step]);

  const handlePrev = useCallback(() => {
    isNextRef.current = false;
    setStep((prev) => Math.max(prev - 1, 0));
  }, [setStep]);

  return { step, submitLoading, handleNext, setStep, handlePrev, isNextRef };
};
